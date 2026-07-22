// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * PDF rasterisation via pdf.js (runs in its own bundled worker).
 *
 * Pages are drawn at a width suited to OCR (~200 dpi for a letter page).
 * `intent: 'print'` makes pdf.js schedule paint chunks via microtasks instead
 * of requestAnimationFrame — which never fires in a backgrounded tab and
 * would otherwise hang rendering mid-job.
 */

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** Target render width for OCR input. */
const TARGET_WIDTH = 2200;
const MAX_HEIGHT = 4400;

export interface PdfDocHandle {
  numPages: number;
  renderPage(pageIndex: number): Promise<HTMLCanvasElement>;
  destroy(): void;
}

export class PdfPasswordError extends Error {
  constructor(filename: string) {
    super(`"${filename}" is password-protected. Unlock it first, then try again.`);
    this.name = 'PdfPasswordError';
  }
}

export async function openPdf(bytes: ArrayBuffer, filename: string): Promise<PdfDocHandle> {
  const task = pdfjsLib.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
  });
  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await task.promise;
  } catch (err) {
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'PasswordException') {
      throw new PdfPasswordError(filename);
    }
    throw err;
  }

  return {
    numPages: pdf.numPages,
    async renderPage(pageIndex: number): Promise<HTMLCanvasElement> {
      const page = await pdf.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      let scale = TARGET_WIDTH / base.width;
      if (base.height * scale > MAX_HEIGHT) scale = MAX_HEIGHT / base.height;
      scale = Math.max(scale, 0.1);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create a 2D canvas context.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
      page.cleanup();
      return canvas;
    },
    destroy() {
      void pdf.destroy();
    },
  };
}

/** Cheap page count for staging (parses the PDF in the pdf.js worker). */
export async function pdfPageCountOf(bytes: ArrayBuffer, filename: string): Promise<number> {
  const handle = await openPdf(bytes, filename);
  const n = handle.numPages;
  handle.destroy();
  return n;
}

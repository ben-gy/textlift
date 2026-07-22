// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Input sniffing and image rasterisation. */

export type InputKind = 'pdf' | 'image' | 'unsupported';

/** Longest side we feed Tesseract — bigger wastes time, smaller loses glyphs. */
export const MAX_DIM = 3000;

const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/gif',
]);

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']);

/** "%PDF-" — the PDF header may sit after a small amount of junk. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function hasPdfMagic(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 1024) - PDF_MAGIC.length;
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < PDF_MAGIC.length; j++) {
      if (bytes[i + j] !== PDF_MAGIC[j]) continue outer;
    }
    return true;
  }
  return false;
}

function extension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Decide what a file is. Magic bytes beat MIME beat extension — browsers
 * report unreliable MIME types for drag-dropped files.
 */
export function sniffKind(name: string, mime: string, head: Uint8Array): InputKind {
  if (head.length > 0 && hasPdfMagic(head)) return 'pdf';
  const normalizedMime = (mime || '').toLowerCase();
  if (normalizedMime === 'application/pdf' && head.length === 0) return 'pdf';
  if (IMAGE_MIMES.has(normalizedMime)) return 'image';
  if (IMAGE_EXTS.has(extension(name))) return 'image';
  return 'unsupported';
}

/** Fit (w, h) inside a square of side `max`, never upscaling. */
export function fitWithin(
  w: number,
  h: number,
  max: number,
): { w: number; h: number; scale: number } {
  if (w <= 0 || h <= 0) return { w: 1, h: 1, scale: 1 };
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/** Decode an image file to a canvas, downscaling huge photos for OCR. */
export async function imageToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  try {
    const { w, h } = fitWithin(bmp.width, bmp.height, MAX_DIM);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not create a 2D canvas context.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return canvas;
  } finally {
    bmp.close();
  }
}

/** Read just the first KB of a file for magic-byte sniffing. */
export async function readHead(file: File): Promise<Uint8Array> {
  const buf = await file.slice(0, 1024).arrayBuffer();
  return new Uint8Array(buf);
}

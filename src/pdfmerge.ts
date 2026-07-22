// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Merge the single-page searchable PDFs that Tesseract produces into one
 * document, using pdf-lib. Runs on the main thread — page counts are small
 * and pdf-lib copy is fast; the heavy OCR already happened in the worker.
 */

import { PDFDocument } from 'pdf-lib';

export async function mergePdfPages(
  pageBytes: Uint8Array[],
  title = 'Textlift OCR output',
): Promise<Uint8Array> {
  if (pageBytes.length === 0) {
    throw new Error('No pages to merge.');
  }
  const out = await PDFDocument.create();
  out.setTitle(title);
  // pdf-lib stamps its own Producer on save(); Creator is ours to set.
  out.setCreator('Textlift (textlift.benrichardson.dev) · Tesseract OCR in-browser');
  for (const bytes of pageBytes) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  return out.save();
}

/** Count pages of a PDF byte buffer (used by tests and sanity checks). */
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

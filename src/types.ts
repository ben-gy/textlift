// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Shared types for the Textlift pipeline. */

export type AppPhase = 'empty' | 'staged' | 'running' | 'done' | 'error';

/** A staged input file, sniffed and page-counted, awaiting OCR. */
export interface SourceDoc {
  id: number;
  file: File;
  kind: 'image' | 'pdf';
  pageCount: number;
  size: number;
}

/** The OCR result for a single page (an image, or one page of a PDF). */
export interface PageResult {
  /** 0-based index across the whole job. */
  index: number;
  sourceName: string;
  /** Human label, e.g. "receipt.jpg" or "scan.pdf — page 3". */
  pageLabel: string;
  text: string;
  /** Tesseract mean confidence, 0–100. */
  confidence: number;
  /** Single-page searchable PDF produced by Tesseract, if available. */
  pdf: Uint8Array | null;
  /** Small JPEG data-URL preview of the page. */
  thumb: string | null;
}

export interface JobSummary {
  pages: number;
  words: number;
  chars: number;
  avgConfidence: number;
  elapsedMs: number;
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Tesseract worker lifecycle.
 *
 * Tesseract.js spawns its own dedicated Web Worker; every asset it needs —
 * worker script, WASM core, English traineddata — is self-hosted under this
 * origin (see vite.config.ts). Extra languages come from jsDelivr and are
 * cached in IndexedDB by Tesseract itself.
 */

import { createWorker, OEM, type Worker as TesseractWorker } from 'tesseract.js';
import { simd } from 'wasm-feature-detect';
import { langPathFor } from './langs';

export interface OcrProgress {
  /** Tesseract status string, e.g. "recognizing text". */
  status: string;
  /** 0–1 within the current status. */
  progress: number;
}

let worker: TesseractWorker | null = null;
let workerLang: string | null = null;

// The logger callback is fixed at worker creation, so route through a
// mutable handler that each run swaps in.
let progressHandler: ((p: OcrProgress) => void) | null = null;

export function setProgressHandler(fn: ((p: OcrProgress) => void) | null): void {
  progressHandler = fn;
}

/** Get (or create) a worker initialised for `lang`. Reused across runs. */
export async function getOcrWorker(lang: string): Promise<TesseractWorker> {
  if (worker && workerLang === lang) return worker;
  await disposeWorker();

  const simdOk = await simd().catch(() => false);
  const corePath = simdOk
    ? '/tesseract-core/tesseract-core-simd-lstm.wasm.js'
    : '/tesseract-core/tesseract-core-lstm.wasm.js';

  const w = await createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: '/tesseract/worker.min.js',
    corePath,
    langPath: langPathFor(lang),
    logger: (m: { status: string; progress: number }) => {
      progressHandler?.({ status: m.status, progress: m.progress });
    },
    errorHandler: () => {
      // Non-fatal internal worker chatter; real failures reject the API call.
    },
  });
  worker = w;
  workerLang = lang;
  return w;
}

export interface PageRecognition {
  text: string;
  confidence: number;
  pdf: Uint8Array | null;
}

/** OCR a single rasterised page. */
export async function recognizePage(
  w: TesseractWorker,
  image: Blob,
  pdfTitle: string,
): Promise<PageRecognition> {
  const { data } = await w.recognize(image, { pdfTitle }, { text: true, pdf: true });
  return {
    text: data.text ?? '',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    pdf: data.pdf ? new Uint8Array(data.pdf) : null,
  };
}

export async function disposeWorker(): Promise<void> {
  if (worker) {
    const w = worker;
    worker = null;
    workerLang = null;
    try {
      await w.terminate();
    } catch {
      // Worker already gone — nothing to clean up.
    }
  }
}

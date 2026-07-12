/**
 * The OCR job pipeline: sources → rasterised pages → Tesseract → results.
 *
 * Pages are rasterised lazily, one at a time, and each canvas is released as
 * soon as its page is recognised — a 60-page scan never holds 60 full-size
 * bitmaps in memory. Only text, a small thumbnail and the per-page searchable
 * PDF bytes are kept.
 */

import { emit } from './eventlog';
import { imageToCanvas } from './ingest';
import { getOcrWorker, recognizePage, setProgressHandler } from './ocr';
import { openPdf } from './pdfrender';
import type { PageResult, SourceDoc } from './types';

export interface RunCallbacks {
  /** Called as the job moves through pages. `pageFraction` is 0–1 within the current page. */
  onProgress(pagesDone: number, totalPages: number, pageFraction: number, label: string): void;
  /** Human status line, e.g. "Downloading French language model…". */
  onStatus(msg: string): void;
  /** A page finished (successfully or not). */
  onPageDone(result: PageResult): void;
}

export interface CancelToken {
  cancelled: boolean;
}

const THUMB_WIDTH = 220;

function makeThumb(canvas: HTMLCanvasElement): string | null {
  try {
    const scale = THUMB_WIDTH / canvas.width;
    const t = document.createElement('canvas');
    t.width = THUMB_WIDTH;
    t.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = t.getContext('2d', { alpha: false });
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, t.width, t.height);
    ctx.drawImage(canvas, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('Could not encode a page bitmap.'));
    }, 'image/png');
  });
}

/** Friendly rewrite of Tesseract's internal status strings. */
function statusLabel(status: string, lang: string): string {
  switch (status) {
    case 'loading tesseract core':
      return 'Loading the OCR engine (WebAssembly)…';
    case 'initializing tesseract':
    case 'initializing api':
      return 'Starting the OCR engine…';
    case 'loading language traineddata':
      return lang === 'eng'
        ? 'Loading the English language model…'
        : 'Downloading the language model (first use only)…';
    case 'recognizing text':
      return 'Recognising text…';
    default:
      return `${status}…`;
  }
}

export async function runJob(
  sources: SourceDoc[],
  lang: string,
  cb: RunCallbacks,
  cancel: CancelToken,
): Promise<PageResult[]> {
  const totalPages = sources.reduce((n, s) => n + s.pageCount, 0);
  const results: PageResult[] = [];
  let pagesDone = 0;

  let currentLabel = '';

  emit('ocr', 'info', `Job started: ${sources.length} file(s), ${totalPages} page(s), lang=${lang}`);

  setProgressHandler((p) => {
    cb.onStatus(statusLabel(p.status, lang));
    if (p.status === 'recognizing text') {
      cb.onProgress(pagesDone, totalPages, p.progress, currentLabel);
    }
  });

  try {
    const worker = await getOcrWorker(lang);
    emit('ocr', 'ok', 'Tesseract worker ready', { lang });

    for (const source of sources) {
      if (cancel.cancelled) break;

      if (source.kind === 'image') {
        currentLabel = source.file.name;
        cb.onProgress(pagesDone, totalPages, 0, currentLabel);
        const result = await ocrOneCanvas(
          () => imageToCanvas(source.file),
          source,
          currentLabel,
          results.length,
          worker,
        );
        results.push(result);
        pagesDone += 1;
        cb.onPageDone(result);
        cb.onProgress(pagesDone, totalPages, 0, currentLabel);
      } else {
        const bytes = await source.file.arrayBuffer();
        const doc = await openPdf(bytes, source.file.name);
        emit('pdf', 'info', `Opened ${source.file.name}`, { pages: doc.numPages });
        try {
          for (let i = 0; i < doc.numPages; i++) {
            if (cancel.cancelled) break;
            currentLabel =
              doc.numPages === 1 ? source.file.name : `${source.file.name} — page ${i + 1}`;
            cb.onProgress(pagesDone, totalPages, 0, currentLabel);
            const result = await ocrOneCanvas(
              () => doc.renderPage(i),
              source,
              currentLabel,
              results.length,
              worker,
            );
            results.push(result);
            pagesDone += 1;
            cb.onPageDone(result);
            cb.onProgress(pagesDone, totalPages, 0, currentLabel);
          }
        } finally {
          doc.destroy();
        }
      }
    }
  } finally {
    setProgressHandler(null);
  }

  if (cancel.cancelled) {
    emit('ocr', 'warn', `Job cancelled after ${pagesDone}/${totalPages} page(s)`);
  } else {
    emit('ocr', 'ok', `Job complete: ${pagesDone} page(s)`);
  }
  return results;
}

async function ocrOneCanvas(
  raster: () => Promise<HTMLCanvasElement>,
  source: SourceDoc,
  label: string,
  index: number,
  worker: Awaited<ReturnType<typeof getOcrWorker>>,
): Promise<PageResult> {
  const started = performance.now();
  try {
    const canvas = await raster();
    const thumb = makeThumb(canvas);
    const blob = await canvasToBlob(canvas);
    releaseCanvas(canvas);
    const rec = await recognizePage(worker, blob, label);
    const ms = Math.round(performance.now() - started);
    emit('ocr', 'ok', `Recognised ${label}`, {
      confidence: Math.round(rec.confidence),
      ms,
    });
    return {
      index,
      sourceName: source.file.name,
      pageLabel: label,
      text: rec.text,
      confidence: rec.confidence,
      pdf: rec.pdf,
      thumb,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit('ocr', 'err', `Failed on ${label}: ${msg}`);
    return {
      index,
      sourceName: source.file.name,
      pageLabel: label,
      text: '',
      confidence: 0,
      pdf: null,
      thumb: null,
    };
  }
}

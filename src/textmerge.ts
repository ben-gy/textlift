/** Combining per-page OCR text into a single document. */

import { countWords } from './format';

export interface PageText {
  pageLabel: string;
  text: string;
}

/**
 * Tidy raw Tesseract output: trim trailing whitespace per line and collapse
 * runs of 3+ blank lines down to one blank line.
 */
export function normalizeText(raw: string): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const trimmed = lines.map((l) => l.replace(/[ \t]+$/g, ''));
  const out: string[] = [];
  let blanks = 0;
  for (const line of trimmed) {
    if (line === '') {
      blanks += 1;
      if (blanks <= 1) out.push(line);
    } else {
      blanks = 0;
      out.push(line);
    }
  }
  // strip leading/trailing blank lines
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

export function pageHeader(label: string, index: number, total: number): string {
  return `───── Page ${index + 1} of ${total} · ${label} ─────`;
}

/**
 * Combine page texts. A single page returns its text plainly; multiple pages
 * are separated by readable headers.
 */
export function combineText(pages: PageText[]): string {
  if (pages.length === 0) return '';
  if (pages.length === 1) return normalizeText(pages[0].text);
  const parts = pages.map((p, i) =>
    `${pageHeader(p.pageLabel, i, pages.length)}\n\n${normalizeText(p.text)}`,
  );
  return parts.join('\n\n');
}

export function textStats(pages: PageText[]): { words: number; chars: number } {
  let words = 0;
  let chars = 0;
  for (const p of pages) {
    const t = normalizeText(p.text);
    words += countWords(t);
    chars += t.length;
  }
  return { words, chars };
}

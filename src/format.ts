// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Pure formatting / filename helpers. */

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n;
  let u = -1;
  do {
    v /= 1024;
    u += 1;
  } while (v >= 1024 && u < units.length - 1);
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Strip the extension from a filename. "scan.v2.pdf" becomes "scan.v2". */
export function stripExtension(name: string): string {
  const trimmed = name.trim();
  const i = trimmed.lastIndexOf('.');
  if (i <= 0) return trimmed; // no ext, or dotfile like ".env"
  return trimmed.slice(0, i);
}

/** Make a string safe to use as a download filename. */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'textlift';
}

/**
 * Base name for output files: single input keeps its own name,
 * multiple inputs fall back to "textlift".
 */
export function outputBaseName(sourceNames: string[]): string {
  if (sourceNames.length === 1) {
    return sanitizeFilename(stripExtension(sourceNames[0]));
  }
  return 'textlift';
}

export function countWords(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

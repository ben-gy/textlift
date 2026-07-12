import { describe, expect, it } from 'vitest';
import {
  countWords,
  formatBytes,
  formatDuration,
  outputBaseName,
  sanitizeFilename,
  stripExtension,
} from '../src/format';

describe('formatBytes', () => {
  it('formats bytes below 1 KB verbatim', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KB and MB with one decimal', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });

  it('drops decimals at 100+ of a unit', () => {
    expect(formatBytes(150 * 1024)).toBe('150 KB');
  });

  it('handles invalid input', () => {
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(Number.NaN)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(9200)).toBe('9s');
  });

  it('formats minutes with padded seconds', () => {
    expect(formatDuration(61_000)).toBe('1m 01s');
    expect(formatDuration(600_000)).toBe('10m 00s');
  });

  it('handles invalid input', () => {
    expect(formatDuration(-5)).toBe('—');
  });
});

describe('stripExtension', () => {
  it('strips a simple extension', () => {
    expect(stripExtension('receipt.jpg')).toBe('receipt');
  });

  it('keeps earlier dots', () => {
    expect(stripExtension('scan.v2.pdf')).toBe('scan.v2');
  });

  it('leaves extensionless names and dotfiles alone', () => {
    expect(stripExtension('README')).toBe('README');
    expect(stripExtension('.env')).toBe('.env');
  });
});

describe('sanitizeFilename', () => {
  it('replaces illegal filesystem characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('collapses whitespace and trims', () => {
    expect(sanitizeFilename('  my   scan  ')).toBe('my scan');
  });

  it('falls back for empty input', () => {
    expect(sanitizeFilename('')).toBe('textlift');
    expect(sanitizeFilename('   ')).toBe('textlift');
  });

  it('caps very long names at 120 chars', () => {
    expect(sanitizeFilename('x'.repeat(500)).length).toBe(120);
  });
});

describe('outputBaseName', () => {
  it('uses the single source name without extension', () => {
    expect(outputBaseName(['invoice-march.pdf'])).toBe('invoice-march');
  });

  it('falls back to textlift for multiple sources', () => {
    expect(outputBaseName(['a.png', 'b.png'])).toBe('textlift');
  });

  it('falls back to textlift for zero sources', () => {
    expect(outputBaseName([])).toBe('textlift');
  });
});

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('hello   world\nfoo\tbar')).toBe(4);
  });

  it('returns 0 for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t ')).toBe(0);
  });
});

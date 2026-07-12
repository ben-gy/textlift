import { describe, expect, it } from 'vitest';
import { fitWithin, hasPdfMagic, sniffKind } from '../src/ingest';

const PDF_HEAD = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ');
const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('hasPdfMagic', () => {
  it('detects a clean PDF header', () => {
    expect(hasPdfMagic(PDF_HEAD)).toBe(true);
  });

  it('detects a header preceded by junk bytes', () => {
    const junk = new Uint8Array(64).fill(0x20);
    const buf = new Uint8Array([...junk, ...PDF_HEAD]);
    expect(hasPdfMagic(buf)).toBe(true);
  });

  it('rejects non-PDF bytes', () => {
    expect(hasPdfMagic(PNG_HEAD)).toBe(false);
  });

  it('rejects empty and truncated buffers', () => {
    expect(hasPdfMagic(new Uint8Array(0))).toBe(false);
    expect(hasPdfMagic(new TextEncoder().encode('%PDF'))).toBe(false);
  });

  it('ignores a header beyond the first KB', () => {
    const far = new Uint8Array(2048);
    far.set(PDF_HEAD, 1500);
    expect(hasPdfMagic(far)).toBe(false);
  });
});

describe('sniffKind', () => {
  it('classifies by PDF magic regardless of name or MIME', () => {
    expect(sniffKind('weird.bin', 'application/octet-stream', PDF_HEAD)).toBe('pdf');
  });

  it('classifies images by MIME', () => {
    expect(sniffKind('photo', 'image/jpeg', PNG_HEAD)).toBe('image');
    expect(sniffKind('shot', 'image/webp', new Uint8Array([1, 2, 3]))).toBe('image');
  });

  it('falls back to extension when MIME is missing', () => {
    expect(sniffKind('scan.PNG', '', PNG_HEAD)).toBe('image');
    expect(sniffKind('pic.jpeg', '', new Uint8Array([1]))).toBe('image');
  });

  it('rejects unsupported types', () => {
    expect(sniffKind('notes.txt', 'text/plain', new TextEncoder().encode('hello'))).toBe(
      'unsupported',
    );
    expect(sniffKind('archive.zip', 'application/zip', new Uint8Array([0x50, 0x4b]))).toBe(
      'unsupported',
    );
  });

  it('rejects TIFF and SVG (not OCR-safe inputs)', () => {
    expect(sniffKind('scan.tiff', 'image/tiff', new Uint8Array([0x49, 0x49]))).toBe('unsupported');
    expect(sniffKind('logo.svg', 'image/svg+xml', new TextEncoder().encode('<svg'))).toBe(
      'unsupported',
    );
  });
});

describe('fitWithin', () => {
  it('never upscales', () => {
    expect(fitWithin(800, 600, 3000)).toEqual({ w: 800, h: 600, scale: 1 });
  });

  it('downscales the longest side to the cap', () => {
    const r = fitWithin(6000, 3000, 3000);
    expect(r.w).toBe(3000);
    expect(r.h).toBe(1500);
    expect(r.scale).toBeCloseTo(0.5);
  });

  it('handles portrait orientation', () => {
    const r = fitWithin(2000, 8000, 4000);
    expect(r.h).toBe(4000);
    expect(r.w).toBe(1000);
  });

  it('guards degenerate dimensions', () => {
    expect(fitWithin(0, 0, 3000)).toEqual({ w: 1, h: 1, scale: 1 });
    expect(fitWithin(-5, 10, 3000)).toEqual({ w: 1, h: 1, scale: 1 });
  });

  it('never returns a zero dimension for extreme aspect ratios', () => {
    const r = fitWithin(100_000, 1, 3000);
    expect(r.w).toBe(3000);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });
});

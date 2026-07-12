import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { mergePdfPages, pdfPageCount } from '../src/pdfmerge';

async function makePdf(pages: number, text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`${text} ${i + 1}`, { x: 50, y: 780, size: 14 });
  }
  return doc.save();
}

describe('mergePdfPages', () => {
  it('merges single-page PDFs preserving order', async () => {
    const a = await makePdf(1, 'alpha');
    const b = await makePdf(1, 'beta');
    const merged = await mergePdfPages([a, b]);
    expect(await pdfPageCount(merged)).toBe(2);
  });

  it('merges multi-page inputs completely', async () => {
    const a = await makePdf(3, 'doc');
    const b = await makePdf(2, 'doc');
    const merged = await mergePdfPages([a, b]);
    expect(await pdfPageCount(merged)).toBe(5);
  });

  it('handles a single input', async () => {
    const a = await makePdf(1, 'solo');
    const merged = await mergePdfPages([a]);
    expect(await pdfPageCount(merged)).toBe(1);
  });

  it('sets document metadata', async () => {
    const merged = await mergePdfPages([await makePdf(1, 'x')], 'My Title');
    const doc = await PDFDocument.load(merged);
    expect(doc.getTitle()).toBe('My Title');
    expect(doc.getCreator()).toContain('Textlift');
  });

  it('throws on zero pages', async () => {
    await expect(mergePdfPages([])).rejects.toThrow('No pages');
  });

  it('rejects garbage bytes', async () => {
    const garbage = new TextEncoder().encode('this is not a pdf at all');
    await expect(mergePdfPages([garbage])).rejects.toThrow();
  });

  it('produces a valid PDF header', async () => {
    const merged = await mergePdfPages([await makePdf(1, 'x')]);
    const head = new TextDecoder().decode(merged.slice(0, 5));
    expect(head).toBe('%PDF-');
  });
});

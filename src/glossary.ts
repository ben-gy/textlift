// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Click-to-define glossary tooltips for technical terms in the UI. */

export interface GlossaryEntry {
  title: string;
  body: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  ocr: {
    title: 'OCR',
    body: 'Optical Character Recognition — software that looks at the pixels of an image and works out which letters and words they form.',
  },
  tesseract: {
    title: 'Tesseract',
    body: 'An open-source OCR engine started at HP in the 1980s, later developed by Google. Textlift runs it compiled to WebAssembly, entirely inside your browser.',
  },
  wasm: {
    title: 'WebAssembly',
    body: 'A fast, sandboxed binary format browsers can execute. It lets native-grade code — like a full OCR engine — run safely inside a web page, with no install and no server.',
  },
  worker: {
    title: 'Web Worker',
    body: 'A background thread in your browser. The OCR engine runs there so the page stays responsive while pages are being recognised.',
  },
  lstm: {
    title: 'LSTM',
    body: 'Long Short-Term Memory — the type of neural network Tesseract uses to read lines of text. It processes each text line as a sequence, like reading.',
  },
  'searchable-pdf': {
    title: 'Searchable PDF',
    body: 'A PDF that shows the original scanned image but has an invisible text layer underneath, so you can select, copy and search the text in any PDF viewer.',
  },
  pdfjs: {
    title: 'pdf.js',
    body: "Mozilla's open-source PDF renderer — the engine Firefox uses to display PDFs. Textlift uses it to draw each PDF page to a bitmap for the OCR engine.",
  },
  confidence: {
    title: 'Confidence',
    body: "Tesseract's own 0–100 estimate of how sure it is about the recognised text. Below ~70 usually means a blurry, skewed or low-resolution source.",
  },
  traineddata: {
    title: 'Language model',
    body: 'The trained recognition data for one language (a ".traineddata" file). English ships with Textlift; other languages are downloaded once from a CDN and cached on your device.',
  },
};

/** Wire up click-to-define behaviour. Returns dispose. */
export function mountGlossary(tip: HTMLElement): () => void {
  let openFor: HTMLElement | null = null;

  const hide = () => {
    tip.hidden = true;
    openFor = null;
  };

  const onClick = (ev: MouseEvent) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>('.glossary-link');
    if (!target) {
      if (!tip.contains(ev.target as Node)) hide();
      return;
    }
    ev.preventDefault();
    if (openFor === target) {
      hide();
      return;
    }
    const term = target.dataset.term ?? '';
    const entry = GLOSSARY[term];
    if (!entry) return;
    tip.innerHTML = '';
    const h = document.createElement('strong');
    h.textContent = entry.title;
    const p = document.createElement('p');
    p.textContent = entry.body;
    tip.appendChild(h);
    tip.appendChild(p);
    tip.hidden = false;
    openFor = target;

    const r = target.getBoundingClientRect();
    const tw = Math.min(320, window.innerWidth - 24);
    tip.style.maxWidth = `${tw}px`;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - tw - 12));
    tip.style.left = `${left}px`;
    const top = r.bottom + 8;
    tip.style.top =
      top + 140 > window.innerHeight ? `${Math.max(12, r.top - 8 - 140)}px` : `${top}px`;
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && !tip.hidden) hide();
  };

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
  };
}

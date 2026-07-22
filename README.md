# textlift

**Extract text from images, screenshots and scanned PDFs entirely in your browser — no uploads, ever.**

Live: https://textlift.benrichardson.dev

---

## what it is

Textlift is OCR without the upload. Drop in a photo of a receipt, a screenshot of an
error message, or a scanned contract — and get selectable, copyable text back, plus an
optional **searchable PDF** (the original pixels with an invisible text layer, so any
PDF viewer can select and Cmd/Ctrl+F it).

Everything runs inside the tab. The OCR engine is [Tesseract](https://github.com/tesseract-ocr/tesseract)
compiled to WebAssembly, executing in a dedicated Web Worker. There is no upload
endpoint anywhere in the app — which matters, because the documents people OCR are
disproportionately sensitive: IDs, invoices, prescriptions, contracts.

It reads printed text in 16 languages. Handwriting is not supported (a Tesseract
limitation, stated plainly in the UI).

## how it works

```
image / screenshot / PDF
        │
        ├── PDFs: pdf.js rasterises each page to a canvas (own worker, print intent)
        ├── images: decoded via createImageBitmap, downscaled if > 3000 px
        │
        ▼
canvas → PNG blob → Tesseract.js worker (WASM, LSTM, self-hosted core + traineddata)
        │
        ├── per-page text + confidence
        └── per-page single-page searchable PDF
                 │
                 ▼
combined .txt (page headers) · merged searchable .pdf (pdf-lib) · clipboard · Web Share
```

Pages are rasterised lazily and each full-size canvas is released as soon as its page
is recognised, so a 100-page scan never holds 100 bitmaps in memory.

The entire Tesseract stack is **self-hosted**: `worker.min.js`, the SIMD + non-SIMD
WASM cores, and the English traineddata are all served from this origin and precached
by the service worker — English OCR works fully offline. Choosing another language
fetches its model once from jsDelivr and caches it in IndexedDB.

## browser APIs used

- **WebAssembly (SIMD)** — the Tesseract OCR engine; SIMD/non-SIMD core chosen at runtime via `wasm-feature-detect`
- **Web Workers** — Tesseract and pdf.js each run in their own worker; the main thread only paints progress
- **Canvas 2D / createImageBitmap** — rasterising inputs and downscaling huge photos
- **Clipboard API** — paste a screenshot straight in (Cmd/Ctrl+V), copy the text out
- **IndexedDB** — Tesseract's cache for downloaded language models
- **Web Share API** — share the extracted text on mobile
- **Service Worker (PWA)** — full offline operation after first load (English)

## security / privacy model

**Protected**
- Images and PDFs — opened and processed entirely in the tab; no upload endpoint exists
- Extracted text and searchable PDFs — generated and downloaded locally
- English OCR works with the network disconnected

**Not protected**
- Picking a non-English language downloads that model once from jsDelivr (they see your IP and the language code, never your files or text)
- What you do with the output after download

**Trust model**
- The static bundle served over GitHub Pages TLS
- Tesseract.js, pdf.js and pdf-lib compiled into that bundle
- jsDelivr CDN, only for optional extra language models
- A Cloudflare Web Analytics beacon records anonymous page views — no cookies, no fingerprinting, no cross-site tracking; files/data are never sent to it

## stack

- Vite 6 + vanilla TypeScript
- tesseract.js 7 (WASM core + English traineddata self-hosted at build time)
- pdfjs-dist 4 (page rasterisation), pdf-lib (searchable-PDF merge)
- Vitest for unit tests (66 tests)
- GitHub Pages for hosting, deployed via GitHub Actions

No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view
counts via Cloudflare Web Analytics — no personal data, no cross-site tracking.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and
deploys `dist/` to GitHub Pages. The custom domain is set via `public/CNAME` — point a
`CNAME` DNS record for `textlift.benrichardson.dev` at `ben-gy.github.io`.

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).

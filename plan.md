# Tool Plan: Textlift

## Overview
- **Name:** Textlift
- **Repo name:** textlift
- **Tagline:** Extract text from images, screenshots and scanned PDFs entirely in your browser — no uploads, ever.

## Problem It Solves
Someone has a photo of a receipt, a screenshot of an error message, a scanned contract, or a photographed whiteboard — and they need the *text*. They Google "image to text", "extract text from screenshot" or "OCR scanned PDF free" and land on upload-based services that are ad-riddled, rate-limited, and quietly ingest their documents (which are often IDs, medical records, invoices, contracts). Textlift does the OCR locally with Tesseract compiled to WebAssembly: drop an image or PDF, get selectable text and an optionally searchable PDF, and nothing ever leaves the device.

## Why This Must Be Client-Side
- **Privacy / sensitive-data handling:** OCR inputs are disproportionately sensitive — passports, invoices, prescriptions, contracts. Local processing removes the trust question entirely.
- **Cost-avoidance & no-account friction:** server OCR costs money, so upload tools gate with accounts, quotas and watermarks. WASM OCR is free and unlimited.
- **Offline:** once loaded (English ships with the app), it works on a plane.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| Tesseract.js v7 (WASM, own Web Worker) | The OCR engine — LSTM recognition, 100+ languages | N/A — hard requirement (WASM is universal) |
| pdfjs-dist (own Web Worker) | Render scanned-PDF pages to bitmaps for OCR | PDFs unsupported → images still work |
| pdf-lib | Merge per-page searchable PDFs from Tesseract into one output | Searchable-PDF output hidden, text still works |
| Canvas 2D / createImageBitmap | Rasterise inputs, downscale huge photos before OCR | N/A — universal |
| Clipboard API (paste + copy) | Paste a screenshot straight in; copy extracted text out | Buttons hidden if unavailable |
| IndexedDB (via Tesseract cacheMethod) | Cache downloaded language models | Re-downloads per session |
| Web Share API | Share .txt / .pdf output on mobile | Button hidden |
| Service Worker (PWA) | Full offline after first load (English) | Online-only |

## Workflow (input → process → output)
1. User drags in / picks / **pastes** an image (PNG, JPG, WebP, BMP, GIF) or a PDF; multiple images allowed.
2. Tesseract worker OCRs each page/image with determinate progress (page i/N + % within page, live status line). PDFs are rasterised page-by-page via pdf.js first.
3. User gets: extracted text per page + combined (copy, download .txt, Web Share), and for PDFs/images a **searchable PDF** (original pixels with an invisible text layer).

## Non-Goals
- No handwriting recognition (Tesseract is print-only — say so in the UI).
- No camera capture v1 (paste + file pick cover it; qrforge owns live camera).
- No HEIC input v1 (point users to unheic).
- No batch ZIP export v1.
- No cloud sync, no accounts, ever.

## Target Audience
Ordinary people with a document problem: the office manager retyping a scanned invoice at 4:55pm, the student with a photographed textbook page, the developer grabbing text from an error-message screenshot. Non-technical majority — nervous about uploading documents that have their name, address and bank details on them.

## Style Direction
**Tone:** friendly-professional, reassuring
**Colour palette:** light, warm paper-white surfaces with a single deep-teal accent — evokes clean documents and trust, not hacker-terminal
**UI density:** spacious
**Dark/light theme:** light (consumer audience), with `color-scheme` respecting dark for system chrome
**Reference tools for feel:** Squoosh (drop-zone-first, instant), PDF24 (plain-spoken utility)

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite (single-view workflow; no React needed)
- **Key libraries:** tesseract.js ^7, pdfjs-dist ^4, pdf-lib ^1.17, vite-plugin-static-copy (self-host Tesseract worker/core/eng at build time)
- **Worker strategy:** Tesseract.js spawns its own dedicated worker (self-hosted `worker.min.js` + core WASM); pdf.js uses its own bundled worker. Main thread only orchestrates + paints progress.
- **Storage:** IndexedDB for cached language models (Tesseract default cache); localStorage for last-used language + settings only.
- **Assets:** English traineddata self-hosted from `@tesseract.js-data/eng` npm package (copied to `/tessdata/` at build) → core tool is fully same-origin/offline. Other languages fetched on demand from jsDelivr (`@tesseract.js-data/*`), cached in IndexedDB — explicitly disclosed in the Threat Model.

## Privacy & Trust Model
**Protected**
- Images and PDFs never leave the device — no upload endpoint exists.
- Extracted text never leaves the device.
- English OCR works fully offline after first load.

**Not protected**
- Choosing a non-English language triggers one download of that language model from jsDelivr's CDN (jsDelivr sees your IP + which language, never your files).
- The Cloudflare Web Analytics beacon records an anonymous page view.

**Trust surface**
- The static site bundle served over GitHub Pages TLS.
- Tesseract.js / pdf.js / pdf-lib code compiled into that bundle.
- jsDelivr CDN for optional extra language models.
- A Cloudflare Web Analytics beacon records anonymous page views — no cookies, no fingerprinting, no cross-site tracking; your files/data are never sent to it.

## UX Required Surfaces
- Drop zone: drag-drop, click-to-pick, **Cmd/Ctrl+V paste-a-screenshot**, keyboard accessible
- Determinate progress: per-page bar + "Page 2 of 5 — recognising 63%" + elapsed
- Event log drawer (Dropwell pattern)
- How-It-Works modal (drop → rasterise → Tesseract WASM → text/PDF, 5 steps)
- Threat Model modal (Protected / Not protected / Trust surface incl. beacon + jsDelivr disclosure)
- About modal: benrichardson.dev, hub.benrichardson.dev, source repo link
- Output: copy text, download .txt, download searchable .pdf, Web Share
- Language picker (12 common languages; eng bundled, rest on-demand with size shown)
- Keyboard: Escape closes modals, Cmd/Ctrl+V pastes, Enter runs OCR when file staged
- Sticky footer: Built by benrichardson.dev · more tools & sites → hub.benrichardson.dev

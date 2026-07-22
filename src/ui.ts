// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * DOM rendering and interaction: dropzone, staging, progress, results,
 * modals, statusbar, toasts. Owns app state; delegates work to pipeline.ts.
 */

import { emit } from './eventlog';
import { formatBytes, formatDuration, outputBaseName } from './format';
import { readHead, sniffKind } from './ingest';
import { LANGS, labelFor, loadPreferredLang, savePreferredLang } from './langs';
import { mergePdfPages } from './pdfmerge';
import { PdfPasswordError, pdfPageCountOf } from './pdfrender';
import { runJob, type CancelToken } from './pipeline';
import { combineText, textStats } from './textmerge';
import type { AppPhase, JobSummary, PageResult, SourceDoc } from './types';

const MAX_PAGES = 100;
const ACCEPT = '.png,.jpg,.jpeg,.webp,.bmp,.gif,.pdf,image/png,image/jpeg,image/webp,image/bmp,image/gif,application/pdf';

interface State {
  phase: AppPhase;
  sources: SourceDoc[];
  lang: string;
  results: PageResult[];
  summary: JobSummary | null;
  error: string | null;
  // live progress
  progressLabel: string;
  progressStatus: string;
  progressFraction: number;
  runStartedAt: number;
}

const state: State = {
  phase: 'empty',
  sources: [],
  lang: loadPreferredLang(),
  results: [],
  summary: null,
  error: null,
  progressLabel: '',
  progressStatus: '',
  progressFraction: 0,
  runStartedAt: 0,
};

let mainEl: HTMLElement;
let nextSourceId = 1;
let cancelToken: CancelToken = { cancelled: false };
let elapsedTimer: number | null = null;

/* ────────────────────────────── mount ────────────────────────────── */

export function mountApp(main: HTMLElement): void {
  mainEl = main;
  render();
  wireModals();
  wireDrawerToggle();
  wirePaste();
  wireKeyboard();
  updateStatusbar();
  emit('system', 'ok', 'Textlift ready — files are processed on this device only');
}

/* ─────────────────────────── state moves ─────────────────────────── */

async function stageFiles(files: File[]): Promise<void> {
  if (state.phase === 'running') return;
  let added = 0;
  for (const file of files) {
    try {
      const head = await readHead(file);
      const kind = sniffKind(file.name, file.type, head);
      if (kind === 'unsupported') {
        toast(`"${file.name}" isn't a supported image or PDF — skipped.`);
        emit('ingest', 'warn', `Skipped unsupported file: ${file.name}`);
        continue;
      }
      let pageCount = 1;
      if (kind === 'pdf') {
        pageCount = await pdfPageCountOf(await file.arrayBuffer(), file.name);
      }
      const staged = state.sources.reduce((n, s) => n + s.pageCount, 0);
      if (staged + pageCount > MAX_PAGES) {
        toast(`Page limit is ${MAX_PAGES} per run — "${file.name}" not added.`);
        emit('ingest', 'warn', `Page cap hit (${MAX_PAGES}); rejected ${file.name}`);
        continue;
      }
      state.sources.push({
        id: nextSourceId++,
        file,
        kind,
        pageCount,
        size: file.size,
      });
      added += 1;
      emit('ingest', 'ok', `Staged ${file.name}`, {
        kind,
        pages: pageCount,
        size: formatBytes(file.size),
      });
    } catch (err) {
      const msg =
        err instanceof PdfPasswordError
          ? err.message
          : `Couldn't read "${file.name}" — it may be corrupted.`;
      toast(msg);
      emit('ingest', 'err', `Failed to stage ${file.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (added > 0 && (state.phase === 'empty' || state.phase === 'done' || state.phase === 'error')) {
    state.phase = 'staged';
    state.results = [];
    state.summary = null;
    state.error = null;
  }
  render();
  updateStatusbar();
}

async function startRun(): Promise<void> {
  if (state.phase !== 'staged' || state.sources.length === 0) return;
  state.phase = 'running';
  state.results = [];
  state.summary = null;
  state.error = null;
  state.progressFraction = 0;
  state.progressLabel = '';
  state.progressStatus = 'Starting…';
  state.runStartedAt = performance.now();
  cancelToken = { cancelled: false };
  savePreferredLang(state.lang);
  render();
  updateStatusbar();
  startElapsedTicker();

  try {
    const results = await runJob(
      state.sources,
      state.lang,
      {
        onProgress(pagesDone, total, pageFraction, label) {
          state.progressFraction = Math.min(1, (pagesDone + pageFraction) / total);
          state.progressLabel = label;
          paintProgress();
        },
        onStatus(msg) {
          state.progressStatus = msg;
          paintProgress();
        },
        onPageDone() {
          // progress paint already covers it
        },
      },
      cancelToken,
    );
    const elapsedMs = performance.now() - state.runStartedAt;
    state.results = results;
    const stats = textStats(results.map((r) => ({ pageLabel: r.pageLabel, text: r.text })));
    const withConf = results.filter((r) => r.text.trim().length > 0);
    state.summary = {
      pages: results.length,
      words: stats.words,
      chars: stats.chars,
      avgConfidence:
        withConf.length > 0
          ? withConf.reduce((n, r) => n + r.confidence, 0) / withConf.length
          : 0,
      elapsedMs,
    };
    state.phase = 'done';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.error =
      msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to load')
        ? `Couldn't load the OCR engine or language model. Check your connection and retry. (${msg})`
        : msg;
    state.phase = 'error';
    emit('system', 'err', `Run failed: ${msg}`);
  } finally {
    stopElapsedTicker();
  }
  render();
  updateStatusbar();
}

function cancelRun(): void {
  cancelToken.cancelled = true;
  state.progressStatus = 'Cancelling after this page…';
  paintProgress();
  emit('ui', 'warn', 'Cancel requested');
}

function resetAll(): void {
  state.phase = 'empty';
  state.sources = [];
  state.results = [];
  state.summary = null;
  state.error = null;
  render();
  updateStatusbar();
  emit('ui', 'info', 'Cleared — ready for a new job');
}

/* ────────────────────────────── render ───────────────────────────── */

function render(): void {
  switch (state.phase) {
    case 'empty':
      renderEmpty();
      break;
    case 'staged':
      renderStaged();
      break;
    case 'running':
      renderRunning();
      break;
    case 'done':
      renderDone();
      break;
    case 'error':
      renderError();
      break;
  }
}

function renderEmpty(): void {
  mainEl.innerHTML = `
    <section class="hero">
      <h1>Turn images and scans into text.</h1>
      <p class="hero-sub">
        Free <span class="glossary-link" data-term="ocr">OCR</span> that runs entirely in your
        browser. Photos, screenshots and scanned PDFs become selectable text and searchable
        PDFs — <strong>nothing is ever uploaded</strong>.
      </p>
      ${dropzoneHtml()}
      <div class="feature-chips" aria-hidden="true">
        <span class="chip">No uploads, no accounts</span>
        <span class="chip">Works offline (English)</span>
        <span class="chip">Searchable PDF output</span>
        <span class="chip">16 languages</span>
      </div>
    </section>
  `;
  wireDropzone();
}

function renderStaged(): void {
  const totalPages = state.sources.reduce((n, s) => n + s.pageCount, 0);
  const rows = state.sources
    .map(
      (s) => `
      <li class="file-row" data-id="${s.id}">
        <span class="file-kind">${s.kind === 'pdf' ? 'PDF' : 'IMG'}</span>
        <span class="file-name" title="${escapeAttr(s.file.name)}">${escapeHtml(s.file.name)}</span>
        <span class="file-meta">${s.pageCount} page${s.pageCount === 1 ? '' : 's'} · ${formatBytes(s.size)}</span>
        <button type="button" class="file-remove" data-remove="${s.id}" aria-label="Remove ${escapeAttr(s.file.name)}">×</button>
      </li>`,
    )
    .join('');

  mainEl.innerHTML = `
    <section class="stage">
      <h1 class="stage-title">Ready to extract</h1>
      <ul class="file-list">${rows}</ul>
      <div class="stage-controls">
        <button type="button" class="btn secondary" id="btn-add">+ Add more files</button>
        <label class="lang-label" for="lang-select">Language
          <select id="lang-select">${langOptions()}</select>
        </label>
      </div>
      <p class="lang-hint" id="lang-hint">${langHint()}</p>
      <button type="button" class="btn primary big" id="btn-run">
        Extract text from ${totalPages} page${totalPages === 1 ? '' : 's'} ↵
      </button>
      <p class="privacy-note">Processing happens on this device. Your files stay here.</p>
      ${hiddenInputHtml()}
    </section>
  `;

  mainEl.querySelector('#btn-run')?.addEventListener('click', () => void startRun());
  mainEl.querySelector('#btn-add')?.addEventListener('click', () => pickFiles());
  wireHiddenInput();
  const sel = mainEl.querySelector<HTMLSelectElement>('#lang-select');
  sel?.addEventListener('change', () => {
    state.lang = sel.value;
    savePreferredLang(state.lang);
    const hint = mainEl.querySelector('#lang-hint');
    if (hint) hint.textContent = langHint();
    updateStatusbar();
    emit('ui', 'info', `Language set to ${labelFor(state.lang)}`);
  });
  mainEl.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.remove);
      state.sources = state.sources.filter((s) => s.id !== id);
      if (state.sources.length === 0) state.phase = 'empty';
      render();
      updateStatusbar();
    });
  });
}

function renderRunning(): void {
  mainEl.innerHTML = `
    <section class="running">
      <h1 class="stage-title">Reading your pages…</h1>
      <div class="progress-panel">
        <div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="progress-track">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
        <div class="progress-row">
          <span id="progress-pct">0%</span>
          <span id="progress-label" class="progress-label"></span>
          <span id="progress-elapsed"></span>
        </div>
        <p class="progress-status" id="progress-status" aria-live="polite"></p>
      </div>
      <button type="button" class="btn secondary" id="btn-cancel">Cancel</button>
      <p class="privacy-note">The OCR engine is running in a Web Worker on this device.</p>
    </section>
  `;
  mainEl.querySelector('#btn-cancel')?.addEventListener('click', cancelRun);
  paintProgress();
}

function paintProgress(): void {
  const fill = document.getElementById('progress-fill');
  const pct = document.getElementById('progress-pct');
  const label = document.getElementById('progress-label');
  const status = document.getElementById('progress-status');
  const track = document.getElementById('progress-track');
  if (!fill || !pct || !label || !status) return;
  const p = Math.round(state.progressFraction * 100);
  fill.style.width = `${p}%`;
  pct.textContent = `${p}%`;
  label.textContent = state.progressLabel;
  status.textContent = state.progressStatus;
  track?.setAttribute('aria-valuenow', String(p));
  paintElapsed();
}

function paintElapsed(): void {
  const el = document.getElementById('progress-elapsed');
  if (el && state.runStartedAt > 0) {
    el.textContent = formatDuration(performance.now() - state.runStartedAt);
  }
  const sb = document.getElementById('sb-elapsed');
  if (sb) {
    sb.textContent =
      state.phase === 'running' && state.runStartedAt > 0
        ? `elapsed ${formatDuration(performance.now() - state.runStartedAt)}`
        : state.summary
          ? `took ${formatDuration(state.summary.elapsedMs)}`
          : '';
  }
}

function renderDone(): void {
  const s = state.summary;
  const combined = combineText(
    state.results.map((r) => ({ pageLabel: r.pageLabel, text: r.text })),
  );
  const anyPdf = state.results.some((r) => r.pdf !== null);
  const empty = combined.trim().length === 0;
  const lowConf = !empty && s !== null && s.avgConfidence > 0 && s.avgConfidence < 65;
  const cancelled = state.sources.reduce((n, x) => n + x.pageCount, 0) > state.results.length;

  const pageSections =
    state.results.length > 1
      ? state.results
          .map(
            (r, i) => `
        <details class="page-detail" ${i === 0 ? 'open' : ''}>
          <summary>
            <span>${escapeHtml(r.pageLabel)}</span>
            <span class="conf-badge ${confClass(r.confidence)}" title="Tesseract confidence">
              ${r.text.trim() ? `${Math.round(r.confidence)}%` : 'no text'}
            </span>
          </summary>
          <div class="page-body">
            ${r.thumb ? `<img class="page-thumb" src="${r.thumb}" alt="Preview of ${escapeAttr(r.pageLabel)}" loading="lazy" />` : ''}
            <pre class="page-text">${escapeHtml(r.text.trim() || '(no text found on this page)')}</pre>
          </div>
        </details>`,
          )
          .join('')
      : '';

  mainEl.innerHTML = `
    <section class="results">
      <h1 class="stage-title">${empty ? 'No text found' : 'Here’s your text'}</h1>
      ${cancelled ? `<p class="warn-note">Run was cancelled — showing the ${state.results.length} page(s) finished so far.</p>` : ''}
      ${
        s
          ? `<div class="summary-strip">
              <span><strong>${s.pages}</strong> page${s.pages === 1 ? '' : 's'}</span>
              <span><strong>${s.words.toLocaleString()}</strong> words</span>
              <span><strong>${s.chars.toLocaleString()}</strong> characters</span>
              <span><span class="glossary-link" data-term="confidence">confidence</span> <strong>${s.avgConfidence > 0 ? `${Math.round(s.avgConfidence)}%` : '—'}</strong></span>
              <span><strong>${formatDuration(s.elapsedMs)}</strong></span>
            </div>`
          : ''
      }
      ${
        lowConf
          ? `<p class="warn-note">Confidence is low — a sharper photo, straighter angle or higher-resolution scan usually fixes this.</p>`
          : ''
      }
      ${
        empty
          ? `<p class="empty-note">Tesseract couldn't find printed text. Handwriting isn't supported, and very stylised or tiny text can be missed. Try a clearer image, or a different language below.</p>`
          : `
        <div class="output-actions">
          <button type="button" class="btn primary" id="btn-copy">Copy text</button>
          <button type="button" class="btn secondary" id="btn-txt">Download .txt</button>
          ${anyPdf ? '<button type="button" class="btn secondary" id="btn-pdf">Download searchable PDF</button>' : ''}
          <button type="button" class="btn secondary" id="btn-share" hidden>Share</button>
        </div>
        <textarea class="combined-text" id="combined-text" readonly aria-label="Extracted text">${escapeHtml(combined)}</textarea>
        ${pageSections ? `<h2 class="pages-h2">Per page</h2>${pageSections}` : ''}
      `
      }
      <div class="rerun-strip">
        <label class="lang-label" for="lang-select">Language
          <select id="lang-select">${langOptions()}</select>
        </label>
        <button type="button" class="btn secondary" id="btn-rerun">Re-run</button>
        <button type="button" class="btn secondary" id="btn-reset">Start over</button>
      </div>
    </section>
  `;

  const base = outputBaseName(state.sources.map((x) => x.file.name));

  mainEl.querySelector('#btn-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(combined);
      toast('Text copied to clipboard.');
      emit('ui', 'ok', 'Copied text to clipboard');
    } catch {
      toast('Copy failed — select the text and copy manually.');
    }
  });

  mainEl.querySelector('#btn-txt')?.addEventListener('click', () => {
    downloadBlob(`${base}.txt`, new Blob([combined], { type: 'text/plain;charset=utf-8' }));
    emit('ui', 'ok', `Downloaded ${base}.txt`);
  });

  mainEl.querySelector('#btn-pdf')?.addEventListener('click', async () => {
    const btn = mainEl.querySelector<HTMLButtonElement>('#btn-pdf');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Building PDF…';
    }
    try {
      const pages = state.results.map((r) => r.pdf).filter((p): p is Uint8Array => p !== null);
      const merged = await mergePdfPages(pages, `${base} (searchable)`);
      downloadBlob(`${base}-searchable.pdf`, new Blob([merged.slice()], { type: 'application/pdf' }));
      emit('pdf', 'ok', `Downloaded ${base}-searchable.pdf`, { pages: pages.length });
    } catch (err) {
      toast('Building the searchable PDF failed — the plain text is unaffected.');
      emit('pdf', 'err', `PDF merge failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Download searchable PDF';
      }
    }
  });

  const shareBtn = mainEl.querySelector<HTMLButtonElement>('#btn-share');
  if (shareBtn && typeof navigator.share === 'function') {
    const file = new File([combined], `${base}.txt`, { type: 'text/plain' });
    const payload: ShareData = navigator.canShare?.({ files: [file] })
      ? { files: [file], title: 'Extracted text' }
      : { text: combined.slice(0, 4000), title: 'Extracted text' };
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share(payload);
        emit('ui', 'ok', 'Shared via Web Share');
      } catch {
        // user dismissed the share sheet — not an error
      }
    });
  }

  const sel = mainEl.querySelector<HTMLSelectElement>('#lang-select');
  sel?.addEventListener('change', () => {
    state.lang = sel.value;
    savePreferredLang(state.lang);
    updateStatusbar();
  });
  mainEl.querySelector('#btn-rerun')?.addEventListener('click', () => {
    state.phase = 'staged';
    render();
    void startRun();
  });
  mainEl.querySelector('#btn-reset')?.addEventListener('click', resetAll);
}

function renderError(): void {
  mainEl.innerHTML = `
    <section class="error-state">
      <h1 class="stage-title">Something went wrong</h1>
      <p class="error-msg">${escapeHtml(state.error ?? 'Unknown error.')}</p>
      <div class="output-actions">
        <button type="button" class="btn primary" id="btn-retry">Retry</button>
        <button type="button" class="btn secondary" id="btn-reset">Start over</button>
      </div>
    </section>
  `;
  mainEl.querySelector('#btn-retry')?.addEventListener('click', () => {
    state.phase = 'staged';
    render();
    void startRun();
  });
  mainEl.querySelector('#btn-reset')?.addEventListener('click', resetAll);
}

/* ─────────────────────────── dropzone bits ───────────────────────── */

function dropzoneHtml(): string {
  return `
    <div class="dropzone" id="dropzone" role="button" tabindex="0"
         aria-label="Add images or PDFs to extract text from">
      <svg class="dz-icon" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="8" y="4" width="32" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <line x1="15" y1="14" x2="33" y2="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="15" y1="21" x2="29" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
        <line x1="15" y1="28" x2="31" y2="28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
        <path d="M24 44 L24 33 M19 38 L24 33 L29 38" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <p class="dz-main">Drop images or a PDF here</p>
      <p class="dz-sub">or <span class="dz-link">click to browse</span> · paste a screenshot with <kbd>Cmd/Ctrl+V</kbd></p>
      <p class="dz-formats">PNG · JPG · WebP · BMP · GIF · PDF — processed on your device, never uploaded</p>
      ${hiddenInputHtml()}
    </div>
  `;
}

function hiddenInputHtml(): string {
  return `<input type="file" id="file-input" accept="${ACCEPT}" multiple hidden />`;
}

function wireDropzone(): void {
  const dz = mainEl.querySelector<HTMLElement>('#dropzone');
  if (!dz) return;
  dz.addEventListener('click', () => pickFiles());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickFiles();
    }
  });
  wireHiddenInput();
}

function wireHiddenInput(): void {
  const input = mainEl.querySelector<HTMLInputElement>('#file-input');
  input?.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      void stageFiles(Array.from(input.files));
      input.value = '';
    }
  });
}

function pickFiles(): void {
  mainEl.querySelector<HTMLInputElement>('#file-input')?.click();
}

/** Document-level drag & drop so files can land anywhere on the page. */
export function wireGlobalDragDrop(): void {
  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    depth += 1;
    document.body.classList.add('dragging');
  });
  document.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) document.body.classList.remove('dragging');
  });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      emit('ingest', 'info', `${files.length} file(s) dropped`);
      void stageFiles(files);
    }
  });
}

function wirePaste(): void {
  document.addEventListener('paste', (e) => {
    if (state.phase === 'running') return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) {
          const ext = (item.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
          files.push(new File([f], `pasted-screenshot.${ext}`, { type: item.type }));
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      emit('ingest', 'info', 'Screenshot pasted from clipboard');
      void stageFiles(files);
    }
  });
}

/* ───────────────────────── modals & chrome ───────────────────────── */

let openOverlay: HTMLElement | null = null;

function openModal(tmplId: string): void {
  closeModal();
  const tmpl = document.getElementById(tmplId) as HTMLTemplateElement | null;
  if (!tmpl) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'modal-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', closeModal);
  modal.appendChild(close);
  modal.appendChild(tmpl.content.cloneNode(true));
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.body.appendChild(overlay);
  openOverlay = overlay;
  close.focus();
  emit('ui', 'info', `Opened ${tmplId.replace('tmpl-', '')} modal`);
}

function closeModal(): void {
  openOverlay?.remove();
  openOverlay = null;
}

function wireModals(): void {
  document.querySelectorAll<HTMLElement>('[data-modal]').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.modal ?? ''));
  });
}

function wireDrawerToggle(): void {
  const btn = document.getElementById('btn-eventlog');
  const drawer = document.getElementById('event-drawer');
  if (!btn || !drawer) return;
  btn.addEventListener('click', () => {
    const open = drawer.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  drawer.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'drawer-close') {
      drawer.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function wireKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (openOverlay) {
        closeModal();
        return;
      }
      const drawer = document.getElementById('event-drawer');
      if (drawer?.classList.contains('open')) {
        drawer.classList.remove('open');
        document.getElementById('btn-eventlog')?.setAttribute('aria-expanded', 'false');
      }
    }
    if (e.key === 'Enter' && state.phase === 'staged' && !openOverlay) {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'BUTTON' && target.tagName !== 'SELECT' && target.tagName !== 'A') {
        void startRun();
      }
    }
  });
}

/* ─────────────────────────── statusbar ───────────────────────────── */

function updateStatusbar(): void {
  const dot = document.getElementById('sb-dot');
  const status = document.getElementById('sb-status');
  const langEl = document.getElementById('sb-lang');
  const pagesEl = document.getElementById('sb-pages');
  if (dot) dot.className = `dot-mini ${state.phase}`;
  if (status) {
    status.textContent =
      state.phase === 'empty'
        ? 'idle'
        : state.phase === 'staged'
          ? 'ready'
          : state.phase === 'running'
            ? 'working'
            : state.phase === 'done'
              ? 'done'
              : 'error';
  }
  if (langEl) langEl.textContent = labelFor(state.lang);
  if (pagesEl) {
    const pages =
      state.phase === 'done'
        ? state.results.length
        : state.sources.reduce((n, s) => n + s.pageCount, 0);
    pagesEl.textContent = pages > 0 ? `${pages} page${pages === 1 ? '' : 's'}` : '';
  }
  paintElapsed();
}

function startElapsedTicker(): void {
  stopElapsedTicker();
  elapsedTimer = window.setInterval(paintElapsed, 1000);
}

function stopElapsedTicker(): void {
  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

/* ─────────────────────────── small helpers ───────────────────────── */

function langOptions(): string {
  return LANGS.map(
    (l) =>
      `<option value="${l.code}" ${l.code === state.lang ? 'selected' : ''}>${l.label}${l.bundled ? '' : ' ↓'}</option>`,
  ).join('');
}

function langHint(): string {
  return state.lang === 'eng'
    ? 'English is built in — no download needed, works offline.'
    : `${labelFor(state.lang)} downloads once (~2–5 MB) from jsDelivr, then it's cached on your device.`;
}

function confClass(c: number): string {
  if (c >= 85) return 'good';
  if (c >= 65) return 'mid';
  return 'low';
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

let toastTimer: number | null = null;

function toast(msg: string): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove('show'), 4200);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

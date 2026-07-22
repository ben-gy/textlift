// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** App bootstrap: mounts UI, event drawer and glossary. No heavy logic here. */

// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles/main.css';
import { emit, mountEventDrawer } from './eventlog';
import { mountGlossary } from './glossary';
import { mountApp, wireGlobalDragDrop } from './ui';

const main = document.getElementById('main');
const drawer = document.getElementById('event-drawer');
const tip = document.getElementById('glossary-tip');

if (main && drawer && tip) {
  mountEventDrawer(drawer);
  mountApp(main);
  mountGlossary(tip);
  wireGlobalDragDrop();

  window.addEventListener('offline', () =>
    emit('system', 'warn', 'You are offline — English OCR keeps working; other languages need their model cached first'),
  );
  window.addEventListener('online', () => emit('system', 'info', 'Back online'));
} else {
  document.body.textContent = 'Textlift failed to start: missing root elements.';
}

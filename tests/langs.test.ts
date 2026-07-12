import { beforeEach, describe, expect, it } from 'vitest';
import {
  LANGS,
  isBundled,
  isKnownLang,
  labelFor,
  langPathFor,
  loadPreferredLang,
  savePreferredLang,
} from '../src/langs';

describe('language catalog', () => {
  it('has English first and bundled', () => {
    expect(LANGS[0].code).toBe('eng');
    expect(LANGS[0].bundled).toBe(true);
  });

  it('only English is bundled', () => {
    expect(LANGS.filter((l) => l.bundled)).toHaveLength(1);
  });

  it('has unique codes', () => {
    const codes = LANGS.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('langPathFor', () => {
  it('resolves bundled English same-origin', () => {
    expect(langPathFor('eng')).toBe('/tessdata');
  });

  it('resolves other languages to jsDelivr best_int', () => {
    expect(langPathFor('fra')).toBe(
      'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra/4.0.0_best_int',
    );
    expect(langPathFor('chi_sim')).toContain('/chi_sim/');
  });
});

describe('labels and lookup', () => {
  it('labels known languages', () => {
    expect(labelFor('deu')).toBe('German');
  });

  it('falls back to the code for unknown languages', () => {
    expect(labelFor('xyz')).toBe('xyz');
    expect(isKnownLang('xyz')).toBe(false);
  });

  it('reports bundled status', () => {
    expect(isBundled('eng')).toBe(true);
    expect(isBundled('spa')).toBe(false);
    expect(isBundled('nope')).toBe(false);
  });
});

describe('preference persistence', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to eng with nothing stored', () => {
    expect(loadPreferredLang()).toBe('eng');
  });

  it('round-trips a valid language', () => {
    savePreferredLang('jpn');
    expect(loadPreferredLang()).toBe('jpn');
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem('textlift:lang', 'klingon');
    expect(loadPreferredLang()).toBe('eng');
  });

  it('refuses to save unknown languages', () => {
    savePreferredLang('klingon');
    expect(localStorage.getItem('textlift:lang')).toBeNull();
  });
});

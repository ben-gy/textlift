/**
 * OCR language catalog.
 *
 * English traineddata is bundled with the app (self-hosted, offline-capable).
 * Every other language is fetched once from jsDelivr's CDN on first use and
 * cached in IndexedDB by Tesseract — this is disclosed in the Threat Model.
 */

export interface OcrLang {
  code: string;
  label: string;
  bundled: boolean;
}

export const LANGS: OcrLang[] = [
  { code: 'eng', label: 'English', bundled: true },
  { code: 'spa', label: 'Spanish', bundled: false },
  { code: 'fra', label: 'French', bundled: false },
  { code: 'deu', label: 'German', bundled: false },
  { code: 'ita', label: 'Italian', bundled: false },
  { code: 'por', label: 'Portuguese', bundled: false },
  { code: 'nld', label: 'Dutch', bundled: false },
  { code: 'pol', label: 'Polish', bundled: false },
  { code: 'tur', label: 'Turkish', bundled: false },
  { code: 'rus', label: 'Russian', bundled: false },
  { code: 'ukr', label: 'Ukrainian', bundled: false },
  { code: 'ara', label: 'Arabic', bundled: false },
  { code: 'hin', label: 'Hindi', bundled: false },
  { code: 'jpn', label: 'Japanese', bundled: false },
  { code: 'chi_sim', label: 'Chinese (Simplified)', bundled: false },
  { code: 'kor', label: 'Korean', bundled: false },
];

const CDN_BASE = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';

export function isKnownLang(code: string): boolean {
  return LANGS.some((l) => l.code === code);
}

export function labelFor(code: string): string {
  return LANGS.find((l) => l.code === code)?.label ?? code;
}

export function isBundled(code: string): boolean {
  return LANGS.find((l) => l.code === code)?.bundled ?? false;
}

/**
 * Where Tesseract should fetch `${code}.traineddata.gz` from.
 * Bundled languages resolve same-origin; the rest resolve to jsDelivr.
 */
export function langPathFor(code: string): string {
  if (isBundled(code)) return '/tessdata';
  return `${CDN_BASE}/${code}/4.0.0_best_int`;
}

const STORAGE_KEY = 'textlift:lang';

export function loadPreferredLang(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && isKnownLang(v)) return v;
  } catch {
    /* storage unavailable (private mode etc.) — fall through */
  }
  return 'eng';
}

export function savePreferredLang(code: string): void {
  try {
    if (isKnownLang(code)) localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* non-fatal */
  }
}

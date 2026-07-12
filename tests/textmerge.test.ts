import { describe, expect, it } from 'vitest';
import { combineText, normalizeText, pageHeader, textStats } from '../src/textmerge';

describe('normalizeText', () => {
  it('trims trailing whitespace per line', () => {
    expect(normalizeText('hello   \nworld\t')).toBe('hello\nworld');
  });

  it('collapses 3+ blank lines to one', () => {
    expect(normalizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('strips leading and trailing blank lines', () => {
    expect(normalizeText('\n\n\nbody\n\n')).toBe('body');
  });

  it('normalises CRLF line endings', () => {
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('handles empty input', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('\n\n\n')).toBe('');
  });
});

describe('pageHeader', () => {
  it('is 1-based and includes the label', () => {
    expect(pageHeader('scan.pdf — page 3', 2, 10)).toContain('Page 3 of 10');
    expect(pageHeader('scan.pdf — page 3', 2, 10)).toContain('scan.pdf — page 3');
  });
});

describe('combineText', () => {
  it('returns empty string for no pages', () => {
    expect(combineText([])).toBe('');
  });

  it('returns plain text for a single page (no header)', () => {
    const out = combineText([{ pageLabel: 'a.png', text: 'hello\n' }]);
    expect(out).toBe('hello');
    expect(out).not.toContain('Page 1');
  });

  it('adds headers between multiple pages', () => {
    const out = combineText([
      { pageLabel: 'a.png', text: 'first' },
      { pageLabel: 'b.png', text: 'second' },
    ]);
    expect(out).toContain('Page 1 of 2');
    expect(out).toContain('Page 2 of 2');
    expect(out.indexOf('first')).toBeLessThan(out.indexOf('second'));
  });

  it('keeps empty pages present with their headers', () => {
    const out = combineText([
      { pageLabel: 'a.png', text: 'x' },
      { pageLabel: 'b.png', text: '' },
    ]);
    expect(out).toContain('Page 2 of 2');
  });
});

describe('textStats', () => {
  it('counts words and characters across pages', () => {
    const s = textStats([
      { pageLabel: 'a', text: 'one two three' },
      { pageLabel: 'b', text: 'four five' },
    ]);
    expect(s.words).toBe(5);
    expect(s.chars).toBe('one two three'.length + 'four five'.length);
  });

  it('returns zeros for empty input', () => {
    expect(textStats([])).toEqual({ words: 0, chars: 0 });
  });

  it('ignores whitespace-only pages', () => {
    expect(textStats([{ pageLabel: 'a', text: '  \n ' }]).words).toBe(0);
  });
});

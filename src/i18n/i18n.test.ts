import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatDuration } from '@/domain/time';
import { dateLabel, setLangQuietly, tx } from './index';
import { SI, TA } from './dicts';

/** Every `tx('…')` and `msg('…')` with literal text in the source. */
function marked(): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) {
        const src = readFileSync(path, 'utf8');
        const re = /\b(?:tx|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
        for (const m of src.matchAll(re)) {
          const raw = m[1] ?? m[2] ?? m[3] ?? '';
          found.set(raw.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)), path);
        }
      }
    }
  };
  walk(join(__dirname, '..'));
  return found;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('UI translations', () => {
  const keys = marked();
  afterEach(() => setLangQuietly('en'));

  it('finds the marked text', () => {
    expect(keys.size).toBeGreaterThan(100);
  });

  for (const [name, dict] of [
    ['Sinhala', SI],
    ['Tamil', TA],
  ] as const) {
    it(`${name} has every marked text`, () => {
      const missing = [...keys].filter(([k]) => !(k in dict)).map(([k, file]) => `${file}: ${k}`);
      expect(missing).toEqual([]);
    });
    it(`${name} has no unused entries`, () => {
      expect(Object.keys(dict).filter((k) => !keys.has(k))).toEqual([]);
    });
    it(`${name} keeps every placeholder`, () => {
      const wrong = Object.entries(dict).filter(([en, tr]) => placeholders(en).join() !== placeholders(tr).join());
      expect(wrong).toEqual([]);
    });
  }

  it('fills placeholders after translating, and falls back to English', () => {
    expect(tx('{n} unknown words', { n: 3 })).toBe('3 unknown words');
    setLangQuietly('si');
    expect(tx('Some text nobody translated')).toBe('Some text nobody translated');
  });
});

describe('formatted values in the UI language', () => {
  afterEach(() => setLangQuietly('en'));

  it('writes dates from the dictionaries, since Chrome has no Sinhala date names', () => {
    const d = new Date(2026, 9, 29, 14, 5);
    expect(dateLabel(d, { weekday: true })).toBe('Thu 29 Oct');
    setLangQuietly('si');
    expect(dateLabel(d, { weekday: true })).toBe(`${SI['Thu']} 29 ${SI['Oct']}`);
    expect(dateLabel(d, { time: true })).toBe(`29 ${SI['Oct']} 14:05`);
  });

  it('translates durations', () => {
    setLangQuietly('ta');
    expect(formatDuration(1600)).toBe('26 மணி 40 நிமி.');
    expect(formatDuration(45)).toBe('45 நிமி.');
  });
});

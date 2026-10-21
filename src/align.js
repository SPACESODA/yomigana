import { toRomaji } from './romaji.js';
import { normalizeOverrides, findOverrideMatches, overrideEdges, overrideReadingParts } from './overrides.js';

const HAN = /[\p{Script=Han}々〆]/u;
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
export const hasKanji = (text) => HAN.test(text);
export const toHiragana = (text) => text.normalize('NFC').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const toKatakana = (text) => text.normalize('NFC').replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

// Keep an ambiguous reading grouped instead of inventing a per-kanji split.
export function alignReading(surface, rawReading) {
  const reading = toHiragana(rawReading || '');
  const plain = [{ text: surface }];
  if (!hasKanji(surface) || !KANA.test(reading) || reading === surface) return plain;
  const fallback = () => [{ text: surface, reading, alignment: 'grouped' }];
  const runs = [];
  for (const char of surface) {
    const han = HAN.test(char);
    if (runs.at(-1)?.han === han) runs.at(-1).text += char;
    else runs.push({ text: char, han });
  }
  if (runs.length === 1 || surface.length > 128 || reading.length > 256) return fallback();
  const memo = new Map();
  let budget = 10000;
  function solve(index, offset) {
    if (--budget < 0) return [];
    if (index === runs.length) return offset === reading.length ? [[]] : [];
    const key = `${index}:${offset}`;
    if (memo.has(key)) return memo.get(key);
    const run = runs[index];
    const answers = [];
    if (!run.han) {
      const anchor = toHiragana(run.text);
      if (reading.startsWith(anchor, offset)) {
        for (const tail of solve(index + 1, offset + anchor.length)) answers.push([{ text: run.text }, ...tail]);
      }
    } else {
      for (let end = offset + 1; end <= reading.length && answers.length < 2; end++) {
        for (const tail of solve(index + 1, end)) {
          answers.push([{ text: run.text, reading: reading.slice(offset, end), alignment: 'anchored' }, ...tail]);
          if (answers.length === 2) break;
        }
      }
    }
    memo.set(key, answers);
    return answers;
  }
  const answers = solve(0, 0);
  return budget >= 0 && answers.length === 1 ? answers[0] : fallback();
}

export function annotationsFromTokens(text, tokens, overrides = [], { readingFormat = 'hiragana' } = {}) {
  // Validate even tokens covered by an override; never conceal provider offset errors.
  let previousEnd = 0;
  for (const token of tokens) {
    if (!Number.isInteger(token.start) || !Number.isInteger(token.end) || token.start < previousEnd
      || token.end <= token.start || text.slice(token.start, token.end) !== token.surface) {
      throw new Error('Reading provider returned invalid text offsets');
    }
    previousEnd = token.end;
  }
  const matches = findOverrideMatches(text, normalizeOverrides(overrides), tokens);
  if (!matches.length) return normalAnnotations(text, tokens, { readingFormat });
  const parts = [];
  const normalRange = (start, end) => {
    if (start >= end) return;
    // A literal override may cut through a token. Keep the uncovered fragment
    // literal rather than attaching that whole token's reading to a substring.
    const contained = tokens.filter(token => token.start >= start && token.end <= end)
      .map(token => ({ ...token, start: token.start - start, end: token.end - start }));
    parts.push(...normalAnnotations(text.slice(start, end), contained, { readingFormat }));
  };
  let cursor = 0;
  for (const rule of matches) {
    if (rule.annotation === undefined) continue;
    normalRange(cursor, rule.start);
    if (!rule.annotation) parts.push({ text: rule.match });
    else {
      for (const part of overrideReadingParts(rule.match, rule.annotation)) {
        if (!part.reading) { parts.push(part); continue; }
        const { prefix, core, suffix } = overrideEdges(part.text);
        if (prefix) parts.push({ text: prefix });
        // Explicit circle-placeholder readings are valid even without kanji.
        if (core && /^○+$/u.test(core)) {
          const reading = readingFormat === 'romaji' ? toRomaji(part.reading)
            : readingFormat === 'katakana' ? toKatakana(part.reading) : toHiragana(part.reading);
          parts.push({ text: core, reading, alignment: 'grouped' });
        } else if (core) parts.push(...normalAnnotations(core, [{ surface: core, start: 0, end: core.length, reading: part.reading }], { readingFormat }));
        if (suffix) parts.push({ text: suffix });
      }
    }
    cursor = rule.end;
  }
  normalRange(cursor, text.length);
  return parts;
}

function normalAnnotations(text, tokens, { readingFormat }) {
  const parts = [];
  let cursor = 0;
  for (const token of tokens) {
    const { start, end, surface } = token;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end <= start || text.slice(start, end) !== surface) {
      throw new Error('Reading provider returned invalid text offsets');
    }
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    const reading = token.reading;
    // Keep word-level consonants and long vowels intact in romaji.
    const aligned = readingFormat !== 'romaji' && validatedAlignment(surface, reading, token.alignment);
    const annotations = aligned || alignReading(surface, reading);
    if (readingFormat === 'romaji') {
      parts.push(...annotations.map((part, i) => {
        if (!part.reading || !/^[\p{Script=Han}々〆]+$/u.test(part.text)) return { text: part.text };
        const romaji = toRomaji(part.reading, annotations[i + 1]?.text);
        return romaji ? { ...part, reading: romaji } : { text: part.text };
      }));
    } else if (readingFormat === 'katakana') {
      parts.push(...annotations.map((part) => (part.reading ? { ...part, reading: toKatakana(part.reading) } : part)));
    } else {
      parts.push(...annotations);
    }
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

export function validatedAlignment(surface, reading, rows) {
  if (!reading || !Array.isArray(rows) || !rows.length) return null;
  if (!rows.every((row) => Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && row[0] && typeof row[1] === 'string'
    && (row[1] ? KANA.test(row[1]) : !hasKanji(row[0])))) return null;
  if (rows.map(([text]) => text).join('') !== surface || toHiragana(rows.map(([text, kana]) => kana || text).join('')) !== toHiragana(reading)) return null;
  return rows.map(([text, kana]) => kana ? { text, reading: toHiragana(kana), alignment: 'dictionary' } : { text });
}

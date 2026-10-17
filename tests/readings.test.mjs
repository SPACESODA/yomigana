import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReading, originalOffsets } from '../src/readings.js';
import { validatedAlignment, annotationsFromTokens } from '../src/align.js';
import { compileReadings } from '../scripts/dictionary-build.mjs';

const token = (surface, baseForm = surface, pos = 'NOUN') => ({ surface, baseForm, pos });
test('a unique standard common reading is preferred, but ties and legacy data remain ambiguous', () => {
  const rows = [['べつ', ['n'], 0], ['よみ', ['n'], 1]];
  for (const choices of [rows, [...rows].reverse()]) {
    const result = resolveReading(token('語'), { 語: choices });
    assert.equal(result.reading, 'よみ');
    assert.equal(result.readingStatus, 'preferred');
    assert.equal(result.candidates.length, 2);
  }
  assert.equal(resolveReading(token('語'), { 語: [['いち', ['n'], 1], ['に', ['n'], 1]] }).reading, '');
  assert.equal(resolveReading(token('私', '私', 'PRON'), { 私: [['し', ['n'], 1], ['わたし', ['pn'], 0]] }).reading, 'わたし');
  assert.equal(resolveReading(token('語'), { 語: rows }, 'strict').reading, '');
});
test('ambiguous readings are not resolved by dictionary order or popularity', () => {
  const result = resolveReading(token('人気'), { 人気: [['にんき', ['n']], ['ひとけ', ['n']]] });
  assert.equal(result.reading, '');
  assert.equal(result.readingStatus, 'ambiguous');
  assert.equal(resolveReading(token('未知語'), {}).readingStatus, 'unknown');
});
test('POS filters candidates without claiming to resolve same-POS ambiguity', () => {
  const d = { 開く: [['あく', ['v5k']], ['ひらく', ['v5k']]], 上: [['うえ', ['n']], ['じょう', ['suf']]] };
  assert.equal(resolveReading(token('開く', '開く', 'VERB'), d).reading, '');
  assert.equal(resolveReading(token('上'), d).reading, 'うえ');
});
test('regular inflections preserve stems; irregular stems are skipped', () => {
  const examples = [
    ['食べ', '食べる', 'たべる', 'v1', 'たべ', 'VERB'],
    ['書い', '書く', 'かく', 'v5k', 'かい', 'VERB'],
    ['泳い', '泳ぐ', 'およぐ', 'v5g', 'およい', 'VERB'],
    ['読ん', '読む', 'よむ', 'v5m', 'よん', 'VERB'],
    ['美しかっ', '美しい', 'うつくしい', 'adj-i', 'うつくしかっ', 'ADJ'],
    ['来', '来る', 'くる', 'vk', '', 'VERB'],
    ['良かっ', '良い', 'いい', 'adj-i', '', 'ADJ'],
  ];
  for (const [surface, base, reading, tag, expected, pos] of examples) {
    assert.equal(resolveReading(token(surface, base, pos), { [base]: [[reading, [tag]]] }).reading, expected, surface);
  }
});
test('original offsets handle width changes, combining marks, and astral text', () => {
  const input = 'Ａ ﾊﾟ 😀桜';
  const normalized = input.normalize('NFKC');
  const offsets = originalOffsets(input, normalized);
  assert.equal(offsets.get(normalized.indexOf('桜')), input.indexOf('桜'));
  assert.equal(offsets.get(normalized.length), input.length);
  assert.equal(originalOffsets('桜', '別'), null);
});
test('dictionary alignments must reconstruct both surface and reading', () => {
  const rows = [['東', 'とう'], ['京', 'きょう']];
  assert.equal(validatedAlignment('東京', 'とうきょう', rows).length, 2);
  assert.equal(validatedAlignment('東京', 'とうきょう', [['東京', 'べつ']]), null);
  assert.equal(validatedAlignment('東京', 'とうきょう', [['東京', '']]), null);
  const parts = annotationsFromTokens('東京', [{ surface: '東京', reading: 'とうきょう', start: 0, end: 2, alignment: rows }], { 東京: 'とうけい' });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].reading, 'とうけい');
});
test('compiler respects spelling/sense restrictions and retains uncommon alternatives', () => {
  const word = (text, reading, common) => ({ kanji: [{ text, common }], kana: [{ text: reading, common, appliesToKanji: ['*'] }], sense: [{ appliesToKanji: ['*'], appliesToKana: ['*'], partOfSpeech: ['n'] }] });
  const first = word('人気', 'にんき', true);
  const second = word('人気', 'ひとけ', false);
  const excluded = word('人気', 'べつ', false);
  excluded.kana[0].appliesToKanji = ['別'];
  const result = compileReadings([first, second, excluded, word('珍語', 'ちんご', false)]);
  assert.deepEqual(result.人気.map(([reading]) => reading), ['にんき', 'ひとけ']);
  assert.equal(result.珍語, undefined);
});
test('compiler retains sense-local preference without promoting marked or restricted variants', () => {
  const word = {
    kanji: [{ text: '語', common: true, tags: [] }],
    kana: [{ text: 'よみ', common: true, tags: [], appliesToKanji: ['*'] }],
    sense: [
      { appliesToKanji: ['*'], appliesToKana: ['*'], partOfSpeech: ['n'], misc: ['arch'], dialect: [] },
      { appliesToKanji: ['*'], appliesToKana: ['*'], partOfSpeech: ['v5m'], misc: [], dialect: [] },
      { appliesToKanji: ['別'], appliesToKana: ['*'], partOfSpeech: ['pn'], misc: [], dialect: [] },
    ],
  };
  assert.deepEqual(compileReadings([word]).語, [['よみ', ['n'], 0], ['よみ', ['v5m'], 1]]);
  word.kana[0].tags = ['ok'];
  assert.ok(compileReadings([word]).語.every((row) => row[2] === 0));
  word.kana[0].tags = [];
  word.sense[1].dialect = ['ksb'];
  assert.ok(compileReadings([word]).語.every((row) => row[2] === 0));
});
test('compact compiler retains attested compounds with their own readings and alternatives', () => {
  const word = (text, reading, common = false) => ({ kanji: [{ text, common }], kana: [{ text: reading, common, appliesToKanji: ['*'] }], sense: [{ appliesToKanji: ['*'], appliesToKana: ['*'], partOfSpeech: ['n'] }] });
  const result = compileReadings([
    word('専門', 'せんもん', true), word('用語', 'ようご', true),
    word('専門用語', 'せんもんようご'), word('専門用語', 'べつのよみ'),
    word('未知用語', 'みちようご'),
  ]);
  assert.deepEqual(result.専門用語.map(([reading]) => reading), ['せんもんようご', 'べつのよみ']);
  assert.equal(result.未知用語, undefined);
  assert.equal(result.用語専門, undefined);
});

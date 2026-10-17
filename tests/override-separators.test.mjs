import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { yomigana } from '../src/yomigana.js';
import { annotationsFromTokens } from '../src/align.js';
import { normalizeOverrides, prepareSpeechText, overrideReadingParts } from '../src/overrides.js';

const provider = { calls: 0, async analyze(texts) {
  this.calls++;
  return texts.map(text => [...text.matchAll(/左/gu)].map(m => ({ surface: '左', reading: 'さ', start: m.index, end: m.index + 1 })));
} };

test('matching common Japanese separators align each word and preserve original punctuation', async () => {
  for (const [sourceSeparator, readingSeparator] of [['・', '・'], ['･', '・'], ['・', '･'], ['、', '、'], ['。', '。'], [' ', '　'], ['　', ' '], ['  ', '　'], ['〜', '～'], ['～', '〜'], ['~', '〜'], ['：', ':'], [':', '：']]) {
    const source = ['左', '上', '右', '下'].join(sourceSeparator);
    const reading = ['ひだり', 'うえ', 'みぎ', 'した'].join(readingSeparator);
    const dom = new JSDOM(`<article lang="ja"><span data-ym="${reading}">${source}</span></article>`);
    const root = dom.window.document.querySelector('article');
    const before = provider.calls;
    const reader = new yomigana({ root, provider });
    await reader.annotate();
    assert.equal(provider.calls, before);
    assert.deepEqual([...root.querySelectorAll('ruby')].map(ruby => ruby.firstChild.textContent), ['左', '上', '右', '下']);
    assert.deepEqual([...root.querySelectorAll('rt')].map(rt => rt.textContent), ['ひだり', 'うえ', 'みぎ', 'した']);
    assert.equal(reader.speechText(), ['ひだり', 'うえ', 'みぎ', 'した'].join(sourceSeparator));
    await reader.setReadingFormat('katakana');
    assert.deepEqual([...root.querySelectorAll('rt')].map(rt => rt.textContent), ['ヒダリ', 'ウエ', 'ミギ', 'シタ']);
    await reader.setReadingFormat('romaji');
    assert.deepEqual([...root.querySelectorAll('rt')].map(rt => rt.textContent), ['hidari', 'ue', 'migi', 'shita']);
    reader.setVisible(false);
    assert.equal(reader.speechText(), ['ひだり', 'うえ', 'みぎ', 'した'].join(sourceSeparator));
    reader.restore();
    assert.equal(root.textContent, source);
    reader.destroy();
    dom.window.close();
  }
});

test('mismatched separators, missing parts and unknown characters fall back consistently', async () => {
  for (const reading of ['ひだり、うえ', 'ひだり・', 'ひだりうえ', 'ひだり/うえ', 'hidari・ue', 'ひだり\nうえ', 'ひだり\tうえ', '・']) {
    const dom = new JSDOM(`<article lang="ja"><span data-ym="${reading}">左・上</span></article>`);
    const root = dom.window.document.querySelector('article');
    const reader = new yomigana({ root, provider });
    await reader.annotate();
    assert.equal(root.querySelector('rt').textContent, 'さ');
    assert.equal(reader.speechText(), '左・上');
    reader.destroy(); dom.window.close();
  }
});

test('global entries share segmentation, including trailing punctuation and speech rules', () => {
  const match = '左・上。';
  const rules = [{ match, annotation: 'ひだり・うえ。' }];
  const parts = annotationsFromTokens(match, [], rules);
  assert.equal(parts.map(part => part.text).join(''), match);
  assert.deepEqual(parts.filter(part => part.reading).map(part => part.reading), ['ひだり', 'うえ']);
  assert.equal(prepareSpeechText(match, { overrides: rules }), 'ひだり・うえ。');
  assert.equal(prepareSpeechText(match, { overrides: [{ ...rules[0], speech: '' }] }), '');
  assert.throws(() => normalizeOverrides([{ match, annotation: 'ひだり、うえ。' }]));
  assert.deepEqual(overrideReadingParts('珈琲', 'コーヒー'), [{ text: '珈琲', reading: 'コーヒー' }]);
  assert.equal(overrideReadingParts('一〜三', 'いちさん'), null);
});

test('Japanese quotation delimiters remain outside ruby and match structurally', async () => {
  for (const [open, close] of [['「', '」'], ['『', '』'], ['（', '）'], ['【', '】']]) {
    const source = `${open}左・上${close}`;
    const reading = `${open}ひだり・うえ${close}`;
    const dom = new JSDOM(`<article lang="ja"><span data-ym="${reading}">${source}</span></article>`);
    const root = dom.window.document.querySelector('article');
    const reader = new yomigana({ root, provider });
    await reader.annotate();
    assert.equal(root.querySelectorAll('ruby').length, 2);
    assert.equal(root.querySelector('ruby').firstChild.textContent, '左');
    assert.equal(reader.speechText(), reading);
    assert.equal(prepareSpeechText(source, { overrides: [{ match: source, annotation: reading }] }), reading);
    reader.destroy(); dom.window.close();
  }
  assert.equal(overrideReadingParts('「左」', '『ひだり』'), null);
});

test('spacing around separators and outside the source is preserved without changing word alignment', () => {
  const parts = overrideReadingParts('　 左 ・ 上　 ', 'ひだり･うえ');
  assert.deepEqual(parts, [{ text: '　 ' }, { text: '左', reading: 'ひだり' }, { text: ' ・ ' }, { text: '上', reading: 'うえ' }, { text: '　 ' }]);
});

test('outer parentheses and lenticular brackets may be omitted in supplied readings', () => {
  for (const source of ['（笑）', '【笑】', '【（笑）】']) {
    const parts = overrideReadingParts(source, 'わらい');
    assert.equal(parts.map(part => part.text).join(''), source);
    assert.deepEqual(parts.filter(part => part.reading), [{ text: '笑', reading: 'わらい' }]);
    assert.equal(prepareSpeechText(source, { overrides: [{ match: source, annotation: 'わらい' }] }), source.replace('笑', 'わらい'));
  }
  assert.equal(overrideReadingParts('（左）・上', 'ひだり・うえ'), null);
});

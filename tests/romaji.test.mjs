import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { toRomaji } from '../src/romaji.js';
import { annotationsFromTokens, toKatakana } from '../src/align.js';
import { yomigana } from '../src/yomigana.js';

test('romaji handles Hepburn syllables, long vowels, consonants and nasal boundaries', () => {
  for (const [kana, expected] of [
    ['こうえん', 'kōen'], ['とうきょう', 'tōkyō'], ['がっこう', 'gakkō'],
    ['まっちゃ', 'matcha'], ['ぎゅうにゅう', 'gyūnyū'], ['しんよう', "shin'yō"],
    ['にほん', 'nihon'], ['かもがわ', 'kamogawa'], ['しんぶん', 'shinbun'],
    ['さくら', 'sakura'], ['えいが', 'eiga'], ['おおきい', 'ōkii'],
    ['スーパー', 'sūpā'], ['ティー', 'tī'], ['フィルム', 'firumu'],
    ['ゔぁいおりん', 'vaiorin'],
  ]) assert.equal(toRomaji(kana), expected, kana);
  assert.equal(toRomaji('いっ', 'た'), 'it');
  assert.equal(toRomaji('ん', 'あ'), "n'");
  assert.equal(toRomaji('っ'), null);
  assert.equal(toRomaji('ー'), null);
  assert.equal(toRomaji('abc'), null);
});

test('romaji groups consecutive kanji even with fine alignment and preserves kana anchors', () => {
  const text = '学校で食べ物を買った。';
  const tokens = [
    { surface: '学校', reading: 'がっこう', start: 0, end: 2, alignment: [['学', 'がっ'], ['校', 'こう']] },
    { surface: '食べ物', reading: 'たべもの', start: 3, end: 6 },
    { surface: '買った', reading: 'かった', start: 7, end: 10 },
  ];
  const parts = annotationsFromTokens(text, tokens, {}, { readingFormat: 'romaji' });
  assert.equal(parts.map((part) => part.text).join(''), text);
  assert.deepEqual(parts.filter((part) => part.reading).map(({ text, reading }) => [text, reading]),
    [['学校', 'gakkō'], ['食', 'ta'], ['物', 'mono'], ['買', 'ka']]);
  const invalidAnchors = annotationsFromTokens('甲あ乙', [
    { surface: '甲あ乙', reading: 'かあきあく', start: 0, end: 3 },
  ], {}, { readingFormat: 'romaji' });
  assert.deepEqual(invalidAnchors, [{ text: '甲あ乙' }]);
});

test('switching formats uses cached kana readings, retains overrides, visibility, copying and original text', async () => {
  const dom = new JSDOM('<html lang="ja"><body><div>公園の桜が咲きます。かなだけ。<ruby>花<rt>はな</rt></ruby></div></body></html>');
  const root = dom.window.document.querySelector('div');
  const original = root.innerHTML;
  let calls = 0;
  const provider = { async analyze() {
    calls++;
    return [[
      { surface: '公園', reading: 'こうえん', start: 0, end: 2, alignment: [['公', 'こう'], ['園', 'えん']] },
      { surface: '桜', reading: 'さくら', start: 3, end: 4 },
      { surface: '咲きます', reading: 'さきます', start: 5, end: 9 },
    ]];
  } };
  const reader = new yomigana({ root, provider, selection: 'both', overrides: { 桜: 'さくら' } });
  await reader.annotate();
  const initialCalls = calls;
  reader.setVisible(false);
  await reader.setReadingFormat('romaji');
  assert.equal(calls, initialCalls);
  assert.equal(root.querySelectorAll('[data-yomigana]').length, 3);
  assert.ok([...root.querySelectorAll('[data-yomigana] rt')].every((rt) => rt.hidden && rt.getAttribute('aria-hidden') === 'true'));
  reader.setVisible(true);
  assert.deepEqual([...root.querySelectorAll('[data-yomigana] rt')].map((rt) => rt.textContent), ['kōen', 'sakura', 'sa']);
  const selection = dom.window.document.getSelection();
  const range = dom.window.document.createRange();
  range.selectNodeContents(root); selection.addRange(range);
  let copied;
  const event = new dom.window.Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { setData(type, text) { copied = text; } } });
  root.dispatchEvent(event);
  assert.equal(copied, '公園(kōen)の桜(sakura)が咲(sa)きます。かなだけ。花はな');
  assert.equal(root.querySelector('ruby:not([data-yomigana]) rt').textContent, 'はな');
  await reader.setReadingFormat('katakana');
  assert.equal(root.querySelectorAll('[data-yomigana]').length, 4);
  assert.deepEqual([...root.querySelectorAll('[data-yomigana] rt')].map((rt) => rt.textContent), ['コウ', 'エン', 'サクラ', 'サ']);
  await reader.setReadingFormat('hiragana');
  assert.equal(root.querySelectorAll('[data-yomigana]').length, 4);
  assert.deepEqual([...root.querySelectorAll('[data-yomigana] rt')].map((rt) => rt.textContent), ['こう', 'えん', 'さくら', 'さ']);
  assert.equal(calls, initialCalls);
  reader.destroy();
  assert.equal(root.innerHTML, original);
  dom.window.close();
});

test('katakana format converts hiragana readings to katakana while preserving alignment', () => {
  assert.equal(toKatakana('にほん'), 'ニホン');
  assert.equal(toKatakana('とうきょう'), 'トウキョウ');
  assert.equal(toKatakana('がっこう'), 'ガッコウ');
  assert.equal(toKatakana('ゔぁいおりん'), 'ヴァイオリン');

  const text = '公園で桜が咲く。';
  const tokens = [
    { surface: '公園', reading: 'こうえん', start: 0, end: 2, alignment: [['公', 'こう'], ['園', 'えん']] },
    { surface: '桜', reading: 'さくら', start: 3, end: 4 },
    { surface: '咲く', reading: 'さく', start: 5, end: 7 },
  ];
  const parts = annotationsFromTokens(text, tokens, {}, { readingFormat: 'katakana' });
  assert.equal(parts.map((p) => p.text).join(''), text);
  assert.deepEqual(parts.filter((p) => p.reading).map(({ text, reading, alignment }) => [text, reading, alignment]), [
    ['公', 'コウ', 'dictionary'],
    ['園', 'エン', 'dictionary'],
    ['桜', 'サクラ', 'grouped'],
    ['咲', 'サ', 'anchored'],
  ]);
});

test('format changes cancel delayed annotation and reject unsupported formats', async () => {
  const dom = new JSDOM('<html lang="ja"><body><div>桜</div></body></html>');
  const root = dom.window.document.querySelector('div');
  let finish;
  let calls = 0;
  const rows = [[{ surface: '桜', reading: 'さくら', start: 0, end: 1 }]];
  const reader = new yomigana({ root, provider: { analyze() {
    return ++calls === 1 ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(rows);
  } } });
  const first = reader.annotate(); await Promise.resolve();
  const switched = reader.setReadingFormat('romaji');
  finish(rows); await first; await switched;
  assert.equal(root.querySelector('rt').textContent, 'sakura');
  assert.throws(() => reader.setReadingFormat('invalid'), /readingFormat/);
  reader.destroy();
  dom.window.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { Suzume } from '../vendor/suzume/index.js';
import { tokenize } from '../src/engine.js';
import { alignReading, annotationsFromTokens } from '../src/align.js';
import { yomigana } from '../src/yomigana.js';

const compact = (parts) => parts.map(({ text, reading }) => [text, reading || '']);
test('kana anchors split 食べ物 and retain okurigana', () => {
  assert.deepEqual(compact(alignReading('食べ物', 'タベモノ')), [['食', 'た'], ['べ', ''], ['物', 'もの']]);
  assert.deepEqual(compact(alignReading('咲き', 'サキ')), [['咲', 'さ'], ['き', '']]);
  assert.deepEqual(compact(alignReading('お申し込み', 'オモウシコミ')), [['お', ''], ['申', 'もう'], ['し', ''], ['込', 'こ'], ['み', '']]);
});
test('compounds and ambiguous kana anchors stay grouped', () => {
  assert.deepEqual(compact(alignReading('今日', 'キョウ')), [['今日', 'きょう']]);
  assert.equal(alignReading('甲あ乙', 'カアキアク')[0].alignment, 'grouped');
  assert.equal(alignReading('食べ物', 'ショクモツ')[0].alignment, 'grouped');
});
test('unknown readings and non-kanji remain untouched', () => {
  for (const [surface, reading] of [['未知', '*'], ['𠮷', ''], ['abc', 'エービーシー'], ['カナ', 'カナ']]) assert.deepEqual(alignReading(surface, reading), [{ text: surface }]);
  assert.deepEqual(compact(alignReading('𠮷', 'ヨシ')), [['𠮷', 'よし']]);
});
test('offset validation, literal markup and gaps preserve the input', () => {
  const text = '😀 <b>桜</b>  ';
  const tokens = [{ surface: '桜', reading: 'サクラ', start: 6, end: 7 }];
  assert.equal(annotationsFromTokens(text, tokens).map((part) => part.text).join(''), text);
  assert.throws(() => annotationsFromTokens(text, [{ ...tokens[0], start: 5 }]));
});

const manifest = JSON.parse(await readFile(new URL('../vendor/readings/manifest.json', import.meta.url)));
const dictionary = JSON.parse(await readFile(new URL(`../vendor/readings/${manifest.readings.file}`, import.meta.url)));
const tokenizer = await Suzume.create({ preserveSymbols: true });
const engine = { tokenizer, dictionary };
const provider = { async analyze(texts) { return texts.map((text) => tokenize(engine, text)); } };
test('standard readings cover the missing demo words with inflections intact', () => {
  const tokens = tokenize(engine, '朝の空気は少し冷たく、子供たちが遊んでいます。私たちは温かいお茶を飲みます。');
  for (const [surface, reading] of [['朝', 'あさ'], ['冷たく', 'つめたく'], ['遊ん', 'あそん'], ['私', 'わたし'], ['温かい', 'あたたかい']]) {
    assert.equal(tokens.find((t) => t.surface === surface)?.reading, reading, surface);
  }
});
test.after(() => tokenizer.destroy());
test('compound coverage does not require spaces and ambiguous verbs remain explicit', () => {
  const text = '専門用語・技術用語を避ける';
  const tokens = tokenize(engine, text);
  assert.equal(tokens.find((t) => t.surface === '専門用語').reading, 'せんもんようご');
  assert.equal(tokens.find((t) => t.surface === '技術用語').reading, 'ぎじゅつようご');
  const verb = tokens.find((t) => t.surface === '避ける');
  assert.equal(verb.readingStatus, 'ambiguous');
  assert.deepEqual(new Set(verb.candidates), new Set(['さける', 'よける']));
  assert.equal(annotationsFromTokens(text, tokens).map((part) => part.text).join(''), text);
});
test('real Suzume + JMdict readings with emoji, rare kanji, whitespace and overrides', async () => {
  const text = '😀𠮷 日本では、春になると桜が咲きます。\n食べ物  今日';
  const [tokens] = await provider.analyze([text]);
  const parts = annotationsFromTokens(text, tokens, { 日本: 'にほん' });
  assert.equal(parts.map((part) => part.text).join(''), text);
  assert.ok(parts.some((part) => part.text === '咲' && part.reading === 'さ'));
  assert.ok(parts.some((part) => part.text === '日本' && part.reading === 'にほん'));
});
test('real engine maps normalized widths back to exact source offsets', () => {
  const text = 'ＡＢＣ ﾊﾟ 😀𠮷 桜が咲きます。';
  const tokens = tokenize(engine, text);
  assert.ok(tokens.some((token) => token.surface === '桜' && token.reading === 'さくら'));
  for (const token of tokens) assert.equal(text.slice(token.start, token.end), token.surface);
  assert.equal(annotationsFromTokens(text, tokens).map((part) => part.text).join(''), text);
});
test('strict lookup keeps 人気 ambiguous; preferred lookup reports its assumption', async () => {
  assert.equal(tokenize({ ...engine, readingPolicy: 'strict' }, '人気')[0].readingStatus, 'ambiguous');
  const preferred = tokenize(engine, '人気')[0];
  assert.equal(preferred.readingStatus, 'preferred');
  assert.ok(preferred.candidates.includes('ひとけ'));
  if (!manifest.alignment) return;
  const alignments = JSON.parse(await readFile(new URL(`../vendor/readings/${manifest.alignment.file}`, import.meta.url)));
  const tokens = tokenize({ ...engine, alignments }, '季節');
  const parts = annotationsFromTokens('季節', tokens);
  assert.ok(parts.some((part) => part.alignment === 'dictionary'));
  assert.equal(parts.map((part) => part.text).join(''), '季節');
});

function page(html) {
  const dom = new JSDOM(`<html lang="ja"><body><article>${html}</article></body></html>`);
  globalThis.MutationObserver = dom.window.MutationObserver;
  return dom.window.document.querySelector('article');
}
test('DOM preserves links, existing ruby, literal HTML and original text nodes', async () => {
  const root = page('<p>食べ物 <a href="#test">桜</a> <strong>今日</strong> &lt;img src=x&gt;</p><ruby>珈琲<rt>コーヒー</rt></ruby><code>日本</code><span contenteditable>日本</span><span data-yomigana-ignore>日本</span><span aria-hidden="true">春</span>');
  const originalHTML = root.innerHTML;
  const originalText = root.firstChild.firstChild;
  const link = root.querySelector('a');
  let clicks = 0;
  link.addEventListener('click', (event) => { event.preventDefault(); clicks++; });
  const reader = new yomigana({ root, provider });
  await reader.annotate();
  const count = root.querySelectorAll('[data-yomigana]').length;
  assert.ok(count >= 3);
  await reader.annotate();
  assert.equal(root.querySelectorAll('[data-yomigana]').length, count);
  assert.equal(root.querySelectorAll('ruby ruby').length, 0);
  assert.equal(root.querySelector('img'), null);
  assert.equal(root.querySelector('code ruby'), null);
  assert.equal(root.querySelector('[contenteditable] ruby'), null);
  assert.equal(root.querySelector('[data-yomigana-ignore] ruby'), null);
  assert.equal(root.querySelector('[aria-hidden] ruby'), null);
  link.click(); assert.equal(clicks, 1);
  reader.setVisible(false);
  assert.ok([...root.querySelectorAll('[data-yomigana] > rt')].every((rt) => rt.hidden));
  assert.equal(root.querySelector('ruby:not([data-yomigana]) rt').hidden, false);
  reader.restore();
  assert.equal(root.innerHTML, originalHTML);
  assert.equal(root.firstChild.firstChild, originalText);
  assert.equal(root.querySelector('a'), link);
});
async function waitUntil(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for observed annotation');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
test('observer annotates new and changed text without recursive ruby', async (t) => {
  const root = page('<p>hello</p>');
  const reader = new yomigana({ root, provider }).observe();
  t.after(() => reader.destroy());
  root.firstChild.firstChild.data = '桜が咲きます。';
  await waitUntil(() => root.querySelector('ruby'));
  await reader.tail;
  assert.ok(root.querySelector('ruby'));
  const count = root.querySelectorAll('ruby').length;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(root.querySelectorAll('ruby').length, count);
  const p = root.ownerDocument.createElement('p'); p.textContent = '今日の食べ物'; root.append(p);
  await waitUntil(() => p.querySelector('ruby'));
  await reader.tail;
  assert.ok(p.querySelector('ruby'));
  reader.destroy();
});
test('restore cancels delayed results and preserves host edits', async () => {
  const root = page('桜');
  let finish;
  const slow = { analyze() { return new Promise((resolve) => { finish = resolve; }); } };
  const reader = new yomigana({ root, provider: slow });
  const job = reader.annotate();
  await Promise.resolve();
  reader.restore();
  finish([[{ surface: '桜', reading: 'サクラ', start: 0, end: 1 }]]);
  await job;
  assert.equal(root.innerHTML, '桜');
  const fast = new yomigana({ root, provider });
  await fast.annotate();
  root.querySelector('ruby').firstChild.data = '梅';
  fast.restore();
  assert.equal(root.textContent, '梅');
});
test('long text is preserved when chunked', async () => {
  const text = '桜'.repeat(2100) + '😀 春\n今日。';
  const root = page(''); root.textContent = text;
  const reader = new yomigana({ root, provider });
  await reader.annotate(); reader.restore();
  assert.equal(root.textContent, text);
});

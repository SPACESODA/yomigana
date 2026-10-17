import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { annotationsFromTokens } from '../src/align.js';
import { prepareSpeechText, normalizeOverrides } from '../src/overrides.js';
import { globalOverrides as appOverrides } from '../presets/global-overrides.js';
import { yomigana } from '../src/yomigana.js';

function tokens(text) {
  let start = 0;
  return Array.from(text, surface => {
    const token = { surface, start, end: start + surface.length, reading: surface === '笑' ? 'えみ' : '' };
    start = token.end;
    return token;
  });
}
const provider = { async analyze(texts) { return texts.map(tokens); } };

test('literal app overrides cross token boundaries, preserve punctuation and convert all display formats', () => {
  const text = '〇〇です（笑）。(笑) 笑み';
  for (const [readingFormat, placeholder, laughter] of [['hiragana', 'なになに', 'わらい'], ['katakana', 'ナニナニ', 'ワライ'], ['romaji', 'naninani', 'warai']]) {
    const parts = annotationsFromTokens(text, tokens(text), appOverrides, { readingFormat });
    assert.equal(parts.map(part => part.text).join(''), text);
    assert.equal(parts.find(part => part.text === '〇〇').reading, placeholder);
    assert.deepEqual(parts.filter(part => part.text === '笑').slice(0, 2).map(part => part.reading), [laughter, laughter]);
    assert.ok(parts.filter(part => part.reading).every(part => !/[（）()]/.test(part.text)));
    assert.equal(parts.filter(part => part.text === '笑').at(-1).reading, readingFormat === 'hiragana' ? 'えみ' : readingFormat === 'katakana' ? 'エミ' : 'emi');
  }
});

test('longest match wins, exact widths differ, replacements are not processed twice', () => {
  const rules = [{ match: '〇', annotation: 'まる' }, { match: '〇〇', annotation: 'なになに' },
    { match: 'なになに', speech: 'REPLACED' }];
  assert.equal(prepareSpeechText('〇〇と〇', { overrides: rules }), 'なになにとまる');
  assert.equal(prepareSpeechText('（笑）(笑)（ 笑 ）', { overrides: appOverrides }), '（わらい）(わらい)（ 笑 ）');
  assert.equal(prepareSpeechText('笑う、笑顔、笑み、微笑、笑', { overrides: appOverrides }), '笑う、笑顔、笑み、微笑、笑');
});

test('omitted annotation keeps dictionary readings; blanks suppress annotation or speech independently', () => {
  const normal = [{ surface: '笑', start: 0, end: 1, reading: 'えみ' }];
  assert.deepEqual(annotationsFromTokens('笑', normal, [{ match: '笑', speech: '' }]), annotationsFromTokens('笑', normal));
  assert.deepEqual(annotationsFromTokens('笑', normal, [{ match: '笑', annotation: '' }]), [{ text: '笑' }]);
  assert.equal(prepareSpeechText('笑', { overrides: [{ match: '笑', annotation: '' }] }), '笑');
  assert.equal(prepareSpeechText('笑', { overrides: [{ match: '笑', annotation: 'わらい', speech: '' }] }), '');
  assert.equal(prepareSpeechText('（笑）', { overrides: [{ match: '（笑）', annotation: 'わらい' }] }), '（わらい）');
});

test('duplicates and invalid entries fail early, while legacy token maps remain compatible', () => {
  assert.throws(() => normalizeOverrides([{ match: '笑' }, { match: '笑' }]), /Duplicate/);
  for (const rules of [[{ match: '' }], [{ match: '笑', annotation: '（わらい）' }], [{ match: '笑', speech: null }]]) {
    assert.throws(() => normalizeOverrides(rules));
  }
  const text = '笑顔';
  const compound = [{ surface: text, start: 0, end: 2, reading: 'えがお' }];
  assert.deepEqual(annotationsFromTokens(text, compound, { 笑: 'わらい' }), annotationsFromTokens(text, compound));
  assert.deepEqual(annotationsFromTokens('笑', tokens('笑'), { 笑: null }), [{ text: '笑' }]);
  assert.throws(() => annotationsFromTokens('笑', [{ surface: '笑', start: 2, end: 3 }], appOverrides), /offset/);
});

test('literal matches may cut a token without inventing readings for its remaining fragment', () => {
  const result = annotationsFromTokens('東京都', [{ surface: '東京都', start: 0, end: 3, reading: 'とうきょうと' }], [{ match: '東京', annotation: 'とうきょう' }]);
  assert.equal(result.map(part => part.text).join(''), '東京都');
  assert.equal(result[0].reading, 'とうきょう');
  assert.deepEqual(result.at(-1), { text: '都' });
});

test('DOM speech combines ruby and emphasis safely, preserves line breaks and local priority', async () => {
  const dom = new JSDOM('<article lang="ja">〇〇です（笑）。<br><b>(</b>笑<i>)</i>。<span data-ym="まるまる">〇〇</span><span data-ym="えみ">笑</span><span aria-hidden="true">隠す</span></article>');
  const root = dom.window.document.querySelector('article');
  const reader = new yomigana({ root, provider, overrides: appOverrides });
  await reader.annotate();
  assert.equal(reader.speechText(), 'なになにです（わらい）。\n(わらい)。まるまるえみ');
  assert.equal(root.querySelector('[data-ym="まるまる"] rt').textContent, 'まるまる');
  assert.equal(root.querySelector('ruby').textContent, '〇〇なになに');
  assert.ok(root.querySelector('b') && root.querySelector('i'));
  await reader.setReadingFormat('romaji');
  reader.setVisible(false);
  assert.equal(reader.speechText(), 'なになにです（わらい）。\n(わらい)。まるまるえみ');
  reader.destroy();
  dom.window.close();
});

test('annotation matches cross sentence chunks but never flatten author formatting', async () => {
  const dom = new JSDOM('<article lang="ja">笑。笑 <b>（</b>笑<i>）</i></article>');
  const root = dom.window.document.querySelector('article');
  const reader = new yomigana({ root, provider, overrides: [{ match: '笑。笑', annotation: '' }, ...appOverrides] });
  await reader.annotate();
  assert.equal(root.querySelectorAll('ruby').length, 1);
  assert.equal(root.querySelector('ruby rt').textContent, 'えみ');
  assert.equal(reader.speechText(), '笑。笑 （わらい）');
  reader.destroy();
  dom.window.close();
});

test('global override list is optional and does not activate on a generic reader', async () => {
  const dom = new JSDOM('<article lang="ja">〇〇</article>');
  const root = dom.window.document.querySelector('article');
  const reader = new yomigana({ root, provider });
  await reader.annotate();
  assert.equal(root.querySelector('ruby'), null);
  assert.equal(reader.speechText(), '〇〇');
  reader.destroy();
  dom.window.close();
});

test('speech preparation honors data-ym on native and rendered Japanese scopes', () => {
  for (const html of ['<ja data-ym="うて">打て</ja>', '<span lang="ja" data-ym="うて">打て</span>']) {
    const dom = new JSDOM(html);
    assert.equal(prepareSpeechText(dom.window.document.body), 'うて');
    dom.window.close();
  }
});


test('application-specific empty-bottle sentence is not a library global preset', () => {
  const text = '飲み干して空にしました。';
  assert.equal(prepareSpeechText(text, { overrides: appOverrides }), text);
});

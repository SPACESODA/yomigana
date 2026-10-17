import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { yomigana } from '../src/yomigana.js';

const provider = { async analyze(texts) {
  return texts.map((text) => [...text.matchAll(/[桜花]/g)].map((match) => ({
    start: match.index, end: match.index + 1, surface: match[0],
    reading: match[0] === '桜' ? 'さくら' : 'はな',
  })));
} };

function copy(dom, root, range) {
  const doc = dom.window.document;
  range ||= doc.createRange();
  if (!range.startContainer || range.collapsed) range.selectNodeContents(root);
  const selection = doc.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const values = {};
  const event = new dom.window.Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { setData(type, text) { values[type] = text; } } });
  root.dispatchEvent(event);
  return { text: values['text/plain'], prevented: event.defaultPrevented };
}

test('selection modes copy original text, both, or kana while retaining punctuation', async () => {
  const dom = new JSDOM('<html lang="ja"><body><p>桜と花。</p></body></html>');
  const root = dom.window.document.querySelector('p');
  const reader = new yomigana({ root, provider });
  await reader.annotate();
  assert.equal(copy(dom, root).text, '桜と花。');
  reader.setSelection('both');
  assert.equal(copy(dom, root).text, '桜(さくら)と花(はな)。');
  reader.setSelection('reading');
  assert.equal(copy(dom, root).text, 'さくらとはな。');
  reader.setVisible(false);
  assert.equal(copy(dom, root).text, '桜と花。');
  reader.destroy();
  assert.equal(root.textContent, '桜と花。');
  assert.equal(copy(dom, root).prevented, false);
  dom.window.close();
});

test('one selection can cross readers with different modes and ordinary text', async () => {
  const dom = new JSDOM('<html lang="ja"><body><div>start <span id="a">桜</span> / <span id="b">花</span> end</div></body></html>');
  const doc = dom.window.document;
  const a = new yomigana({ root: doc.querySelector('#a'), provider });
  const b = new yomigana({ root: doc.querySelector('#b'), provider, selection: 'reading' });
  await a.annotate(); await b.annotate();
  assert.equal(copy(dom, doc.querySelector('div')).text, 'start 桜 / はな end');
  a.destroy();
  assert.equal(copy(dom, doc.querySelector('div')).text, 'start 桜 / はな end');
  b.destroy();
  dom.window.close();
});

test('partial selections and publisher ruby remain intact; readings are hidden from AT', async () => {
  const dom = new JSDOM('<html lang="ja"><body><p>桜<ruby>花<rt>はな</rt></ruby></p></body></html>');
  const doc = dom.window.document;
  const root = doc.querySelector('p');
  const original = root.innerHTML;
  const reader = new yomigana({ root, provider, selection: 'reading' });
  await reader.annotate();
  const ruby = root.querySelector('[data-yomigana]');
  assert.equal(ruby.getAttribute('aria-hidden'), null);
  assert.equal(ruby.querySelector('rt').getAttribute('aria-hidden'), 'true');
  assert.equal(ruby.querySelector('rt > span').hasAttribute('data-nosnippet'), true);
  assert.equal(ruby.querySelector('rt > span').getAttribute('aria-hidden'), 'true');
  assert.equal(root.querySelector('ruby:not([data-yomigana]) rt').getAttribute('aria-hidden'), null);
  const range = doc.createRange();
  range.setStart(ruby.firstChild, 0); range.setEnd(ruby.firstChild, 1);
  assert.equal(copy(dom, root, range).text, 'さくら');
  const readingText = ruby.querySelector('rt span').firstChild;
  range.setStart(readingText, 1); range.setEnd(readingText, 3);
  assert.equal(copy(dom, root, range).text, 'くら');
  reader.restore();
  assert.equal(root.innerHTML, original);
  await reader.annotate();
  assert.equal(copy(dom, root).text, 'さくら花はな');
  reader.destroy();
  dom.window.close();
});

test('invalid selection settings are rejected', () => {
  const dom = new JSDOM('<p></p>');
  assert.throws(() => new yomigana({ root: dom.window.document.querySelector('p'), provider, selection: 'invalid' }), /selection must/);
  dom.window.close();
});

test('parenthesized copy preserves okurigana and selection modes leave accessible markup intact', async () => {
  const dom = new JSDOM('<html lang="ja"><body><p>公園の桜が咲きます。</p></body></html>');
  const root = dom.window.document.querySelector('p');
  const sentenceProvider = { async analyze() { return [[
    { surface: '公園', reading: 'こうえん', start: 0, end: 2 },
    { surface: '桜', reading: 'さくら', start: 3, end: 4 },
    { surface: '咲きます', reading: 'さきます', start: 5, end: 9 },
  ]]; } };
  const reader = new yomigana({ root, provider: sentenceProvider, selection: 'both' });
  await reader.annotate();
  assert.equal(copy(dom, root).text, '公園(こうえん)の桜(さくら)が咲(さ)きます。');
  const markup = () => {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('[data-selection]').forEach((ruby) => ruby.removeAttribute('data-selection'));
    return clone.innerHTML;
  };
  const originalMarkup = markup();
  reader.setSelection('reading');
  assert.equal(copy(dom, root).text, 'こうえんのさくらがさきます。');
  assert.equal(markup(), originalMarkup);
  reader.setSelection('base');
  assert.equal(copy(dom, root).text, '公園の桜が咲きます。');
  assert.equal(markup(), originalMarkup);
  reader.destroy();
  dom.window.close();
});

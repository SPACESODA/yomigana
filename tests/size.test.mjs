import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { yomigana } from '../src/yomigana.js';

const provider = { async analyze(texts) {
  return texts.map((text) => [...text.matchAll(/桜/g)].map((match) => ({
    surface: '桜', reading: 'さくら', start: match.index, end: match.index + 1,
  })));
} };

test('size validates input before changing an existing reader', () => {
  const dom = new JSDOM('<div></div>');
  const reader = new yomigana({ root: dom.window.document.querySelector('div'), provider });
  assert.equal(reader.size, 60);
  for (const invalid of [0, -1, 101, NaN, Infinity, '60', null]) {
    assert.throws(() => reader.setSize(invalid), /size must/);
    assert.equal(reader.size, 60);
  }
  reader.destroy();
  dom.window.close();
});

test('size is scoped per reader, updates existing and future ruby, and preserves CSS overrides', async () => {
  const dom = new JSDOM('<html lang="ja"><body><div id="a" style="--yomigana-size:.8em">桜<ruby>桜<rt>さくら</rt></ruby></div><section id="b">桜</section></body></html>');
  const doc = dom.window.document;
  const a = new yomigana({ root: doc.querySelector('#a'), provider, size: 60 });
  const b = new yomigana({ root: doc.querySelector('#b'), provider, size: 50 });
  await a.annotate(); await b.annotate();
  const ruby = a.root.querySelector('[data-yomigana]');
  assert.equal(ruby.style.getPropertyValue('--yomigana-auto-size'), 'min(0.6em, calc(0.3em + 0.3rem))');
  a.setSize(72);
  const updatedSize = ruby.style.getPropertyValue('--yomigana-auto-size');
  assert.equal(updatedSize, 'min(0.72em, calc(0.36em + 0.36rem))');
  assert.equal(b.root.querySelector('[data-yomigana]').style.getPropertyValue('--yomigana-auto-size'), 'min(0.5em, calc(0.25em + 0.25rem))');
  assert.equal(a.root.style.getPropertyValue('--yomigana-size'), '.8em');
  assert.equal(a.root.querySelector('ruby:not([data-yomigana])').getAttribute('style'), null);
  const p = doc.createElement('p'); p.textContent = '桜'; a.root.append(p);
  await a.annotate();
  assert.equal(p.querySelector('ruby').style.getPropertyValue('--yomigana-auto-size'), updatedSize);
  a.restore(); await a.annotate();
  assert.equal(a.root.querySelector('[data-yomigana]').style.getPropertyValue('--yomigana-auto-size'), updatedSize);
  a.destroy(); b.destroy(); dom.window.close();
});

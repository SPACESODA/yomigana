import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { yomigana } from '../src/yomigana.js';

function fixture(html, options = {}) {
  const document = new JSDOM(html).window.document;
  let calls = 0;
  const provider = { async analyze(texts) {
    calls++;
    return texts.map((text) => [...text.matchAll(/[桜梅]/g)].map((match) => ({
      surface: match[0], reading: match[0] === '桜' ? 'さくら' : 'うめ', start: match.index, end: match.index + 1,
    })));
  } };
  const reader = new yomigana({ root: document.body, provider, ...options });
  return { document, reader, provider, calls: () => calls };
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for language update');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
test('inherited language, regional tags, nested overrides and empty language', async () => {
  const { document, reader } = fixture('<html lang="ja"><body><p id="inherited">桜</p><p lang="zh">桜<span id="nested" lang="JA-jp">梅</span></p><p lang="en">桜</p><p lang="" id="empty">桜</p><p data-yomigana-ignore><span lang="ja">桜</span></p></body></html>');
  await reader.annotate();
  assert.equal(document.querySelectorAll('ruby').length, 2);
  assert.ok(document.querySelector('#inherited ruby'));
  assert.ok(document.querySelector('#nested ruby'));
  assert.equal(document.querySelector('#empty ruby'), null);
  reader.destroy();
});
test('unmarked text is skipped by default; opting in does not override explicit non-Japanese', async () => {
  const html = '<p id="unknown">桜</p><p lang="zh">梅</p>';
  const strict = fixture(html);
  await strict.reader.annotate();
  assert.equal(strict.calls(), 0);
  const assumed = fixture(html, { assumeJapanese: true });
  await assumed.reader.annotate();
  assert.equal(assumed.document.querySelectorAll('ruby').length, 1);
  const all = fixture(html, { language: 'all' });
  await all.reader.annotate();
  assert.equal(all.document.querySelectorAll('ruby').length, 2);
  for (const f of [strict, assumed, all]) f.reader.destroy();
});
test('dynamic language and exclusion attributes remove and restore only owned annotations', async (t) => {
  const { document, reader } = fixture('<html lang="en"><body><section id="part" lang="zh"><p>桜</p><ruby>梅<rt>うめ</rt></ruby></section></body></html>');
  t.after(() => reader.destroy());
  reader.observe();
  const part = document.querySelector('#part');
  part.lang = 'ja';
  await until(() => part.querySelector('p ruby'));
  for (const [name, value] of [['lang','zh'], ['hidden',''], ['aria-hidden','true'], ['contenteditable','true'], ['data-yomigana-ignore','']]) {
    part.setAttribute(name, value);
    await until(() => !part.querySelector('p ruby'));
    assert.ok(part.querySelector('ruby:not([data-yomigana])'));
    if (name === 'lang') part.lang = 'ja-JP';
    else part.removeAttribute(name);
    await until(() => part.querySelector('p ruby'));
  }
});
test('scoped readers watch inherited language outside their root', async (t) => {
  const f = fixture('<html lang="zh"><body><article>桜</article></body></html>');
  f.reader.destroy();
  const reader = new yomigana({ root: f.document.querySelector('article'), provider: f.provider });
  t.after(() => reader.destroy());
  reader.observe();
  f.document.documentElement.lang = 'ja';
  await until(() => f.document.querySelector('article ruby'));
  f.document.documentElement.lang = 'en';
  await until(() => !f.document.querySelector('article ruby'));
});
test('new Japanese sections, moved content, host edits and visibility toggles', async (t) => {
  const f = fixture('<html lang="en"><body><section id="zh" lang="zh"></section></body></html>');
  t.after(() => f.reader.destroy());
  f.reader.observe();
  const p = f.document.createElement('p'); p.lang = 'ja'; p.textContent = '桜';
  f.document.body.append(p);
  await until(() => p.querySelector('ruby'));
  p.querySelector('ruby').firstChild.data = '梅';
  await until(() => p.querySelector('rt')?.textContent === 'うめ');
  await f.reader.tail;
  const before = f.calls();
  f.reader.setVisible(false);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(f.calls(), before);
  assert.equal(p.querySelector('rt').hidden, true);
  // Move an annotated subtree to a different inherited-language context.
  f.document.documentElement.lang = 'ja';
  p.removeAttribute('lang');
  await new Promise((resolve) => setTimeout(resolve, 200));
  await f.reader.tail;
  f.document.querySelector('#zh').append(p);
  await until(() => !p.querySelector('ruby'));
  assert.equal(p.textContent, '梅');
});
test('in-flight readings never annotate a newly non-Japanese region', async () => {
  const f = fixture('<html lang="ja"><body>桜</body></html>');
  let finish;
  const reader = new yomigana({ root: f.document.body, provider: { analyze: () => new Promise((resolve) => { finish = resolve; }) } });
  const pending = reader.annotate();
  await until(() => finish);
  f.document.body.lang = 'zh';
  finish([[{surface:'桜',reading:'さくら',start:0,end:1}]]);
  await pending;
  assert.equal(f.document.querySelector('ruby'), null);
  reader.destroy(); f.reader.destroy();
});

test('ja markers declare Japanese within mixed-language content and preserve wrappers', async () => {
  for (const outer of ['', 'lang="zh-Hant"', 'lang="en"']) {
    const html = `<html ${outer}><body><p><ja id="japanese">桜<strong>梅</strong></ja>（桜和梅）</p><p>桜</p></body></html>`;
    const { document, reader } = fixture(html);
    const marker = document.querySelector('ja');
    const strong = marker.querySelector('strong');
    const before = document.body.innerHTML;
    await reader.annotate();
    assert.equal(document.querySelectorAll('ruby').length, 2);
    assert.equal(marker.querySelectorAll('ruby').length, 2);
    assert.equal(document.querySelector('ja'), marker);
    assert.equal(marker.querySelector('strong'), strong);
    reader.restore();
    assert.equal(document.body.innerHTML, before);
    reader.destroy();
  }
});

test('ja respects explicit language overrides, nested scopes and exclusions', async () => {
  const { document, reader } = fixture(`<html lang="zh"><body>
    <ja id="allowed">桜<span lang="zh">梅</span><span lang="">梅</span><span lang="en"><ja>梅</ja></span></ja>
    <ja lang="zh">桜</ja><ja lang="">桜</ja><ja lang="JA-jp" id="explicit">梅</ja>
    <ja data-yomigana-ignore>桜</ja><code><ja>桜</ja></code><pre><ja>桜</ja></pre>
    <ja hidden>桜</ja><ja><ruby>桜<rt>さくら</rt></ruby></ja>
  </body></html>`);
  await reader.annotate();
  assert.equal(document.querySelectorAll('ruby[data-yomigana]').length, 3);
  assert.equal(document.querySelector('#allowed').querySelectorAll('ruby').length, 2);
  assert.ok(document.querySelector('#explicit ruby'));
  reader.destroy();
});

test('observed ja markers support insertion, language changes and movement out of scope', async (t) => {
  const { document, reader } = fixture('<html lang="zh"><body><p id="outside"></p></body></html>');
  t.after(() => reader.destroy());
  reader.observe();
  const marker = document.createElement('ja');
  marker.innerHTML = '<span>桜</span>';
  document.body.append(marker);
  await until(() => marker.querySelector('ruby'));
  marker.lang = 'zh';
  await until(() => !marker.querySelector('ruby'));
  marker.removeAttribute('lang');
  await until(() => marker.querySelector('ruby'));
  document.querySelector('#outside').append(marker.firstElementChild);
  await until(() => !document.querySelector('#outside ruby'));
  assert.equal(document.querySelector('#outside').textContent, '桜');
  const scoped = new yomigana({ root: marker, provider: { async analyze() {
    return [[{ surface: '梅', reading: 'うめ', start: 0, end: 1 }]];
  } } });
  t.after(() => scoped.destroy());
  marker.textContent = '梅';
  await scoped.annotate();
  assert.ok(marker.querySelector('ruby'));
});

test('user example sentences annotate only the Japanese and leave the translation intact', async () => {
  const first = '急いで出かけたので、財布さえ持ってきませんでした。';
  const second = '今週末空いてる？';
  const document = new JSDOM(`<html lang="zh-Hant"><body><p><ja>${first}</ja></p><p><ja>${second}</ja>（這週末有空嗎？）</p></body></html>`).window.document;
  const analyzed = [];
  const reader = new yomigana({ root: document.body, provider: { async analyze(texts) {
    analyzed.push(...texts);
    return texts.map((text) => Object.entries({ 財布: 'さいふ', 今週末: 'こんしゅうまつ' })
      .filter(([surface]) => text.includes(surface))
      .map(([surface, reading]) => ({ surface, reading, start: text.indexOf(surface), end: text.indexOf(surface) + surface.length })));
  } } });
  await reader.annotate();
  assert.deepEqual(analyzed, [first, second]);
  assert.equal(document.querySelectorAll('ja ruby').length, 2);
  assert.equal(document.querySelector('p:last-child').lastChild.data, '（這週末有空嗎？）');
  reader.destroy();
  assert.equal(document.querySelector('p:last-child').textContent, `${second}（這週末有空嗎？）`);
});

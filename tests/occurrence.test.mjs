import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { yomigana } from '../src/yomigana.js';

function fixture(html, options = {}, Reader = yomigana) {
  const dom = new JSDOM(`<html lang="ja"><body><article>${html}</article></body></html>`);
  const root = dom.window.document.querySelector('article');
  const calls = [];
  const provider = { async analyze(texts) {
    calls.push(...texts);
    return texts.map((text) => [...text.matchAll(/[深夜桜梅]/gu)].map((match) => ({
      surface: match[0], reading: { 深: 'ふか', 夜: 'よる', 桜: 'さくら', 梅: 'うめ' }[match[0]],
      start: match.index, end: match.index + match[0].length,
    })));
  } };
  const reader = new Reader({ root, provider, ...options });
  return { dom, root, reader, calls };
}
function copy(f) {
  const { document } = f.dom.window;
  const selection = document.getSelection();
  selection.removeAllRanges();
  const range = document.createRange(); range.selectNodeContents(f.root); selection.addRange(range);
  let copied;
  const event = new f.dom.window.Event('copy', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { setData(type, value) { copied = value; } } });
  f.root.dispatchEvent(event);
  return copied;
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for occurrence override');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('data-ym overrides one occurrence independently of token boundaries and global overrides', async (t) => {
  const f = fixture('<p>夜が深々と更ける。</p><p>夜が<span data-ym="しんしん">深々</span>と更ける。</p>',
    { overrides: { 深: 'み', 深々: 'ふかぶか' } });
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  await f.reader.annotate();
  assert.equal(f.root.querySelector('span[data-ym] rt').textContent, 'しんしん');
  assert.ok([...f.root.querySelectorAll('p:first-child rt')].some((rt) => rt.textContent === 'み'));
  assert.equal(f.root.querySelector('span[data-ym]').querySelectorAll('ruby').length, 1);
  assert.ok(!f.calls.includes('深々'));
  assert.ok(f.calls.includes('夜が深々と更ける。'));
});

test('kana overrides switch formats, copy displayed readings, preserve visibility and restore the DOM', async (t) => {
  for (const kana of ['しんしん', 'シンシン']) {
    const f = fixture(`<span data-ym=" ${kana} ">深々</span>`, { selection: 'both' });
    t.after(() => { f.reader.destroy(); f.dom.window.close(); });
    const original = f.root.innerHTML;
    const span = f.root.firstChild, text = span.firstChild;
    let clicks = 0; span.addEventListener('click', () => clicks++);
    await f.reader.annotate();
    await f.reader.annotate();
    assert.equal(span.querySelectorAll('ruby').length, 1);
    for (const [format, expected] of [['hiragana', 'しんしん'], ['katakana', 'シンシン'], ['romaji', 'shinshin']]) {
      await f.reader.setReadingFormat(format);
      assert.equal(span.querySelector('rt').textContent, expected);
      assert.equal(copy(f), `深々(${expected})`);
      assert.equal(span.getAttribute('data-ym'), ` ${kana} `);
    }
    f.reader.setSelection('reading'); assert.equal(copy(f), 'shinshin');
    f.reader.setSelection('base'); assert.equal(copy(f), '深々');
    f.reader.setVisible(false);
    await f.reader.setReadingFormat('hiragana');
    assert.equal(span.querySelector('rt').hidden, true);
    f.reader.setSelection('reading'); assert.equal(copy(f), '深々');
    assert.equal(f.calls.length, 0);
    span.click(); assert.equal(clicks, 1);
    f.reader.restore();
    assert.equal(f.root.innerHTML, original);
    assert.equal(f.root.firstChild, span);
    assert.equal(span.firstChild, text);
  }
});

test('adjacent text nodes form one reading unit and retain their identities on restore', async (t) => {
  const f = fixture('<span data-ym="しんしん"></span>');
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  const span = f.root.firstChild;
  const nodes = ['', '深', '々'].map((text) => f.dom.window.document.createTextNode(text));
  span.append(...nodes);
  await f.reader.annotate();
  assert.equal(span.querySelectorAll('ruby').length, 1);
  assert.equal(span.querySelector('rt').textContent, 'しんしん');
  f.reader.restore();
  assert.deepEqual([...span.childNodes], nodes);
});

test('empty, invalid and nested-markup overrides fall back to normal annotation without flattening', async (t) => {
  const f = fixture('<span data-ym="">深々</span><span data-ym="shinshin">深々</span><span data-ym="&lt;img src=x&gt;">深々</span><span data-ym="しんしん">深<em>々</em></span>');
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  const em = f.root.querySelector('em'), original = f.root.innerHTML;
  await f.reader.annotate();
  assert.equal(f.root.querySelector('img'), null);
  assert.equal(f.root.querySelector('em'), em);
  assert.ok([...f.root.querySelectorAll('rt')].every((rt) => rt.textContent === 'ふか'));
  f.reader.restore(); assert.equal(f.root.innerHTML, original);
});

test('occurrence overrides retain Japanese language scoping and all existing exclusions', async (t) => {
  const f = fixture('<span data-ym="しんしん">深々</span><span lang="zh" data-ym="しんしん">深々</span><code><span data-ym="しんしん">深々</span></code><span data-yomigana-ignore data-ym="しんしん">深々</span><span hidden data-ym="しんしん">深々</span><span contenteditable data-ym="しんしん">深々</span><ruby data-ym="しんしん">深々<rt>ふかぶか</rt></ruby>');
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  await f.reader.annotate();
  assert.equal(f.root.querySelectorAll('ruby[data-yomigana]').length, 1);
  f.dom.window.document.documentElement.lang = 'zh';
  await f.reader.refresh();
  assert.equal(f.root.querySelectorAll('ruby[data-yomigana]').length, 0);
});

test('observe handles attribute updates, insertion, removal, moved content and host edits', async (t) => {
  const f = fixture('<span id="manual" data-ym="ふかぶか">深々</span><span id="auto">深々</span>');
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  await f.reader.annotate(); f.reader.observe();
  const manual = f.root.querySelector('#manual'), auto = f.root.querySelector('#auto');
  manual.setAttribute('data-ym', 'しんしん');
  await until(() => manual.querySelector('rt')?.textContent === 'しんしん');
  manual.removeAttribute('data-ym');
  await until(() => manual.querySelector('rt')?.textContent === 'ふか');
  auto.setAttribute('data-ym', 'シンシン');
  await until(() => auto.querySelector('rt')?.textContent === 'しんしん');
  const inserted = f.dom.window.document.createElement('span');
  inserted.setAttribute('data-ym', 'よる'); inserted.textContent = '夜'; f.root.append(inserted);
  await until(() => inserted.querySelector('rt')?.textContent === 'よる');
  const appendedGeneration = f.reader.generation;
  inserted.append('夜');
  await until(() => f.reader.generation > appendedGeneration && inserted.querySelectorAll('ruby').length === 1
    && inserted.querySelector('ruby')?.firstChild.data === '夜夜');
  const other = f.dom.window.document.createElement('span'); f.root.append(other);
  other.append(...auto.childNodes);
  await until(() => other.querySelector('rt')?.textContent === 'ふか');
  const generation = f.reader.generation;
  inserted.querySelector('ruby').firstChild.data = '桜';
  await until(() => f.reader.generation > generation && inserted.querySelector('ruby')?.firstChild.data === '桜' && inserted.querySelector('rt')?.textContent === 'よる');
  await f.reader.tail;
  f.reader.restore(); assert.equal(inserted.textContent, '桜');
});

test('new occurrence override wins over a pending tokenizer result', async (t) => {
  const f = fixture('<span>深々</span>');
  f.reader.destroy();
  let resolve;
  f.reader = new yomigana({ root: f.root, provider: { analyze: () => new Promise((done) => { resolve = done; }) } });
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  const pending = f.reader.annotate(); await until(() => resolve);
  f.root.firstChild.setAttribute('data-ym', 'しんしん');
  resolve([[{ surface: '深々', reading: 'ふかぶか', start: 0, end: 2 }]]);
  await pending;
  assert.equal(f.root.querySelector('ruby'), null);
  await f.reader.annotate();
  assert.equal(f.root.querySelector('rt').textContent, 'しんしん');
});

test('offline distribution supports occurrence overrides and format conversion without analysis', async (t) => {
  const context = { setTimeout, clearTimeout, location: { href: 'file:///example/index.html' } };
  runInNewContext(await readFile(new URL('../dist/offline/runtime.js', import.meta.url), 'utf8'), context);
  const f = fixture('<span data-ym="シンシン">深々</span>', {}, context.yomiganaWeb.yomigana);
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  await f.reader.annotate();
  await f.reader.setReadingFormat('romaji');
  assert.equal(f.root.querySelector('rt').textContent, 'shinshin');
  assert.equal(f.calls.length, 0);
});

test('occurrence overrides win over global suppression and retain okurigana, sizing and accessibility', async (t) => {
  const f = fixture('<span style="--yomigana-color: red" data-ym="タベモノ">食べ物</span>',
    { overrides: { 食べ物: null }, size: 80 });
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  await f.reader.annotate();
  assert.deepEqual([...f.root.querySelectorAll('rt')].map((rt) => rt.textContent), ['た', 'もの']);
  for (const ruby of f.root.querySelectorAll('ruby')) {
    assert.match(ruby.style.getPropertyValue('--yomigana-auto-size'), /0\.8em/);
    assert.equal(ruby.querySelector('rt').getAttribute('aria-hidden'), 'true');
    assert.ok(ruby.querySelector('rt span[data-nosnippet]'));
  }
  assert.equal(f.root.firstChild.style.getPropertyValue('--yomigana-color'), 'red');
  await f.reader.setReadingFormat('romaji');
  assert.deepEqual([...f.root.querySelectorAll('rt')].map((rt) => rt.textContent), ['ta', 'mono']);
  assert.equal(f.calls.length, 0);
});

test('observed edits and removal of kana outside ruby refresh the whole occurrence without loops', async (t) => {
  const f = fixture('<span data-ym="たべもの">食べ物</span>');
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  await f.reader.annotate(); f.reader.observe();
  const span = f.root.firstChild;
  const kana = [...span.childNodes].find((node) => node.nodeType === 3 && node.data === 'べ');
  const beforeEdit = f.reader.generation;
  kana.data = 'の';
  await until(() => f.reader.generation > beforeEdit && span.querySelectorAll('ruby').length === 1);
  f.reader.restore(); assert.equal(span.textContent, '食の物');
  span.textContent = '食べ物';
  await f.reader.annotate(); f.reader.observe();
  const beforeRemoval = f.reader.generation;
  [...span.childNodes].find((node) => node.nodeType === 3 && node.data === 'べ').remove();
  await until(() => f.reader.generation > beforeRemoval && span.querySelectorAll('ruby').length === 1);
  assert.equal(span.querySelector('ruby').firstChild.data, '食物');
  await f.reader.tail;
  const stable = f.reader.generation;
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(f.reader.generation, stable);
  f.reader.restore(); assert.equal(span.textContent, '食物');
});

test('data-ym on a native ja element scopes Japanese and updates its override', async (t) => {
  const f = fixture('<ja data-ym="しんしん">深々</ja>');
  f.dom.window.document.documentElement.lang = 'zh';
  t.after(() => { f.reader.destroy(); f.dom.window.close(); });
  await f.reader.annotate();
  assert.equal(f.root.querySelector('rt').textContent, 'しんしん');
  f.reader.observe();
  f.root.firstChild.setAttribute('data-ym', 'ふかぶか');
  await until(() => f.root.querySelector('rt')?.textContent === 'ふかぶか');
  f.reader.restore();
  assert.equal(f.root.textContent, '深々');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { yomigana } from '../src/index.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../site/playground.js', import.meta.url), 'utf8');

test('public pages share the yomu favicon and homepage terminology', async () => {
  const icon = (source) => {
    const dom = new JSDOM(source);
    const href = dom.window.document.querySelector('link[rel="icon"]')?.getAttribute('href');
    dom.window.close();
    return href;
  };
  const expected = icon(await readFile(new URL('../yomu/index.html', import.meta.url), 'utf8'));
  assert.ok(expected?.startsWith('data:image/svg+xml,'));
  for (const page of ['index.html', 'demo-basic/index.html', 'demo-online/index.html', 'demo-offline/index.html']) {
    assert.equal(icon(await readFile(new URL(`../${page}`, import.meta.url), 'utf8')), expected, page);
  }
  assert.doesNotMatch(html, /sandbox/i);
  assert.match(html, /id="playground-status"/);
});

test('all public pages include the Umami analytics script in <head>', async () => {
  const expectedSrc = 'https://cloud.umami.is/script.js';
  const expectedId = '8771ed9f-edd3-4665-bf16-1bc95940af08';
  for (const page of ['index.html', 'yomu/index.html', 'demo-basic/index.html', 'demo-online/index.html', 'demo-offline/index.html']) {
    const content = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    const dom = new JSDOM(content);
    const script = dom.window.document.querySelector('head > script[src="https://cloud.umami.is/script.js"]');
    assert.ok(script, `Umami script tag must be present in head of ${page}`);
    assert.equal(script.getAttribute('data-website-id'), expectedId, `Website ID must match in ${page}`);
    assert.equal(script.hasAttribute('defer'), true, `Script must be defer in ${page}`);
    dom.window.close();
  }
});

test('homepage Yomu preview includes a dedicated play link', () => {
  const dom = new JSDOM(html);
  const play = dom.window.document.querySelector('.demo-preview-play');
  assert.equal(play?.getAttribute('href'), './yomu/index.html');
  assert.equal(play?.getAttribute('aria-label'), 'Open Yomu');
  dom.window.close();
});

test('homepage static ruby annotations are hidden from screen readers and protected from SEO snippets', () => {
  const dom = new JSDOM(html);
  const rts = dom.window.document.querySelectorAll('rt');
  assert.ok(rts.length > 0);
  for (const rt of rts) {
    assert.equal(rt.getAttribute('aria-hidden'), 'true');
    const span = rt.querySelector('span');
    assert.ok(span, 'rt should wrap reading in span');
    assert.equal(span.hasAttribute('data-nosnippet'), true);
    assert.equal(span.getAttribute('aria-hidden'), 'true');
  }
  dom.window.close();
});

async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Playground did not reach the expected state');
}

function fixture(t, { failAsset = false, analyze } = {}) {
  const dom = new JSDOM(html, { url: 'file:///example/index.html', runScripts: 'outside-only' });
  const { window } = dom;
  t.after(() => window.close());
  const providers = [];
  const assets = [];
  window.console.error = () => {};
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } } });
  window.yomiganaWeb = {
    yomigana,
    createLocalProvider(options) {
      const provider = {
        options, stopped: false,
        analyze: analyze || (async (texts) => texts.map((surface) => [{ surface, start: 0, end: surface.length, reading: 'さくら' }])),
        destroy() { this.stopped = true; },
      };
      providers.push(provider);
      return provider;
    },
  };
  window.document.head.append = (element) => {
    assets.push(element.src);
    queueMicrotask(() => failAsset ? element.onerror() : element.onload());
  };
  const get = (id) => window.document.getElementById(id);
  get('playground-input').value = '桜';
  window.eval(script);
  return { window, get, providers, assets };
}

test('homepage reuses alignment providers, loads optional data on demand and disposes resources', async (t) => {
  const { window, get, providers, assets } = fixture(t);
  await until(() => get('status-text').textContent === 'Ready');
  assert.equal(assets.length, 3);
  get('align-kanji').click();
  await until(() => providers.length === 2 && get('status-text').textContent === 'Ready');
  assert.equal(assets.length, 4);
  get('align-word').click();
  await until(() => get('status-text').textContent === 'Ready');
  get('align-kanji').click();
  await until(() => get('status-text').textContent === 'Ready');
  assert.equal(providers.length, 2);
  get('fmt-romaji').click();
  await until(() => get('status-text').textContent === 'Ready');
  assert.equal(get('align-kanji').disabled, true);
  assert.equal(get('fmt-romaji').getAttribute('aria-pressed'), 'true');
  assert.equal(get('playground-output').querySelector('rt').textContent, 'sakura');
  window.dispatchEvent(new window.PageTransitionEvent('pagehide'));
  assert.ok(providers.every((provider) => provider.stopped));
});

test('homepage prevents stale rendering after input changes', async (t) => {
  const jobs = [];
  const { window, get } = fixture(t, { analyze: (texts) => new Promise((resolve) => jobs.push({ texts, resolve })) });
  await until(() => jobs.length === 1);
  get('playground-input').value = '春';
  get('playground-input').dispatchEvent(new window.Event('input'));
  await until(() => jobs.length === 2);
  jobs[1].resolve([[{ surface: '春', start: 0, end: 1, reading: 'はる' }]]);
  await until(() => get('status-text').textContent === 'Ready');
  jobs[0].resolve([[{ surface: '桜', start: 0, end: 1, reading: 'さくら' }]]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const ruby = get('playground-output').querySelector('ruby');
  assert.equal(ruby.firstChild.textContent, '春');
  assert.equal(ruby.querySelector('rt').textContent, 'はる');
});

test('homepage reports asset loading failures and clipboard rejection honestly', async (t) => {
  const { get } = fixture(t, { failAsset: true });
  await until(() => get('playground-status').dataset.state === 'error');
  assert.equal(get('fmt-romaji').disabled, true);
  assert.equal(get('playground-output').textContent, '桜');
  get('hero-copy').click();
  await until(() => get('hero-copy-text').textContent === 'Copy failed');
});

test('homepage reports annotation failures and can retry on an edit', async (t) => {
  let fail = true;
  const { window, get } = fixture(t, { analyze: async (texts) => {
    if (fail) throw new Error('Reading request failed');
    return texts.map((surface) => [{ surface, start: 0, end: surface.length, reading: 'さくら' }]);
  } });
  await until(() => get('playground-status').dataset.state === 'error');
  fail = false;
  get('playground-input').dispatchEvent(new window.Event('input'));
  await until(() => get('status-text').textContent === 'Ready');
  assert.equal(get('playground-output').querySelector('rt').textContent, 'さくら');
});

test('homepage supports engine switching on the playground toolbar', async (t) => {
  const { get, providers, assets } = fixture(t);
  await until(() => get('status-text').textContent === 'Ready');
  assert.equal(get('engine-suzume').getAttribute('aria-pressed'), 'true');
  assert.equal(get('engine-kuromoji').getAttribute('aria-pressed'), 'false');
  get('engine-kuromoji').click();
  await until(() => providers.length === 2 && get('status-text').textContent === 'Ready');
  assert.equal(get('engine-kuromoji').getAttribute('aria-pressed'), 'true');
  assert.equal(get('engine-suzume').getAttribute('aria-pressed'), 'false');
  assert.ok(assets.some((src) => src.includes('kuromoji-dict.js')));
});

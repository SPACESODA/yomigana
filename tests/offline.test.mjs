import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { createLocalProvider } from '../src/offline-provider.js';

const root = new URL('../', import.meta.url);
test('offline provider validates engine and engine-specific policies', () => {
  assert.throws(() => createLocalProvider({ engine: 'other' }), /engine must/);
  assert.throws(() => createLocalProvider({ engine: 'kuromoji', readingPolicy: 'strict' }), /only supported/);
  const provider = createLocalProvider({ engine: 'suzume' });
  provider.destroy();
});
test('generated Kuromoji offline bundle preserves dictionaries and analyzes without fetch', async () => {
  const context = { atob, Blob, Response, DecompressionStream, URL, setTimeout, clearTimeout,
    location: { href: 'file:///example/demo-offline/index.html' },
    fetch() { throw new Error('Offline Kuromoji must not fetch'); },
  };
  for (const file of ['kuromoji-dict.js', 'runtime.js']) {
    runInNewContext(await readFile(new URL(`dist/offline/${file}`, root), 'utf8'), context);
  }
  const data = context.yomiganaOfflineAssets.kuromoji;
  assert.equal(Object.keys(data).length, 12);
  for (const [name, encoded] of Object.entries(data)) {
    assert.deepEqual(Buffer.from(encoded, 'base64'), await readFile(new URL(`vendor/kuromoji/dict/${name}.dat.gz`, root)));
  }
  const provider = context.yomiganaWeb.createLocalProvider({ engine: 'kuromoji' });
  try {
    const text = '😀 長すぎる文言を無視した言葉遣い。';
    const [tokens] = await provider.analyze([text]);
    assert.equal(tokens.map((token) => token.surface).join(''), text);
    for (const [surface, reading] of [['長', 'なが'], ['文言', 'もんごん'], ['無視', 'むし'], ['遣い', 'づかい']]) {
      assert.equal(tokens.find((token) => token.surface === surface)?.reading, reading);
    }
  } finally { provider.destroy(); }
  await assert.rejects(provider.analyze(['桜']), /stopped/);
  delete context.yomiganaOfflineAssets.kuromoji;
  const missing = context.yomiganaWeb.createLocalProvider({ engine: 'kuromoji' });
  await assert.rejects(missing.analyze(['桜']), /kuromoji-dict/);
  missing.destroy();
});
test('offline wrappers preserve original WASM bytes and dictionary data', async () => {
  const context = {};
  for (const file of ['suzume-wasm.js', 'readings.js', 'alignments.js']) {
    runInNewContext(await readFile(new URL(`dist/offline/${file}`, root), 'utf8'), context);
  }
  const info = JSON.parse(await readFile(new URL('dist/offline/build-info.json', root)));
  const assets = context.yomiganaOfflineAssets;
  const bytes = Buffer.from(assets.wasmURL.split(',')[1], 'base64');
  assert.deepEqual(bytes, await readFile(new URL('vendor/suzume/suzume.wasm', root)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), info.originalWasmSHA256);
  const manifest = JSON.parse(await readFile(new URL('vendor/readings/manifest.json', root)));
  assert.deepEqual(JSON.parse(JSON.stringify(assets.readings)), JSON.parse(await readFile(new URL(`vendor/readings/${manifest.readings.file}`, root))));
  if (manifest.alignment) assert.deepEqual(JSON.parse(JSON.stringify(assets.alignments)), JSON.parse(await readFile(new URL(`vendor/readings/${manifest.alignment.file}`, root))));
});
test('demo uses classic bootstrap and consistent 60 percent defaults', async () => {
  const html = await readFile(new URL('demo-offline/index.html', root), 'utf8');
  const css = await readFile(new URL('src/yomigana.css', root), 'utf8');
  assert.match(html, /src="\.\/yomigana-loader\.js"/);
  assert.doesNotMatch(html, /<script type="module"/);
  assert.match(html, /id="size"[^>]*max="100"[^>]*value="60"/);
  assert.match(html, /60%<\/output>/);
  assert.match(css, /--yomigana-size, var\(--yomigana-auto-size/);
});

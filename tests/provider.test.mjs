import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = (await readFile(new URL('../src/provider.js', import.meta.url), 'utf8'))
  .replace('export function', 'function')
  .replace('import.meta.url', '"https://assets.example/src/provider.js"');

function harness(origin, fail = false, options = {}) {
  const workers = [];
  const blobs = [];
  const revoked = [];
  class TestURL extends URL {
    static createObjectURL(blob) { blobs.push(blob); return 'blob:demo-worker'; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  class Worker {
    constructor(url) {
      if (fail) throw new Error('Worker blocked');
      this.url = String(url);
      workers.push(this);
    }
    postMessage(data) { this.request = data; }
    terminate() { this.stopped = true; }
  }
  const context = { URL: TestURL, Blob, Worker, location: { origin }, setTimeout, clearTimeout };
  runInNewContext(source, context);
  return { provider: context.createLocalProvider(options), workers, blobs, revoked };
}

test('same-origin provider uses the worker directly and cancels pending work', async () => {
  const { provider, workers, blobs } = harness('https://assets.example');
  const pending = provider.analyze(['text']);
  assert.equal(workers[0].url, 'https://assets.example/src/worker.js');
  assert.equal(blobs.length, 0);
  provider.destroy();
  await assert.rejects(pending, /stopped/);
  assert.equal(workers[0].stopped, true);
  await assert.rejects(provider.analyze(['again']), /stopped/);
});

test('engine choice is explicit, validated and forwarded to the worker', async () => {
  const { provider, workers } = harness('https://assets.example', false, { engine: 'kuromoji' });
  const pending = provider.analyze(['桜']);
  assert.equal(workers[0].request.options.engine, 'kuromoji');
  provider.destroy();
  await assert.rejects(pending, /stopped/);
  assert.throws(() => harness('https://assets.example', false, { engine: 'other' }), /engine/);
  assert.throws(() => harness('https://assets.example', false, { engine: 'kuromoji', readingPolicy: 'strict' }), /only supported/);
});

test('CDN worker imports its absolute module URL and releases its bootstrap', async () => {
  const { provider, workers, blobs, revoked } = harness('https://website.example');
  const pending = provider.analyze(['text']);
  assert.equal(workers[0].url, 'blob:demo-worker');
  assert.equal(await blobs[0].text(), 'import "https://assets.example/src/worker.js";');
  workers[0].onmessage({ data: { id: workers[0].request.id, results: [[]] } });
  assert.deepEqual(await pending, [[]]);
  assert.deepEqual(revoked, ['blob:demo-worker']);
  provider.destroy();
  assert.equal(revoked.length, 1);
});

test('CDN bootstrap is released on worker construction failure', async () => {
  const { provider, revoked } = harness('https://website.example', true);
  await assert.rejects(provider.analyze(['text']), /blocked/);
  assert.deepEqual(revoked, ['blob:demo-worker']);
});

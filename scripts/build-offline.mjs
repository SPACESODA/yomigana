import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist/offline');
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(root, 'vendor/readings/manifest.json'), 'utf8'));
const wasm = await readFile(resolve(root, 'vendor/suzume/suzume.wasm'));
async function dataScript(file, key, data) {
  await writeFile(resolve(output, file), `/* Generated; do not edit. See NOTICE.txt. */\nglobalThis.yomiganaOfflineAssets ||= {};\nglobalThis.yomiganaOfflineAssets.${key} = ${JSON.stringify(data)};\n`);
}
await dataScript('suzume-wasm.js', 'wasmURL', `data:application/wasm;base64,${wasm.toString('base64')}`);
await dataScript('readings.js', 'readings', JSON.parse(await readFile(resolve(root, 'vendor/readings', manifest.readings.file), 'utf8')));
await dataScript('alignments.js', 'alignments', manifest.alignment
  ? JSON.parse(await readFile(resolve(root, 'vendor/readings', manifest.alignment.file), 'utf8')) : null);
const kuromoji = {};
for (const name of (await readdir(resolve(root, 'vendor/kuromoji/dict'))).sort()) {
  if (name.endsWith('.dat.gz')) kuromoji[name.slice(0, -7)] = (await readFile(resolve(root, 'vendor/kuromoji/dict', name))).toString('base64');
}
await dataScript('kuromoji-dict.js', 'kuromoji', kuromoji);
const options = { bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true,
  external: ['node:*'], define: { 'import.meta.url': 'globalThis.location.href' }, legalComments: 'eof' };
await build({ ...options, entryPoints: [resolve(root, 'src/index.js')], outfile: resolve(output, 'runtime.js'), globalName: 'yomiganaWeb',
  plugins: [{ name: 'offline-provider', setup(builder) {
    builder.onResolve({ filter: /(^|\/)provider\.js$/ }, () => ({ path: resolve(root, 'src/offline-provider.js') }));
  } }] });
await cp(resolve(root, 'vendor/suzume/LICENSE'), resolve(output, 'SUZUME-LICENSE.txt'));
await cp(resolve(root, 'vendor/readings/NOTICE.txt'), resolve(output, 'NOTICE.txt'));
for (const [source, target] of [['LICENSE-2.0.txt', 'KUROMOJI-LICENSE.txt'], ['NOTICE.md', 'KUROMOJI-NOTICE.txt'], ['dependencies.txt', 'KUROMOJI-DEPENDENCIES.txt']]) {
  await cp(resolve(root, 'vendor/kuromoji', source), resolve(output, target));
}
await writeFile(resolve(output, 'build-info.json'), JSON.stringify({ suzume: JSON.parse(await readFile(resolve(root, 'node_modules/@libraz/suzume/package.json'))).version,
  kuromoji: JSON.parse(await readFile(resolve(root, 'vendor/kuromoji/build-info.json'))),
  originalWasmSHA256: createHash('sha256').update(wasm).digest('hex'), dictionary: manifest,
  note: 'Generated wrappers preserve original data and WASM bytes; upstream files are not modified.' }, null, 2));
console.log('Offline-compatible library built in dist/offline/.');

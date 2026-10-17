import { build } from 'esbuild';
import { mkdir, cp, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const upstream = resolve(root, 'node_modules/kuromoji');
const output = resolve(root, 'vendor/kuromoji');
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: `export { default as Tokenizer } from 'kuromoji/src/Tokenizer.js';
export { default as DynamicDictionaries } from 'kuromoji/src/dict/DynamicDictionaries.js';`, resolveDir: root },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  outfile: resolve(output, 'runtime.js'), legalComments: 'eof',
  banner: { js: '/* Generated Kuromoji adapter bundle. See LICENSE-2.0.txt, NOTICE.md and dependencies.txt. */' },
});
await cp(resolve(upstream, 'dict'), resolve(output, 'dict'), { recursive: true });
for (const name of ['LICENSE-2.0.txt', 'NOTICE.md']) await cp(resolve(upstream, name), resolve(output, name));
await cp(resolve(root, 'node_modules/doublearray/LICENSE.txt'), resolve(output, 'dependencies.txt'));
const files = await readdir(resolve(output, 'dict'));
let dictionaryBytes = 0;
const dictionarySHA256 = {};
for (const file of files.sort()) {
  const bytes = await readFile(resolve(output, 'dict', file));
  dictionaryBytes += bytes.length;
  dictionarySHA256[file] = createHash('sha256').update(bytes).digest('hex');
}
await writeFile(resolve(output, 'build-info.json'), JSON.stringify({
  kuromoji: JSON.parse(await readFile(resolve(upstream, 'package.json'))).version,
  dictionary: 'Bundled IPADIC; original .dat.gz files preserved', dictionaryBytes, dictionarySHA256,
  runtimeBytes: (await stat(resolve(output, 'runtime.js'))).size,
}, null, 2));
console.log(`Built Kuromoji with ${dictionaryBytes} bytes of compressed dictionary data.`);

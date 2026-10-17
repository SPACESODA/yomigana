import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { compileReadings } from './dictionary-build.mjs';

const root = new URL('../', import.meta.url);
const cache = new URL('.dictionary-cache/', root);
const output = new URL('vendor/readings/', root);
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
await cp(new URL('node_modules/@libraz/suzume/dist/', root), new URL('vendor/suzume/', root), { recursive: true });
const version = '3.6.2+20260928191014';
const alignmentVersion = '2.3.1+2026-09-25';
async function download(url, name) {
  const path = new URL(name, cache);
  try { await access(path); } catch {
    console.log(`Downloading ${name} (build time only)...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
    await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  }
  return path;
}
async function extract(url, archive, json) {
  const path = await download(url, archive);
  execFileSync('tar', ['-xzf', fileURLToPath(path), '-C', fileURLToPath(cache)]);
  return JSON.parse((await readFile(new URL(json, cache), 'utf8')).replace(/^\uFEFF/, ''));
}
const sourceURL = `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(version)}/jmdict-eng-${encodeURIComponent(version)}.json.tgz`;
const source = await extract(sourceURL, `jmdict-${version}.tgz`, 'jmdict-eng-3.6.2.json');
const entries = compileReadings(source.words, { full: process.argv.includes('--full') });
async function asset(prefix, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const name = `${prefix}-${hash}.json`;
  await writeFile(new URL(name, output), bytes);
  await writeFile(new URL(`${name}.gz`, output), gzipSync(bytes));
  return { file: name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
}
const manifest = { schema: 1, version, scope: process.argv.includes('--full') ? 'full' : 'common-with-compounds', sourceURL,
  license: 'CC-BY-SA-4.0', attribution: 'JMdict: Electronic Dictionary Research and Development Group; JSON conversion: scriptin/jmdict-simplified',
  licenseURL: 'https://creativecommons.org/licenses/by-sa/4.0/',
  readings: await asset('readings', entries), words: Object.keys(entries).length };
if (process.argv.includes('--alignment')) {
  const data = await extract(`https://github.com/Doublevil/JmdictFurigana/releases/download/${encodeURIComponent(alignmentVersion)}/JmdictFurigana.json.tar.gz`, `jmdict-furigana-${alignmentVersion}.tgz`, 'JmdictFurigana.json');
  const alignments = Object.create(null);
  for (const row of data) {
    if (entries[row.text]?.some(([reading]) => reading === row.reading)) {
      (alignments[row.text] ||= Object.create(null))[row.reading] = row.furigana.map(({ ruby, rt }) => [ruby, rt || '']);
    }
  }
  manifest.alignment = { ...await asset('alignment', alignments), version: alignmentVersion,
    source: 'https://github.com/Doublevil/JmdictFurigana', license: 'CC-BY-SA (see upstream data terms)' };
}
await writeFile(new URL('manifest.json', output), JSON.stringify(manifest, null, 2));
await writeFile(new URL('NOTICE.txt', output), `Derived JMdict reading data, with definitions removed and optional common-word filtering.\n${manifest.attribution}\n${manifest.license}: ${manifest.licenseURL}\nSource: ${sourceURL}\nOptional alignment data: https://github.com/Doublevil/JmdictFurigana (upstream data is Attribution-ShareAlike).\nDictionary data is licensed separately from application code.\n`);
await download('https://raw.githubusercontent.com/libraz/suzume/v0.9.11/LICENSE', 'suzume-LICENSE');
await cp(new URL('suzume-LICENSE', cache), new URL('vendor/suzume/LICENSE', root));
console.log(JSON.stringify(manifest, null, 2));
console.log('Runtime files are self-hosted. Run npm run dev.');

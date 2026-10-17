import { Tokenizer, DynamicDictionaries } from '../vendor/kuromoji/runtime.js';
import { hasKanji, toHiragana } from './align.js';

async function decode(bytes, name, Type) {
  const header = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  // fetch may already decode gzip when the server sends Content-Encoding.
  const data = header[0] === 31 && header[1] === 139
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes;
  if (!data.byteLength || data.byteLength % Type.BYTES_PER_ELEMENT) throw new Error(`Invalid Kuromoji dictionary ${name}`);
  return new Type(data);
}

async function createTokenizer(load) {
  const dic = new DynamicDictionaries();
  dic.loadTrie(...await Promise.all([load('base', Int32Array), load('check', Int32Array)]));
  dic.loadTokenInfoDictionaries(...await Promise.all(['tid', 'tid_pos', 'tid_map'].map((name) => load(name, Uint8Array))));
  dic.loadConnectionCosts(await load('cc', Int16Array));
  dic.loadUnknownDictionaries(...await Promise.all([
    load('unk', Uint8Array), load('unk_pos', Uint8Array), load('unk_map', Uint8Array),
    load('unk_char', Uint8Array), load('unk_compat', Uint32Array), load('unk_invoke', Uint8Array),
  ]));
  return new Tokenizer(dic);
}

export async function initializeOfflineEngine(assets, alignment) {
  if (!assets?.kuromoji) throw new Error('Load dist/offline/kuromoji-dict.js before annotating with kuromoji.');
  const tokenizer = await createTokenizer(async (name, Type) => {
    const encoded = assets.kuromoji[name];
    if (typeof encoded !== 'string') throw new Error(`Missing offline Kuromoji dictionary ${name}`);
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return decode(bytes.buffer, name, Type);
  });
  return { tokenizer, alignments: alignment === 'kanji' ? assets.alignments : null };
}

export async function initializeEngine({
  kuromojiDictionaryURL = new URL('../vendor/kuromoji/dict/', import.meta.url).href,
  dictionaryURL = new URL('../vendor/readings/manifest.json', import.meta.url).href,
  fineAlignment = false, alignment = fineAlignment ? 'kanji' : 'word', readingPolicy,
} = {}) {
  if (!['word', 'kanji'].includes(alignment)) throw new Error('alignment must be "word" or "kanji"');
  if (readingPolicy !== undefined) throw new Error('readingPolicy is only supported by the suzume engine');
  const base = new URL(kuromojiDictionaryURL);
  if (!['http:', 'https:'].includes(base.protocol) || !base.pathname.endsWith('/')) {
    throw new Error('kuromojiDictionaryURL must be an absolute HTTP(S) directory URL ending in /');
  }
  async function load(name, Type) {
    const response = await fetch(new URL(`${name}.dat.gz`, base));
    if (!response.ok) throw new Error(`Cannot load Kuromoji dictionary ${name}: HTTP ${response.status}`);
    return decode(await response.arrayBuffer(), name, Type);
  }
  const tokenizer = await createTokenizer(load);
  let alignments;
  if (alignment === 'kanji') {
    try {
      const response = await fetch(dictionaryURL);
      if (!response.ok) throw new Error('Alignment manifest unavailable');
      const manifest = await response.json();
      if (manifest.schema === 1 && manifest.alignment) {
        const data = await fetch(new URL(manifest.alignment.file, dictionaryURL));
        if (data.ok) alignments = await data.json();
      }
    } catch { /* Optional mappings fall back to kana-anchor alignment. */ }
  }
  return { tokenizer, alignments };
}

export function tokenize(engine, text) {
  let cursor = 0;
  // Kuromoji 0.1.2 mixes code-point and UTF-16 lengths around surrogate pairs.
  // Isolate those runs rather than risk losing adjacent source characters.
  const raw = [...text.matchAll(/[^\uD800-\uDFFF]+|[\uD800-\uDFFF]+/g)].flatMap(([part]) =>
    /[\uD800-\uDFFF]/.test(part) ? [{ surface_form: part, word_type: 'UNKNOWN' }] : engine.tokenizer.tokenize(part));
  const tokens = raw.map((token) => {
    const surface = token.surface_form;
    // Kuromoji positions count Unicode characters, not UTF-16 code units.
    // Its surfaces reconstruct the input, so derive exact DOM offsets directly.
    if (!surface || !text.startsWith(surface, cursor)) throw new Error('Kuromoji token offsets do not match the original text');
    const start = cursor;
    const end = cursor += surface.length;
    const kanji = hasKanji(surface);
    const reading = kanji && token.word_type === 'KNOWN' && /^[\u30a1-\u30fa\u3041-\u3096\u30fc]+$/u.test(token.reading || '')
      ? toHiragana(token.reading) : '';
    return {
      surface, start, end, reading, baseForm: token.basic_form, pos: token.pos,
      readingStatus: reading ? 'analyzer' : kanji ? 'unknown' : 'plain',
      candidates: reading ? [reading] : [],
      alignment: engine.alignments?.[surface]?.[reading],
    };
  });
  if (cursor !== text.length) throw new Error('Kuromoji did not preserve the original text');
  return tokens;
}

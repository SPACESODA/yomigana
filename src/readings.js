import { hasKanji, toHiragana } from './align.js';

export function originalOffsets(original, normalized) {
  if (original === normalized) return new Map(Array.from({ length: original.length + 1 }, (_, i) => [i, i]));
  const offsets = new Map([[0, 0]]);
  let rebuilt = '';
  for (const { segment, index } of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(original)) {
    offsets.set(rebuilt.length, index);
    rebuilt += segment.normalize('NFKC');
    offsets.set(rebuilt.length, index + segment.length);
  }
  return rebuilt === normalized ? offsets : null;
}
function matchesPOS(tags, pos) {
  if (pos === 'VERB') return tags.some((tag) => /^v[1-5ks]/.test(tag));
  if (pos === 'ADJ') return tags.some((tag) => tag.startsWith('adj'));
  if (pos === 'NOUN') return tags.some((tag) => /^(n($|-)|vs|adj-na)/.test(tag));
  if (pos === 'ADV') return tags.some((tag) => tag.startsWith('adv'));
  if (pos === 'PRON') return tags.includes('pn');
  return true;
}
export function inflectReading(base, surface, reading, tags) {
  const match = base.match(/^(.*[\p{Script=Han}々〆])([ぁ-ゖ]*)$/u);
  if (!match || !surface.startsWith(match[1])) return null;
  const [, stem, ending] = match;
  const suffix = surface.slice(stem.length);
  if (!/^[ぁ-ゖ]*$/u.test(suffix) || !reading.endsWith(ending)) return null;
  // Irregular kanji stems change pronunciation (来る -> 来た); do not guess them.
  if (tags.some((tag) => tag === 'vk' || tag === 'vs-s' || tag === 'v5r-i') || base === '良い' || base === '好い') return null;
  const valid = tags.some((tag) => {
    if (tag === 'v1' && ending.endsWith('る')) {
      const prefix = ending.slice(0, -1);
      return ['','る','れ','ろ','よ','よう','られ','られる','させ','させる'].some((tail) => suffix === prefix + tail);
    }
    if (tag.startsWith('v5')) {
      const row = { 'う': ['わ','い','う','え','お','っ'], 'く': ['か','き','く','け','こ','い'], 'ぐ': ['が','ぎ','ぐ','げ','ご','い'], 'す': ['さ','し','す','せ','そ'], 'つ': ['た','ち','つ','て','と','っ'], 'ぬ': ['な','に','ぬ','ね','の','ん'], 'ぶ': ['ば','び','ぶ','べ','ぼ','ん'], 'む': ['ま','み','む','め','も','ん'], 'る': ['ら','り','る','れ','ろ','っ'] }[ending.at(-1)];
      return row?.some((tail) => suffix === ending.slice(0, -1) + tail);
    }
    if (tag === 'adj-i' && ending.endsWith('い')) return ['い','く','けれ','かっ','かろ'].some((tail) => suffix === ending.slice(0, -1) + tail);
    return false;
  });
  return valid ? reading.slice(0, ending ? -ending.length : undefined) + suffix : null;
}
export function validateReadingPolicy(policy) {
  if (!['preferred', 'strict'].includes(policy)) throw new Error('readingPolicy must be "preferred" or "strict"');
}
export function resolveReading(token, dictionary, readingPolicy = 'preferred') {
  if (!hasKanji(token.surface)) return { reading: '', readingStatus: 'plain', candidates: [] };
  const inflected = ['VERB', 'ADJ'].includes(token.pos) && token.baseForm !== token.surface;
  const key = inflected ? token.baseForm : token.surface;
  const rows = Object.hasOwn(dictionary, key) ? dictionary[key] : [];
  const matched = rows.filter(([, tags]) => matchesPOS(tags, token.pos)).map(([reading, tags, priority = 0]) => {
    const kana = toHiragana(reading);
    return { reading: inflected ? inflectReading(key, token.surface, kana, tags) : kana, priority };
  }).filter((row) => row.reading);
  const candidates = [...new Set(matched.map((row) => row.reading))];
  const preferred = [...new Set(matched.filter((row) => row.priority === 1).map((row) => row.reading))];
  // A dictionary preference is not contextual disambiguation. Retain all
  // candidates for diagnostics and never break ties by dictionary order.
  const reading = candidates.length === 1 ? candidates[0] : readingPolicy === 'preferred' && preferred.length === 1 ? preferred[0] : '';
  return { reading, candidates,
    readingStatus: reading ? (candidates.length > 1 ? 'preferred' : inflected ? 'inflected' : 'dictionary') : candidates.length ? 'ambiguous' : 'unknown' };
}

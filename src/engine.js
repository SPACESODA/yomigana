import { Suzume } from '../vendor/suzume/index.js';
import { resolveReading, originalOffsets, validateReadingPolicy } from './readings.js';

export async function initializeEngine({ dictionaryURL = new URL('../vendor/readings/manifest.json', import.meta.url).href, fineAlignment = false, alignment = fineAlignment ? 'kanji' : 'word', readingPolicy = 'preferred' } = {}) {
  if (!['word', 'kanji'].includes(alignment)) throw new Error('alignment must be "word" or "kanji"');
  validateReadingPolicy(readingPolicy);
  async function json(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Cannot load reading data: ${url}. Run npm run setup.`);
    return response.json();
  }
  const manifest = await json(dictionaryURL);
  if (manifest.schema !== 1) throw new Error('Unsupported reading dictionary format');
  const dictionary = await json(new URL(manifest.readings.file, dictionaryURL));
  const alignments = alignment === 'kanji' && manifest.alignment
    ? await json(new URL(manifest.alignment.file, dictionaryURL)).catch(() => null) : null;
  const tokenizer = await Suzume.create({ preserveSymbols: true, preserveCase: true });
  return { tokenizer, dictionary, alignments, readingPolicy, destroy: () => tokenizer.destroy() };
}
export function tokenize(engine, text) {
  const { normalizedText, morphemes } = engine.tokenizer.analyzeWithNormalizedText(text);
  const offsets = originalOffsets(text, normalizedText);
  if (!offsets) return [];
  return morphemes.flatMap((token) => {
    const start = offsets.get(token.startUtf16);
    const end = offsets.get(token.endUtf16);
    if (start === undefined || end === undefined || end <= start) return [];
    const surface = text.slice(start, end);
    const result = resolveReading(token, engine.dictionary, engine.readingPolicy);
    const alignment = engine.alignments?.[surface]?.[result.reading];
    return [{ ...token, surface, start, end, ...result, alignment }];
  });
}

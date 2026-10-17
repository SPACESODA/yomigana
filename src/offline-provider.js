import { Suzume } from '../vendor/suzume/index.js';
import { tokenize } from './engine.js';
import { validateReadingPolicy } from './readings.js';
import { initializeOfflineEngine, tokenize as tokenizeKuromoji } from './kuromoji-engine.js';

/** Offline-compatible runtime. Hosted integrations retain the worker provider. */
export function createLocalProvider({ engine = 'suzume', fineAlignment = false, alignment = fineAlignment ? 'kanji' : 'word', readingPolicy } = {}) {
  if (!['suzume', 'kuromoji'].includes(engine)) throw new Error('engine must be "suzume" or "kuromoji"');
  if (engine === 'kuromoji' && readingPolicy !== undefined) throw new Error('readingPolicy is only supported by the suzume engine');
  if (!['word', 'kanji'].includes(alignment)) throw new Error('alignment must be "word" or "kanji"');
  validateReadingPolicy(readingPolicy ?? 'preferred');
  const analyzeText = engine === 'kuromoji' ? tokenizeKuromoji : tokenize;
  let enginePromise;
  let disposed = false;
  let tail = Promise.resolve();
  async function initialize() {
    const assets = globalThis.yomiganaOfflineAssets;
    if (engine === 'kuromoji') return initializeOfflineEngine(assets, alignment);
    if (!assets?.wasmURL || !assets?.readings) throw new Error('Load dist/offline/suzume-wasm.js and dist/offline/readings.js before annotating.');
    const tokenizer = await Suzume.create({ wasmPath: assets.wasmURL, preserveSymbols: true, preserveCase: true });
    return { tokenizer, dictionary: assets.readings, alignments: alignment === 'kanji' ? assets.alignments : null, readingPolicy: readingPolicy ?? 'preferred' };
  }
  return {
    analyze(texts) {
      const job = tail.then(async () => {
        if (disposed) throw new Error('Reading provider stopped');
        enginePromise ||= initialize().catch((error) => { enginePromise = undefined; throw error; });
        const engine = await enginePromise;
        if (disposed) throw new Error('Reading provider stopped');
        const results = [];
        for (const text of texts) {
          // Yield between requests; this fallback avoids file-origin worker restrictions.
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (disposed) throw new Error('Reading provider stopped');
          results.push(analyzeText(engine, text));
        }
        return results;
      });
      tail = job.catch(() => {});
      return job;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      const pending = enginePromise;
      enginePromise = undefined;
      pending?.then((engine) => engine.tokenizer.destroy?.()).catch(() => {});
    },
  };
}

import { yomigana, createLocalProvider, globalOverrides } from '../src/index.js';

const size = 60;
const defaultEngine = 'kuromoji'; // Change to 'suzume' for the smaller Suzume + JMdict engine.
const requestedEngine = new URL(location.href).searchParams.get('engine');
const engine = ['suzume', 'kuromoji'].includes(requestedEngine) ? requestedEngine : defaultEngine;
const readingFormat = 'hiragana'; // Or 'katakana', 'romaji'; only kanji receive annotations.
const perKanji = ['kanji', 'fine'].includes(new URL(location.href).searchParams.get('alignment'));
const provider = createLocalProvider({ engine, alignment: perKanji ? 'kanji' : 'word' });
const readers = [...document.querySelectorAll('[data-annotate]')].map((root) =>
  new yomigana({ root, provider, size, readingFormat, overrides: globalOverrides })
);

async function annotatePage() {
  for (const reader of readers) {
    await reader.annotate();
    reader.observe();
  }
}

// Optional showcase UI. Annotation also works without demo-controls.js.
if (globalThis.yomiganaDemoControls) {
  globalThis.yomiganaDemoControls({ readers, perKanji, engine, annotatePage });
} else {
  annotatePage().catch(console.error);
}

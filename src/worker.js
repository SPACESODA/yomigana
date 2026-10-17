let engine;
async function initialize(options = {}) {
  const adapter = await import(options.engine === 'kuromoji' ? './kuromoji-engine.js' : './engine.js');
  return { adapter, instance: await adapter.initializeEngine(options) };
}
self.onmessage = async ({ data: { id, texts, options } }) => {
  try {
    engine ||= initialize(options);
    const { adapter, instance } = await engine;
    self.postMessage({ id, results: texts.map((text) => adapter.tokenize(instance, text)) });
  } catch (error) {
    engine = undefined;
    self.postMessage({ id, error: error.message || String(error) });
  }
};

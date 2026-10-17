export function createLocalProvider(options = {}) {
  options = { ...options };
  if (!['suzume', 'kuromoji'].includes(options.engine ?? 'suzume')) throw new Error('engine must be "suzume" or "kuromoji"');
  if (options.engine === 'kuromoji' && options.readingPolicy !== undefined) throw new Error('readingPolicy is only supported by the suzume engine');
  let worker;
  let disposed = false;
  let bootstrapURL;
  let sequence = 0;
  const pending = new Map();
  function reset(error) {
    worker?.terminate();
    worker = undefined;
    if (bootstrapURL) URL.revokeObjectURL(bootstrapURL);
    bootstrapURL = undefined;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  }
  return {
    async analyze(texts) {
      if (disposed) throw new Error('Reading provider stopped');
      if (!worker) {
        const workerURL = new URL('./worker.js', import.meta.url);
        let entryURL = workerURL;
        // Workers need a same-origin entry; its module imports can use a CORS-enabled CDN.
        if (workerURL.origin !== globalThis.location.origin) {
          bootstrapURL = URL.createObjectURL(new Blob([
            `import ${JSON.stringify(workerURL.href)};`,
          ], { type: 'text/javascript' }));
          entryURL = bootstrapURL;
        }
        try {
          worker = new Worker(entryURL, { type: 'module' });
        } catch (error) {
          reset(error);
          throw error;
        }
        worker.onmessage = ({ data }) => {
          if (bootstrapURL) URL.revokeObjectURL(bootstrapURL);
          bootstrapURL = undefined;
          const request = pending.get(data.id);
          if (!request) return;
          pending.delete(data.id);
          clearTimeout(request.timer);
          if (data.error) request.reject(new Error(data.error));
          else request.resolve(data.results);
        };
        worker.onerror = () => reset(new Error('Reading worker failed. Check the dictionary files and browser console.'));
      }
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => reset(new Error('Loading readings timed out. Try again.')), 90000);
        pending.set(id, { resolve, reject, timer });
        try { worker.postMessage({ id, texts, options }); }
        catch (error) { reset(error); }
      });
    },
    destroy() { disposed = true; reset(new Error('Reading provider stopped')); },
  };
}

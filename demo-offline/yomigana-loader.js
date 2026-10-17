/* Classic scripts load from file:// without fetching local JSON or WASM. */
(async () => {
  function script(path) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = path;
      element.onload = resolve;
      element.onerror = () => reject(new Error(`Cannot load ${path}. Keep demo-offline/ and dist/ together in the project folder.`));
      document.head.append(element);
    });
  }
  globalThis.loadYomiganaDemoAssets = async (engine, perKanji) => {
    if (engine === 'kuromoji') {
      await script('../dist/offline/kuromoji-dict.js');
    } else {
      await script('../dist/offline/suzume-wasm.js');
      await script('../dist/offline/readings.js');
    }
    if (perKanji) {
      await script('../dist/offline/alignments.js').catch(() => {});
    }
    await script('../dist/offline/runtime.js');
  };
  globalThis.yomiganaDemoLoadError = (error) => {
    document.querySelector('#status').textContent = error.message;
    const retry = document.querySelector('#retry');
    retry.hidden = false;
    retry.addEventListener('click', () => location.reload(), { once: true });
  };
  await script('./yomigana-setup.js').catch(globalThis.yomiganaDemoLoadError);
})();

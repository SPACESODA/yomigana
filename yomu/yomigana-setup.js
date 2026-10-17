(() => {
  // Uses Kuromoji via the prebuilt offline bundle loaded in yomu/index.html.
  const { yomigana, createLocalProvider } = globalThis.yomiganaWeb || {};
  const provider = createLocalProvider ? createLocalProvider({ engine: 'kuromoji' }) : null;

  // Default reading size: 68%. Annotated content is rendered into #reading.
  const reader = yomigana && provider ? new yomigana({ root: '#reading', provider, overrides: globalThis.yomiganaOverrides ?? [], size: 68, selection: 'both' }) : null;
  function disposeReader() { reader?.destroy(); provider?.destroy(); }

  // Expose reader instance and cleanup function for yomu.js.
  globalThis.reader = reader;
  globalThis.disposeReader = disposeReader;
})();


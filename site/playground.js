(() => {
  const byId = (id) => document.getElementById(id);
  const input = byId('playground-input');
  const output = byId('playground-output');
  const status = byId('playground-status');
  const size = byId('ruby-size');
  const controls = document.querySelectorAll('.playground-toolbar button, .playground-toolbar input');
  let api;
  let reader;
  let engine = 'suzume';
  let format = 'hiragana';
  let alignment = 'word';
  let visible = true;
  let revision = 0;
  let debounce;
  let composing = false;
  let alignmentScript;
  let kuromojiScript;
  const providers = new Map();
  const localFile = location.protocol === 'file:';

  function setStatus(state, message) {
    status.dataset.state = state;
    byId('status-text').textContent = message;
    output.setAttribute('aria-busy', String(state === 'loading'));
  }

  function updateControls() {
    controls.forEach((control) => { control.disabled = !api; });
    for (const [id, active] of [
      ['engine-suzume', engine === 'suzume'], ['engine-kuromoji', engine === 'kuromoji'],
      ['fmt-hiragana', format === 'hiragana'], ['fmt-romaji', format === 'romaji'],
      ['align-word', alignment === 'word' || format === 'romaji'],
      ['align-kanji', alignment === 'kanji' && format !== 'romaji'],
    ]) {
      byId(id).classList.toggle('active', active);
      byId(id).setAttribute('aria-pressed', String(active));
    }
    byId('align-kanji').disabled = !api || format === 'romaji';
  }

  function copyButton(id, content) {
    const button = byId(id);
    const label = button.querySelector('span');
    const original = label.textContent;
    let reset;
    label.setAttribute('aria-live', 'polite');
    button.addEventListener('click', async () => {
      button.disabled = true;
      clearTimeout(reset);
      try {
        await navigator.clipboard.writeText(content());
        label.textContent = 'Copied!';
      } catch {
        label.textContent = 'Copy failed';
      } finally {
        button.disabled = false;
        reset = setTimeout(() => { label.textContent = original; }, 1800);
      }
    });
  }

  copyButton('hero-copy', () => "import { yomigana } from './src/index.js';");
  copyButton('code-copy-btn', () => document.querySelector('.code-content code').textContent);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error(`Cannot load ${src}`)); };
      document.head.append(script);
    });
  }

  function invalidate() {
    revision++;
    clearTimeout(debounce);
    reader?.destroy();
    reader = null;
    output.textContent = input.value;
    byId('char-count').textContent = `${input.value.length.toLocaleString()} / 5,000`;
  }

  async function render() {
    invalidate();
    if (!api) return;
    const current = revision;
    const grouping = format === 'romaji' ? 'word' : alignment;
    setStatus('loading', 'Adding readings…');
    try {
      if (localFile && engine === 'kuromoji') {
        kuromojiScript ||= loadScript('./dist/offline/kuromoji-dict.js').catch((error) => {
          kuromojiScript = null;
          throw error;
        });
        await kuromojiScript;
      }
      if (localFile && grouping === 'kanji') {
        alignmentScript ||= loadScript('./dist/offline/alignments.js').catch((error) => {
          alignmentScript = null;
          throw error;
        });
        await alignmentScript;
      }
      if (current !== revision) return;
      const key = `${engine}:${grouping}`;
      if (!providers.has(key)) providers.set(key, api.createLocalProvider({ engine, alignment: grouping }));
      const instance = new api.yomigana({
        root: output, provider: providers.get(key), size: Number(size.value),
        readingFormat: format,
      });
      reader = instance;
      instance.setVisible(visible);
      await instance.annotate();
      if (current === revision) setStatus('ready', input.value.trim() ? 'Ready' : 'Enter Japanese text');
    } catch (error) {
      if (current !== revision) return;
      setStatus('error', 'Readings unavailable. Edit the text or reload to retry.');
      console.error('Playground annotation failed:', error);
    }
  }

  function scheduleInput() {
    invalidate();
    if (composing || !api) return;
    setStatus('loading', 'Adding readings…');
    debounce = setTimeout(render, 250);
  }

  input.addEventListener('compositionstart', () => { composing = true; invalidate(); });
  input.addEventListener('compositionend', () => { composing = false; scheduleInput(); });
  input.addEventListener('input', scheduleInput);
  document.querySelectorAll('.preset-chip').forEach((button) => {
    button.addEventListener('click', () => { input.value = button.dataset.text; void render(); });
  });
  for (const value of ['suzume', 'kuromoji']) {
    byId(`engine-${value}`).addEventListener('click', () => {
      engine = value;
      updateControls();
      void render();
    });
  }
  for (const value of ['hiragana', 'romaji']) {
    byId(`fmt-${value}`).addEventListener('click', () => {
      format = value;
      output.dataset.format = value;
      updateControls();
      void render();
    });
  }
  for (const value of ['word', 'kanji']) {
    byId(`align-${value}`).addEventListener('click', () => {
      alignment = value;
      updateControls();
      void render();
    });
  }
  size.addEventListener('input', () => {
    byId('ruby-size-val').textContent = `${size.value}%`;
    reader?.setSize(Number(size.value));
  });
  window.addEventListener('pagehide', () => {
    invalidate();
    providers.forEach((provider) => provider.destroy());
    providers.clear();
  });
  // Make demo showcase cards fully clickable
  document.querySelectorAll('.demo-card, .small-demo-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('a, button, input, textarea')) return;
      const targetLink = card.querySelector('a.demo-action');
      if (targetLink) targetLink.click();
    });
  });

  async function initialize() {
    updateControls();
    byId('char-count').textContent = `${input.value.length.toLocaleString()} / 5,000`;
    setStatus('loading', 'Loading readings…');
    try {
      if (localFile) {
        await loadScript('./dist/offline/suzume-wasm.js');
        await loadScript('./dist/offline/readings.js');
        await loadScript('./dist/offline/runtime.js');
        api = globalThis.yomiganaWeb;
      } else {
        api = await import('../src/index.js');
      }
      if (!api?.yomigana) throw new Error('Reading library unavailable');
      updateControls();
      await render();
    } catch (error) {
      api = null;
      updateControls();
      output.textContent = input.value;
      setStatus('error', 'Could not load readings. Reload to retry.');
      console.error('Playground loading failed:', error);
    }
  }
  void initialize();
})();

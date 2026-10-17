import { hasKanji, annotationsFromTokens } from './align.js';
import { createLocalProvider } from './provider.js';
import { normalizeOverrides, prepareSpeechText, overrideReadingTokens } from './overrides.js';
import { registerSelection, validateSelection } from './selection.js';
import { validateReadingFormat } from './romaji.js';
export { alignReading } from './align.js';

const SKIP = 'ruby,rt,rp,script,style,noscript,textarea,input,select,option,button,code,pre,svg,math,[contenteditable]:not([contenteditable="false"]),[data-yomigana-ignore],[hidden],[aria-hidden="true"]';
const ATTRIBUTES = ['lang', 'hidden', 'aria-hidden', 'contenteditable', 'data-yomigana-ignore', 'data-ym'];
let nextId = 0;

function automaticSize(size) {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > 100) {
    throw new Error('size must be a number greater than 0 and at most 100');
  }
  // Full ratio at or below 1rem; progressively smaller ratios for larger text.
  // CSS resolves em against the ruby base and rem against the document font size.
  return `min(${size / 100}em, calc(${size / 200}em + ${size / 200}rem))`;
}

/** Annotates text nodes within one root; inline elements and event handlers survive. */
export class yomigana {
  constructor({ root, provider, overrides = {}, onStatus = () => {}, cacheSize = 300, language = 'ja', assumeJapanese = false, selection = 'base', size = 60, readingFormat = 'hiragana' } = {}) {
    this.root = typeof root === 'string' ? document.querySelector(root) : root;
    if (!this.root) throw new Error('yomigana requires an existing root element');
    if (!['ja', 'all'].includes(language)) throw new Error('language must be "ja" or "all"');
    this.language = language;
    this.assumeJapanese = Boolean(assumeJapanese);
    validateSelection(selection);
    this.selection = selection;
    validateReadingFormat(readingFormat);
    this.readingFormat = readingFormat;
    this.sizeStyle = automaticSize(size);
    this.size = size;
    this.provider = provider || createLocalProvider();
    this.ownsProvider = !provider;
    normalizeOverrides(overrides);
    this.overrides = overrides;
    this.onStatus = onStatus;
    this.cacheSize = cacheSize;
    this.id = `yg-${++nextId}`;
    this.cache = new Map();
    this.processed = new WeakMap();
    this.replacements = new Map();
    this.occurrenceContexts = new WeakMap();
    this.tail = Promise.resolve();
    this.generation = 0;
    this.destroyed = false;
    this.visible = true;
  }
  speechText(source = this.root) {
    return prepareSpeechText(source, { overrides: this.overrides });
  }
  annotate() {
    if (this.destroyed) return Promise.reject(new Error('Annotator is destroyed'));
    const generation = this.generation;
    const job = this.tail.then(() => this._annotate(generation));
    this.tail = job.catch(() => {});
    return job;
  }
  _eligible(node) {
    return this.root.contains(node) && !node.parentElement?.closest(SKIP) && this._languageAllowed(node.parentElement)
      && hasKanji(this._occurrence(node)?.text || node.data) && this.processed.get(node) !== node.data;
  }
  _occurrence(node) {
    const element = node.parentElement;
    const reading = element?.getAttribute('data-ym')?.trim();
    if (!reading) return null;
    // One plain-text reading unit; never flatten nested markup or duplicate its reading.
    const nodes = [...element.childNodes];
    if (nodes[0] !== node || !nodes.every((child) => child.nodeType === 3)) return null;
    const text = nodes.map(child => child.data).join('');
    const tokens = overrideReadingTokens(text, reading);
    return tokens ? { reading, nodes, text, tokens } : null;
  }
  _languageAllowed(element) {
    if (this.language === 'all') return true;
    // <ja> is an implicit Japanese declaration. The closest marker wins;
    // an explicit lang on the marker itself takes precedence, including lang="".
    const scope = element?.closest('[lang],ja');
    const lang = scope?.hasAttribute('lang')
      ? scope.getAttribute('lang').trim().toLowerCase()
      : scope?.localName === 'ja' ? 'ja' : '';
    return lang ? /^ja(?:-|$)/.test(lang) : this.assumeJapanese;
  }
  refresh() {
    const watching = Boolean(this.observer);
    this.restore();
    if (watching) this.observe();
    return this.annotate();
  }
  async _annotate(generation) {
    if (generation !== this.generation) return;
    const doc = this.root.ownerDocument;
    const walker = doc.createTreeWalker(this.root, 4);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (this._eligible(node)) nodes.push(node);
    if (!nodes.length) { this._reportReady(); return; }
    this.onStatus({ state: 'loading' });
    try {
      for (let i = 0; i < nodes.length; i++) {
        if (generation !== this.generation) return;
        const node = nodes[i];
        if (!this._eligible(node)) continue;
        const occurrence = this._occurrence(node);
        const originalNodes = occurrence?.nodes || [node];
        const originalData = originalNodes.map((child) => child.data);
        const original = occurrence?.text || node.data;
        const parts = [];
        if (occurrence) {
          parts.push(...annotationsFromTokens(original, occurrence.tokens, {}, { readingFormat: this.readingFormat }));
        } else {
          // Bound work per request while keeping normal sentences together.
          const chunks = original.match(/[^。！？\n]{1,1000}(?:[。！？\n]|$)|[。！？\n]|[^。！？\n]{1,1000}/gu) || [original];
          const combinedTokens = [];
          let offset = 0;
          for (const chunk of chunks) {
            if (!hasKanji(chunk)) { offset += chunk.length; continue; }
            let tokens = this.cache.get(chunk);
            if (!tokens) {
              [tokens] = await this.provider.analyze([chunk]);
              if (generation !== this.generation) return;
              this.cache.set(chunk, tokens);
              if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value);
            }
            combinedTokens.push(...tokens.map(token => ({ ...token, start: token.start + offset, end: token.end + offset })));
            offset += chunk.length;
          }
          parts.push(...annotationsFromTokens(original, combinedTokens, this.overrides, { readingFormat: this.readingFormat }));
        }
        if (generation !== this.generation || !this._eligible(node)
          || originalNodes.some((child, index) => child.data !== originalData[index])
          || this._occurrence(node)?.reading !== occurrence?.reading) continue;
        originalNodes.forEach((child) => this.processed.set(child, child.data));
        if (!parts.some((part) => part.reading)) continue;
        this.stopSelection ||= registerSelection(doc, this.id);
        const fragment = doc.createDocumentFragment();
        const start = doc.createComment(`${this.id}:start`);
        const end = doc.createComment(`${this.id}:end`);
        fragment.append(start);
        for (const part of parts) {
          if (!part.reading) {
            const text = doc.createTextNode(part.text);
            this.processed.set(text, text.data);
            this.occurrenceContexts.set(text, node.parentElement?.closest('[data-ym]'));
            fragment.append(text);
          } else {
            const ruby = doc.createElement('ruby');
            ruby.dataset.yomigana = this.id;
            ruby.dataset.alignment = part.alignment;
            ruby.dataset.selection = this.selection;
            ruby.dataset.readingFormat = this.readingFormat;
            this.occurrenceContexts.set(ruby, node.parentElement?.closest('[data-ym]'));
            ruby.style.setProperty('--yomigana-auto-size', this.sizeStyle);
            const rt = doc.createElement('rt');
            rt.setAttribute('aria-hidden', 'true');
            const reading = doc.createElement('span');
            reading.setAttribute('data-nosnippet', '');
            reading.setAttribute('aria-hidden', 'true');
            reading.textContent = part.reading;
            rt.append(reading);
            rt.hidden = !this.visible;
            ruby.append(doc.createTextNode(part.text), rt);
            fragment.append(ruby);
          }
        }
        fragment.append(end);
        const inserted = [...fragment.childNodes].slice(1, -1);
        this.replacements.set(start, { end, nodes: originalNodes, original, inserted });
        node.replaceWith(fragment);
        originalNodes.slice(1).forEach((child) => child.remove());
        if (i % 12 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      for (const [start] of this.replacements) if (!this.root.contains(start)) this.replacements.delete(start);
      this._reportReady();
    } catch (error) { this.onStatus({ state: 'error', error }); throw error; }
  }
  setReadingFormat(format) {
    validateReadingFormat(format);
    if (this.destroyed) return Promise.reject(new Error('Annotator is destroyed'));
    if (format === this.readingFormat) return this.annotate();
    this.readingFormat = format;
    return this.refresh();
  }
  setSelection(mode) {
    validateSelection(mode);
    this.selection = mode;
    for (const ruby of this.root.querySelectorAll(`ruby[data-yomigana="${this.id}"]`)) ruby.dataset.selection = mode;
    return this;
  }
  setSize(size) {
    const value = automaticSize(size);
    this.size = size;
    this.sizeStyle = value;
    for (const ruby of this.root.querySelectorAll(`ruby[data-yomigana="${this.id}"]`)) {
      ruby.style.setProperty('--yomigana-auto-size', value);
    }
    return this;
  }
  setVisible(visible) {
    this.visible = Boolean(visible);
    for (const rt of this.root.querySelectorAll(`ruby[data-yomigana="${this.id}"] > rt`)) rt.hidden = !this.visible;
  }
  _reportReady() {
    this.onStatus({ state: 'ready', count: this.root.querySelectorAll(`ruby[data-yomigana="${this.id}"]`).length });
  }
  observe() {
    if (this.observer || this.destroyed) return this;
    const Observer = this.root.ownerDocument.defaultView.MutationObserver;
    this.observer = new Observer((records) => {
      let relevant = false;
      for (const record of records) {
        const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        // Visibility toggles on our own rt elements must not trigger refresh loops.
        if (element?.closest('rt,rp')) continue;
        const ownedRuby = element?.closest(`ruby[data-yomigana="${this.id}"]`);
        if (record.type === 'childList') {
          // Host additions to an annotated reading unit must re-evaluate the entire unit.
          // Our own inserted text is already processed, and our ruby has an owner id.
          if (element?.closest('[data-ym]') && (
            [...record.addedNodes].some((node) => node.nodeType === 3 ? this.processed.get(node) !== node.data
              : node.nodeType === 1 && node.dataset.yomigana !== this.id)
            || [...record.removedNodes].some((node) => node.nodeType === 1 && node.dataset.yomigana === this.id
              || node.nodeType === 3 && this.occurrenceContexts.has(node)))) {
            this.needsRefresh = true;
            relevant = true;
          }
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue;
            const rubies = node.matches(`ruby[data-yomigana="${this.id}"]`) ? [node] : node.querySelectorAll(`ruby[data-yomigana="${this.id}"]`);
            if ([...rubies].some((ruby) => !this._languageAllowed(ruby.parentElement) || ruby.parentElement?.closest(SKIP)
              || this.occurrenceContexts.get(ruby) !== ruby.parentElement?.closest('[data-ym]'))) {
              this.needsRefresh = true;
              relevant = true;
            }
          }
        }
        if (record.type === 'attributes' || ownedRuby
          || record.type === 'characterData' && element?.closest('[data-ym]')) {
          this.needsRefresh = true;
          relevant = true;
        } else if (record.type === 'characterData' ? this._eligible(record.target)
          : [...record.addedNodes].some((node) => node.nodeType === 3 ? this._eligible(node) : node.nodeType === 1 && !node.matches(SKIP))) {
          relevant = true;
        }
      }
      if (!relevant) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        (this.needsRefresh ? this.refresh() : this.annotate()).catch(() => {});
      }, 100);
    });
    this.observer.observe(this.root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
    // Language and exclusions can be inherited from outside a scoped article root.
    for (let ancestor = this.root.parentElement; ancestor; ancestor = ancestor.parentElement) {
      this.observer.observe(ancestor, { attributes: true, attributeFilter: ATTRIBUTES });
    }
    return this;
  }
  restore() {
    this.stopSelection?.();
    this.stopSelection = undefined;
    this.generation++;
    clearTimeout(this.timer);
    this.needsRefresh = false;
    this.observer?.disconnect();
    this.observer = undefined;
    for (const [start, { end, nodes, original, inserted }] of this.replacements) {
      if (start.parentNode && start.parentNode === end.parentNode) {
        const between = [];
        for (let current = start.nextSibling; current && current !== end; current = current.nextSibling) between.push(current);
        const unchanged = between.length === inserted.length && between.every((current, i) => current === inserted[i]);
        const base = between.map((current) => current.nodeType === 1 && current.dataset.yomigana === this.id ? [...current.childNodes].filter((n) => n.nodeName !== 'RT').map((n) => n.textContent).join('') : current.textContent).join('');
        if (unchanged && base === original) {
          start.before(...nodes);
          between.forEach((current) => current.remove());
        }
      }
      start.remove();
      end.remove();
    }
    // Preserve host edits to annotated text instead of overwriting them on restore.
    for (const ruby of this.root.querySelectorAll(`ruby[data-yomigana="${this.id}"]`)) {
      ruby.querySelectorAll(':scope > rt').forEach((rt) => rt.remove());
      ruby.replaceWith(...ruby.childNodes);
    }
    this.replacements.clear();
    this.occurrenceContexts = new WeakMap();
    this.processed = new WeakMap();
  }
  destroy() { this.restore(); this.destroyed = true; if (this.ownsProvider) this.provider.destroy?.(); this.cache.clear(); }
}

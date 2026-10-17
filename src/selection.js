const documents = new WeakMap();
const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DIV|FOOTER|H[1-6]|HEADER|LI|MAIN|NAV|P|SECTION|TR)$/;

export function validateSelection(mode) {
  if (!['base', 'both', 'reading'].includes(mode)) throw new Error('selection must be "base", "both", or "reading"');
}

// One handler per document allows a selection to cross independently configured readers.
export function registerSelection(doc, id) {
  let state = documents.get(doc);
  if (!state) {
    const owners = new Set();
    const copy = (event) => {
      if (event.defaultPrevented || !event.clipboardData) return;
      if (event.target?.closest?.('input,textarea,[contenteditable]:not([contenteditable="false"])')) return;
      const selection = doc.getSelection();
      if (!selection || selection.isCollapsed) return;
      let affected = false;
      const output = [];
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        function text(node, skipReadings = false) {
          if (!range.intersectsNode(node)) return '';
          if (node.nodeType === 3) {
            const start = range.startContainer === node ? range.startOffset : 0;
            const end = range.endContainer === node ? range.endOffset : node.length;
            return node.data.slice(start, end);
          }
          if (node.nodeType !== 1) return [...node.childNodes].map((child) => text(child, skipReadings)).join('');
          if (node.matches('script,style,[hidden]') || (skipReadings && node.matches('rt,rp'))) return '';
          if (node.nodeName === 'BR') return '\n';
          if (node.nodeName === 'RUBY' && owners.has(node.dataset.yomigana)) {
            const base = [...node.childNodes].map((child) => text(child, true)).join('');
            const rt = node.querySelector(':scope > rt');
            const selectedReading = rt ? text(rt) : '';
            if (!base && !selectedReading) return '';
            affected = true;
            const reading = rt && !rt.hidden ? rt.textContent : '';
            if (!reading || node.dataset.selection === 'base') return base;
            if (node.dataset.selection === 'reading') return base ? reading : selectedReading;
            return base ? `${base}(${reading})` : selectedReading;
          }
          const content = [...node.childNodes].map((child) => text(child, skipReadings)).join('');
          return BLOCK.test(node.nodeName) && content ? content + '\n' : content;
        }
        let ancestor = range.commonAncestorContainer;
        const element = ancestor.nodeType === 1 ? ancestor : ancestor.parentElement;
        const ruby = element?.closest('ruby[data-yomigana]');
        if (ruby && owners.has(ruby.dataset.yomigana)) ancestor = ruby;
        output.push(text(ancestor).replace(/\n+$/, ''));
      }
      if (!affected) return;
      event.clipboardData.setData('text/plain', output.join('\n'));
      event.preventDefault();
    };
    state = { owners, copy };
    documents.set(doc, state);
    doc.addEventListener('copy', copy);
  }
  state.owners.add(id);
  return () => {
    state.owners.delete(id);
    if (!state.owners.size) {
      doc.removeEventListener('copy', state.copy);
      documents.delete(doc);
    }
  };
}

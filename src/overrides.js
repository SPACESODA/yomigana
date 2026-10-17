// Literal matching and speech processing; application data lives in a separate module.
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
// Separators are matched structurally, never discarded. Spaces and wave-dash
// width variants are equivalent; original source punctuation is preserved.
const SEPARATORS = /([ \u3000、。・･〜～~「」『』（）【】:：]+)/u;
const separatorKey = text => {
  const key = text.replace(/[ \u3000]+/gu, ' ').replace(/[〜～~]/gu, '〜').replace(/[:：]/gu, ':').replace(/[・･]/gu, '・');
  return key.trim() ? key.replace(/ /g, '') : ' ';
};
export function overrideReadingParts(surface, reading) {
  if (typeof reading !== 'string' || !reading || !/^[\p{Script=Hiragana}\p{Script=Katakana}ー \u3000、。・･〜～~「」『』（）【】:：]+$/u.test(reading)) return null;
  const leading = surface.match(/^[ \u3000]+/u)?.[0] || '';
  const trailing = surface.match(/[ \u3000]+$/u)?.[0] || '';
  let core = surface.slice(leading.length, surface.length - trailing.length);
  const readingCore = reading.replace(/^[ \u3000]+|[ \u3000]+$/gu, '');
  const opening = [];
  const closing = [];
  // Preserve existing bare readings for parenthesized markers such as （笑）.
  const brackets = { '（': '）', '【': '】' };
  while (brackets[core[0]] === core.at(-1) && core.length >= 2
    && !(readingCore.startsWith(core[0]) && readingCore.endsWith(core.at(-1)))) {
    opening.push(core[0]); closing.unshift(core.at(-1));
    core = core.slice(1, -1);
  }
  const texts = core.split(SEPARATORS);
  const readings = readingCore.split(SEPARATORS);
  if (texts.length !== readings.length) return null;
  const parts = leading ? [{ text: leading }] : [];
  if (opening.length) parts.push({ text: opening.join('') });
  for (let i = 0; i < texts.length; i++) {
    if (i % 2) {
      if (separatorKey(texts[i]) !== separatorKey(readings[i])) return null;
      parts.push({ text: texts[i] });
    } else {
      if (!texts[i] && !readings[i]) continue;
      if (!texts[i] || !KANA.test(readings[i])) return null;
      parts.push({ text: texts[i], reading: readings[i] });
    }
  }
  if (closing.length) parts.push({ text: closing.join('') });
  if (trailing) parts.push({ text: trailing });
  return parts.some(part => part.reading) ? parts : null;
}
export function overrideReadingTokens(surface, reading) {
  const parts = overrideReadingParts(surface, reading);
  if (!parts) return null;
  let start = 0;
  return parts.map(part => {
    const token = { surface: part.text, reading: part.reading, start, end: start + part.text.length };
    start = token.end;
    return token;
  });
}
function originalText(node) {
  if (node.nodeType === 3) return node.data;
  if (node.nodeType === 1 && node.matches('rt,rp,script,style,noscript,[hidden],[aria-hidden="true"],[data-yomigana-ignore]')) return '';
  return [...node.childNodes].map(originalText).join('');
}
export function normalizeOverrides(overrides = []) {
  // Retain the original exact-token object API, including null suppression.
  const entries = Array.isArray(overrides) ? overrides : Object.entries(overrides).map(([match, annotation]) =>
    ({ match, annotation: annotation ?? '', tokenOnly: true }));
  const seen = new Set();
  return entries.map(entry => {
    if (!entry || typeof entry.match !== 'string' || !entry.match) throw new Error('Override match must be a nonempty string');
    if (seen.has(entry.match)) throw new Error(`Duplicate override match: ${entry.match}`);
    seen.add(entry.match);
    if (entry.annotation !== undefined && (typeof entry.annotation !== 'string' || (entry.annotation && !overrideReadingParts(entry.match, entry.annotation)))) {
      throw new Error('Override annotation must be kana with matching supported separators, or an empty string');
    }
    if (entry.speech !== undefined && typeof entry.speech !== 'string') throw new Error('Override speech must be a string');
    return { ...entry };
  }).sort((a, b) => b.match.length - a.match.length);
}

// Literal, left-to-right matching. At the same position, the longest rule wins.
export function findOverrideMatches(text, entries, tokens) {
  const matches = [];
  let cursor = 0;
  while (cursor < text.length) {
    let next;
    for (const entry of entries) {
      let start = text.indexOf(entry.match, cursor);
      while (start !== -1 && tokens && entry.tokenOnly && !tokens.some(token => token.start === start && token.surface === entry.match)) {
        start = text.indexOf(entry.match, start + 1);
      }
      if (start !== -1 && (!next || start < next.start)) next = { ...entry, start, end: start + entry.match.length };
    }
    if (!next) break;
    matches.push(next);
    cursor = next.end;
  }
  return matches;
}

// Surrounding punctuation belongs to the source, never to the kana reading.
export function overrideEdges(text) {
  const prefix = text.match(/^[^\p{L}\p{N}々〆]+/u)?.[0] || '';
  const remaining = text.slice(prefix.length);
  const suffix = remaining.match(/[^\p{L}\p{N}々〆]+$/u)?.[0] || '';
  return { prefix, core: remaining.slice(0, remaining.length - suffix.length), suffix };
}

function speechString(text, entries) {
  let cursor = 0;
  let result = '';
  for (const rule of findOverrideMatches(text, entries)) {
    const { prefix, suffix } = overrideEdges(rule.match);
    const reading = rule.annotation && overrideReadingParts(rule.match, rule.annotation)?.map(part => part.reading || part.text).join('');
    const replacement = rule.speech !== undefined ? rule.speech
      : reading ? (reading.startsWith(prefix) ? '' : prefix) + reading + (reading.endsWith(suffix) ? '' : suffix) : rule.match;
    result += text.slice(cursor, rule.start) + replacement;
    cursor = rule.end;
  }
  return result + text.slice(cursor);
}

/** Original Japanese speech text; independent of ruby visibility or reading format. */
export function prepareSpeechText(source, { overrides = [] } = {}) {
  const entries = normalizeOverrides(overrides);
  if (typeof source === 'string') return speechString(source, entries);
  if (!source?.childNodes) throw new Error('Speech source must be a string or DOM node');
  const segments = [];
  const append = (text, protectedReading = false) => {
    if (!text) return;
    const previous = segments.at(-1);
    if (!protectedReading && previous && !previous.protectedReading) previous.text += text;
    else segments.push({ text, protectedReading });
  };
  const walk = node => {
    if (node.nodeType === 3) { append(node.data); return; }
    if (node.nodeType === 1) {
      if (node.matches('rt,rp,script,style,noscript,[hidden],[aria-hidden="true"],[data-yomigana-ignore]')) return;
      const reading = node.getAttribute('data-ym')?.trim();
      const parts = reading && overrideReadingParts(originalText(node), reading);
      if (parts) { append(parts.map(part => part.reading || part.text).join(''), true); return; }
      if (node.localName === 'br') { append('\n'); return; }
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(source);
  return segments.map(segment => segment.protectedReading ? segment.text : speechString(segment.text, entries)).join('');
}

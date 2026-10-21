// Prepared global overrides. Pass this list through the reader's overrides option.
// These context-dependent readings are never enabled automatically.

// Furigana:
// Omitted annotation: dictionary reading.
// Empty annotation: no furigana.

// Readout (only for apps using the speech helper):
// Omitted speech { match: '○○', annotation: 'なになに' }: Reads なになに as it uses the annotation reading.
// Empty speech { match: '○○', annotation: 'なになに', speech: '' }: skip the matched text; no pause is inserted.
// These speech settings do not control screen readers or built-in browser readout.

export const globalOverrides = [
  { match: '○○', annotation: 'なになに' },
  { match: '（笑）', annotation: 'わらい' },
  { match: '(笑)', annotation: 'わらい' },
];

// Global overrides for yomu

// Furigana:
// Omitted annotation: dictionary reading.
// Empty annotation: no furigana.

// Readout feature:
// Omitted speech { match: '〇〇', annotation: 'なになに' }: Reads なになに as it uses the annotation reading.
// Empty speech { match: '〇〇', annotation: 'なになに', speech: '' }: skip the matched text; no pause is inserted.
// These speech settings do not control screen readers or built-in browser readout.

globalThis.yomiganaOverrides = [
  { match: '〇〇', annotation: 'なになに' },
  { match: '（笑）', annotation: 'わらい', speech: '（わらい）' },
  { match: '(笑)', annotation: 'わらい', speech: '（わらい）' },
];

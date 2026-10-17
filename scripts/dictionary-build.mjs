const applies = (list, value) => list?.includes('*') || list?.includes(value);
export function compileReadings(words, { full = false } = {}) {
  const keys = new Set(words.flatMap((word) => word.kanji
    .filter((form) => full || form.common || word.kana.some((kana) => kana.common && applies(kana.appliesToKanji, form.text)))
    .map((form) => form.text)));
  // Expand coverage using whole entries, never by synthesizing component readings.
  // Freeze the common components so expansion cannot recursively admit rare words.
  if (!full) {
    const components = new Set([...keys].filter((text) => /^[\p{Script=Han}々〆]{2,}$/u.test(text)));
    for (const word of words) for (const { text } of word.kanji) {
      const chars = [...text];
      if (keys.has(text) || chars.length < 4 || chars.length > 16 || !/^[\p{Script=Han}々〆]+$/u.test(text)) continue;
      const reachable = new Set([0]);
      for (let end = 2; end <= chars.length; end++) {
        for (let start = 0; start <= end - 2; start++) {
          if (reachable.has(start) && components.has(chars.slice(start, end).join(''))) {
            reachable.add(end);
            break;
          }
        }
      }
      if (reachable.has(chars.length)) keys.add(text);
    }
  }
  const result = Object.create(null);
  // Scan ALL entries for selected spellings, retaining uncommon alternative readings.
  for (const word of words) for (const form of word.kanji) {
    if (!keys.has(form.text) || !/[\p{Script=Han}々〆]/u.test(form.text)) continue;
    for (const kana of word.kana) {
      if (!applies(kana.appliesToKanji, form.text)) continue;
      const senses = word.sense.filter((sense) => applies(sense.appliesToKanji, form.text) && applies(sense.appliesToKana, kana.text));
      if (!senses.length) continue;
      const rows = result[form.text] ||= [];
      // Keep usage evidence per sense: merging POS and priority across senses
      // could make an uncommon noun inherit a common verb's preference.
      for (const sense of senses) {
        const tags = [...new Set(sense.partOfSpeech)].sort();
        const marked = [...(form.tags || []), ...(kana.tags || []), ...(sense.misc || [])]
          .some((tag) => ['rK', 'sK', 'oK', 'ok', 'rk', 'sk', 'ik', 'arch', 'obs', 'dated', 'rare', 'uk', 'col', 'sl', 'poet'].includes(tag))
          || Boolean(sense.dialect?.length);
        const priority = form.common && kana.common && !marked ? 1 : 0;
        if (!rows.some(([reading, existing, rank]) => reading === kana.text && rank === priority && JSON.stringify(existing) === JSON.stringify(tags))) {
          rows.push([kana.text, tags, priority]);
        }
      }
    }
  }
  return result;
}

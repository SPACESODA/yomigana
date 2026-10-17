// Hepburn-style transliteration for kana readings, not sentence translation.
const syllables = Object.create(null);
for (const [kana, latin] of [
  ['あいうえお', 'a i u e o'], ['かきくけこ', 'ka ki ku ke ko'],
  ['がぎぐげご', 'ga gi gu ge go'], ['さしすせそ', 'sa shi su se so'],
  ['ざじずぜぞ', 'za ji zu ze zo'], ['たちつてと', 'ta chi tsu te to'],
  ['だぢづでど', 'da ji zu de do'], ['なにぬねの', 'na ni nu ne no'],
  ['はひふへほ', 'ha hi fu he ho'], ['ばびぶべぼ', 'ba bi bu be bo'],
  ['ぱぴぷぺぽ', 'pa pi pu pe po'], ['まみむめも', 'ma mi mu me mo'],
  ['やゆよ', 'ya yu yo'], ['らりるれろ', 'ra ri ru re ro'],
  ['わゐゑを', 'wa i e o'], ['ぁぃぅぇぉ', 'a i u e o'],
  ['ゃゅょゎゕゖゔ', 'ya yu yo wa ka ke vu'],
]) {
  const values = latin.split(' ');
  [...kana].forEach((char, i) => { syllables[char] = values[i]; });
}
for (const [kana, prefix] of Object.entries({
  き: 'ky', ぎ: 'gy', し: 'sh', じ: 'j', ち: 'ch', ぢ: 'j',
  に: 'ny', ひ: 'hy', び: 'by', ぴ: 'py', み: 'my', り: 'ry',
})) {
  for (const [small, vowel] of [['ゃ', 'a'], ['ゅ', 'u'], ['ょ', 'o']]) {
    syllables[kana + small] = prefix + vowel;
  }
}
Object.assign(syllables, {
  しぇ: 'she', じぇ: 'je', ちぇ: 'che', いぇ: 'ye',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo', ゔゅ: 'vyu',
  てぃ: 'ti', てゅ: 'tyu', でぃ: 'di', でゅ: 'dyu', とぅ: 'tu', どぅ: 'du',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo', くぁ: 'kwa', くぃ: 'kwi',
  くぇ: 'kwe', くぉ: 'kwo', ぐぁ: 'gwa',
  つぁ: 'tsa', つぃ: 'tsi', つぇ: 'tse', つぉ: 'tso',
});
const normalize = (text) => text.normalize('NFC').replace(/[ァ-ヶ]/g,
  (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
const macrons = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };

export function validateReadingFormat(format) {
  if (!['hiragana', 'katakana', 'romaji'].includes(format)) {
    throw new Error('readingFormat must be "hiragana", "katakana", or "romaji"');
  }
}

export function toRomaji(reading, followingKana = '') {
  const kana = normalize(reading);
  const context = normalize(followingKana);
  let result = '';
  for (let i = 0; i < kana.length; i++) {
    const char = kana[i];
    const next = (kana.slice(i + 1) || context);
    const nextSyllable = syllables[next.slice(0, 2)] || syllables[next[0]];
    if (char === 'っ') {
      if (!nextSyllable || !/^[bcdfghjkpqrstvwxyz]/.test(nextSyllable)) return null;
      result += nextSyllable.startsWith('ch') ? 't' : nextSyllable[0];
    } else if (char === 'ん') {
      result += nextSyllable && /^[aeiouy]/.test(nextSyllable) ? "n'" : 'n';
    } else if (char === 'ー') {
      const vowel = result.at(-1);
      if (macrons[vowel]) result = result.slice(0, -1) + macrons[vowel];
      else if (!Object.values(macrons).includes(vowel)) return null;
    } else {
      const pair = syllables[kana.slice(i, i + 2)];
      const value = pair || syllables[char];
      if (!value) return null;
      result += value;
      if (pair) i++;
    }
  }
  // Conventional kana-based long vowels; ei and ii retain their written vowels.
  // Compound boundaries can have lexical exceptions that kana alone cannot resolve.
  return result.replace(/aa|uu|oo|ou/g, (vowels) => macrons[vowels[0]]);
}

function japaneseVoices(voices, { userAgent = '', platform = '' } = {}) {
  const edge = /Edg\//i.test(userAgent);
  const chrome = /Chrome\//i.test(userAgent) && !edge;
  const windows = /Win/i.test(platform || userAgent);
  const rank = (voice) => {
    const name = voice.name.normalize('NFKC');
    if (edge && /Microsoft Nanami.*(?:Natural|Online)/i.test(name)) return 1000;
    if (edge && /Microsoft Keita.*(?:Natural|Online)/i.test(name)) return 990;
    if (chrome && /Google (?:日本語|Japanese)/i.test(name)) return 1000;
    if (!windows && /Kyoko/i.test(name)) return 900;
    if (windows && /Microsoft Haruka/i.test(name)) return 900;
    if (windows && /Microsoft Nanami.*(?:Natural|Online)/i.test(name)) return 950;
    if (windows && /Microsoft Keita.*(?:Natural|Online)/i.test(name)) return 940;
    if (/Microsoft Nanami.*(?:Natural|Online)/i.test(name)) return 850;
    if (/Microsoft Keita.*(?:Natural|Online)/i.test(name)) return 840;
    if (/Google (?:日本語|Japanese)/i.test(name)) return 830;
    if (/Kyoko/i.test(name)) return 820;
    if (/Microsoft Haruka/i.test(name)) return 810;
    if (/natural|neural/i.test(name)) return 600;
    if (voice.default) return 500;
    return 0;
  };
  return voices.filter((voice) => /^ja(?:[-_]|$)/i.test(voice.lang))
    .sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name, 'ja'));
}

function cleanText(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/。([^\S\r\n]{2,})/gu, '。\n')
    .replace(/([。！？!?])[^\S\r\n]+/gu, '$1')
    .split('\n')
    .map((line) => line.replace(/^[^\S\r\n]+|[^\S\r\n]+$/gu, ''))
    .filter((line) => line.length > 0)
    .join('\n');
}

// Apply speaker-label pauses only to playback text, preserving input and display.
function preparePlaybackText(text) {
  return text.replace(/^(?![^:：]*\p{N}[:：][ \u3000]*\p{N})([\p{L}][\p{L}\p{N} \u3000・（）()]{0,23})[:：][ \u3000]*(?=[「『（(]*[\p{L}\p{N}])/u, '$1。');
}

function speechChunks(text) {
  const chunks = [];
  for (const sentence of text.match(/[^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+/gu) || []) {
    const chars = Array.from(sentence);
    for (let i = 0; i < chars.length; i += 160) {
      const chunk = chars.slice(i, i + 160).join('');
      if (chunk.trim()) chunks.push(chunk);
    }
  }
  return chunks;
}

// A generation id prevents late cancel/end events from restarting an old queue.
function createSpeaker({ synth, Utterance, onState, onParagraph = () => {}, rate = 1 }) {
  let generation = 0;
  let current;
  let timer;
  let currentRate = Number(rate) || 1;
  function setRate(val) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 0) currentRate = num;
  }
  function stop() {
    generation++;
    clearTimeout(timer);
    current = null;
    synth.cancel();
    onParagraph(null);
    onState('idle');
  }
  function play(text, voice, startParagraph = 0, rate = currentRate) {
    stop();
    const id = generation;
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) currentRate = rate;
    const paragraphs = cleanText(text).split('\n');
    const chunks = paragraphs.flatMap((paragraph, paragraphIndex) =>
      paragraphIndex < startParagraph ? [] :
        speechChunks(preparePlaybackText(paragraph)).map(text => ({ text, paragraphIndex })));
    let index = 0;
    function next() {
      if (id !== generation) return;
      if (index === chunks.length) { current = null; onParagraph(null); onState('idle'); return; }
      const chunk = chunks[index++];
      const utterance = current = new Utterance(chunk.text);
      utterance.lang = voice.lang;
      utterance.voice = voice;
      if (typeof currentRate === 'number' && Number.isFinite(currentRate) && currentRate > 0) {
        utterance.rate = currentRate;
      }
      utterance.onstart = () => {
        if (id === generation && current === utterance) onParagraph(chunk.paragraphIndex);
      };
      const fail = () => {
        if (id !== generation || current !== utterance) return;
        stop();
        onState('error');
      };
      utterance.onend = () => { if (id !== generation || current !== utterance) return; clearTimeout(timer); next(); };
      utterance.onerror = fail;
      timer = setTimeout(fail, 60000);
      try { synth.speak(utterance); } catch { fail(); }
    }
    if (chunks.length) { onState('playing'); next(); }
  }
  return { play, stop, setRate };
}

globalThis.japaneseVoices = japaneseVoices;
globalThis.cleanText = cleanText;
globalThis.speechChunks = speechChunks;
globalThis.createSpeaker = createSpeaker;

globalThis.preparePlaybackText = preparePlaybackText;

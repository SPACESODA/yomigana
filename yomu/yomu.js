(() => {
const reader = globalThis.reader;
const disposeReader = globalThis.disposeReader;
const japaneseVoices = globalThis.japaneseVoices;
const createSpeaker = globalThis.createSpeaker;
const cleanText = globalThis.cleanText;

const storage = {
  get(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; }
    catch { return null; }
  },
  set(key, value) {
    try { globalThis.localStorage?.setItem(key, value); }
    catch {}
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(key); }
    catch {}
  }
};

const $ = (id) => document.getElementById(id);
const synth = globalThis.speechSynthesis;
const supported = Boolean(synth && globalThis.SpeechSynthesisUtterance);
const defaultText = cleanText($('reading').textContent);
const savedInput = storage.get('yomu:input');
let original = cleanText(savedInput || defaultText);
if (savedInput) {
  $('input').value = savedInput;
  $('count').textContent = `${savedInput.length.toLocaleString()} / 10,000`;
}
const savedRomaji = storage.get('yomu:romaji') === 'true';
if (savedRomaji) {
  $('romaji').checked = true;
  reader.readingFormat = 'romaji';
}
const savedCopyReading = storage.get('yomu:copy-reading');
const initialCopyReading = savedCopyReading !== 'false';
if ($('copy-reading')) {
  $('copy-reading').checked = initialCopyReading;
}
reader?.setSelection?.(initialCopyReading ? 'both' : 'base');
const savedSize = storage.get('yomu:size');
const initialSize = savedSize ? Math.min(100, Math.max(35, Number(savedSize) || 68)) : 68;
if ($('ruby-size')) {
  $('ruby-size').value = String(initialSize);
  $('ruby-size-val').value = `${initialSize}%`;
}
reader?.setSize?.(initialSize);
function formatSpeed(speed) {
  const num = Math.round(Number(speed) * 100) / 100;
  return Math.abs(num * 10 - Math.round(num * 10)) < 1e-4
    ? num.toFixed(1)
    : num.toFixed(2);
}
const savedSpeed = storage.get('yomu:speed');
const initialSpeed = savedSpeed ? Math.min(1.5, Math.max(0.5, Number(savedSpeed) || 1.0)) : 1.0;
if ($('speech-rate')) {
  $('speech-rate').value = formatSpeed(initialSpeed);
  $('speech-rate-val').value = `${formatSpeed(initialSpeed)}×`;
}
let voices = [];
let manualVoice = storage.get('yomu:voice') || '';
let playing = false;
let revision = 0;
let playbackVoice;
let pointerStart;
function renderParagraphs() {
  $('reading').replaceChildren(...original.split('\n').map((text, index) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.dataset.paragraph = String(index);
    return paragraph;
  }));
}
renderParagraphs();
const voiceKey = (voice) => JSON.stringify([voice.voiceURI, voice.name, voice.lang]);
const speaker = supported ? createSpeaker({ synth, Utterance: globalThis.SpeechSynthesisUtterance, rate: initialSpeed, onParagraph(index) {
  for (const paragraph of $('reading').children) {
    const active = index !== null && Number(paragraph.dataset.paragraph) === index;
    paragraph.classList.toggle('is-speaking', active);
    if (active) paragraph.setAttribute('aria-current', 'true');
    else paragraph.removeAttribute('aria-current');
  }
}, onState(state) {
  playing = state === 'playing';
  $('play').textContent = playing ? '停止する' : '読み上げる';
  $('play').setAttribute('aria-pressed', String(playing));
  $('reading').classList.toggle('is-playing', playing);
  for (const paragraph of $('reading').children) {
    if (playing) paragraph.tabIndex = 0;
    else paragraph.removeAttribute('tabindex');
  }
  if (state === 'error') showError('音声を再生できませんでした。別の音声を選んで再試行してください。');
} }) : null;

function showError(message = '') {
  $('status').textContent = message;
  $('status').hidden = !message;
}

function updateVoices() {
  voices = supported ? japaneseVoices(synth.getVoices(), {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform,
  }) : [];
  manualVoice ||= storage.get('yomu:voice') || '';
  const selected = manualVoice && voices.length ? voices.findIndex((voice) => voiceKey(voice) === manualVoice) : -1;
  if (manualVoice && voices.length && selected < 0) {
    manualVoice = '';
    storage.remove('yomu:voice');
    speaker?.stop();
  }
  $('voice').replaceChildren(...voices.map((voice, index) => new Option(voice.name, String(index))));
  if (!voices.length) $('voice').append(new Option('日本語の音声がありません', ''));
  else $('voice').value = String(selected < 0 ? 0 : selected);
  $('voice').disabled = !voices.length;
  $('play').disabled = !voices.length || !original.trim();
  if (!supported) {
    showError('このブラウザーは読み上げに対応していません。');
  } else if (voices.length && $('status').textContent === '日本語音声が見つかりません。OS の音声設定や別のブラウザーを確認してください。') {
    showError('');
  }
}
$('voice').addEventListener('change', () => {
  const index = Number($('voice').value);
  const voice = voices[index];
  if (voice) {
    manualVoice = voiceKey(voice);
    storage.set('yomu:voice', manualVoice);
  }
  speaker?.stop();
});
$('play').addEventListener('click', () => {
  if (playing) { speaker.stop(); return; }
  updateVoices();
  const voice = voices[Number($('voice').value)];
  if (!voice) {
    showError('日本語音声が見つかりません。OS の音声設定や別のブラウザーを確認してください。');
    return;
  }
  if ($('status').textContent.includes('日本語音声')) showError('');
  playbackVoice = voice;
  speaker.play(reader.speechText(original), voice);
});
function jumpToParagraph(target) {
  const paragraph = target.closest('[data-paragraph]');
  if (!playing || !paragraph || paragraph.parentElement !== $('reading')) return;
  speaker.play(reader.speechText(original), playbackVoice, Number(paragraph.dataset.paragraph));
}
$('reading').addEventListener('pointerdown', event => {
  pointerStart = { x: event.clientX, y: event.clientY };
});
$('reading').addEventListener('pointercancel', () => { pointerStart = null; });
$('reading').addEventListener('click', event => {
  const start = pointerStart;
  pointerStart = null;
  if (event.button !== 0 || event.detail > 1 || !window.getSelection()?.isCollapsed) return;
  if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
  jumpToParagraph(event.target);
});
$('reading').addEventListener('keydown', event => {
  if (!playing || event.repeat || !['Enter', ' '].includes(event.key)) return;
  if (event.target.parentElement !== $('reading')) return;
  event.preventDefault();
  jumpToParagraph(event.target);
});
if (supported) synth.addEventListener('voiceschanged', updateVoices);
updateVoices();

async function annotate() {
  const id = ++revision;
  $('reading').setAttribute('aria-busy', 'true');
  try {
    await reader.annotate();
  } catch (error) {
    console.warn('Yomu annotate error:', error);
  } finally { if (id === revision) $('reading').setAttribute('aria-busy', 'false'); }
}
$('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = cleanText($('input').value);
  speaker?.stop();
  reader.restore();
  if (!text) {
    storage.remove('yomu:input');
    $('input').value = '';
    $('count').textContent = '0 / 10,000';
    original = defaultText;
  } else {
    storage.set('yomu:input', text);
    original = text;
  }
  renderParagraphs();
  updateVoices();
  annotate();
  $('input').blur();
  resizeInput();
});
function resizeInput() {
  const isMobile = Boolean(globalThis.innerWidth && globalThis.innerWidth <= 560);
  const focused = document.activeElement === $('input');
  if (!focused) {
    $('input').style.height = `${isMobile ? 52 : 56}px`;
    return;
  }
  $('input').style.height = 'auto';
  const min = isMobile ? 84 : 96;
  const max = isMobile ? 140 : 200;
  $('input').style.height = `${Math.max(min, Math.min($('input').scrollHeight, max))}px`;
}
$('input').addEventListener('focus', resizeInput);
$('input').addEventListener('blur', () => {
  $('input').scrollTop = 0;
  resizeInput();
});
$('input').addEventListener('input', () => {
  $('input').setCustomValidity('');
  $('count').textContent = `${$('input').value.length.toLocaleString()} / 10,000`;
  resizeInput();
});
window.addEventListener('resize', resizeInput);
$('input').addEventListener('keydown', (event) => {
  if (!event.isComposing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); $('composer').requestSubmit(); }
});
$('romaji').addEventListener('change', async () => {
  $('romaji').disabled = true;
  try {
    const format = $('romaji').checked ? 'romaji' : 'hiragana';
    await reader.setReadingFormat(format);
    storage.set('yomu:romaji', String($('romaji').checked));
  }
  catch { showError('読み方を変更できませんでした。再度表示してください。'); }
  finally { $('romaji').disabled = false; }
});
$('copy-reading')?.addEventListener('change', () => {
  const enabled = $('copy-reading').checked;
  reader?.setSelection?.(enabled ? 'both' : 'base');
  storage.set('yomu:copy-reading', String(enabled));
});
function setSettingsOpen(open) {
  if (!$('settings-popup') || !$('settings-btn')) return;
  $('settings-popup').hidden = !open;
  $('settings-btn').setAttribute('aria-expanded', String(open));
}
$('settings-btn')?.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = $('settings-btn').getAttribute('aria-expanded') === 'true';
  setSettingsOpen(!isOpen);
});
$('settings-popup')?.addEventListener('click', (event) => {
  event.stopPropagation();
});
document.addEventListener('click', (event) => {
  if ($('settings-popup') && !$('settings-popup').hidden && !$('settings-btn')?.contains(event.target)) {
    setSettingsOpen(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('settings-popup') && !$('settings-popup').hidden) {
    setSettingsOpen(false);
    $('settings-btn')?.focus();
  }
  if (!event.isComposing && (event.metaKey || event.ctrlKey) && (event.key === 'a' || event.key === 'A')) {
    if (event.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
    const reading = $('reading');
    if (!reading || !reading.textContent.trim()) return;
    event.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(reading);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
});
$('ruby-size')?.addEventListener('input', () => {
  const size = Number($('ruby-size').value);
  $('ruby-size-val').value = `${size}%`;
  reader?.setSize?.(size);
  storage.set('yomu:size', String(size));
});
$('speech-rate')?.addEventListener('input', () => {
  const speed = Number($('speech-rate').value);
  $('speech-rate-val').value = `${formatSpeed(speed)}×`;
  speaker?.setRate(speed);
  storage.set('yomu:speed', String(speed));
});
$('speech-rate')?.addEventListener('change', () => {
  if (playing && playbackVoice) {
    const active = $('reading').querySelector('.is-speaking');
    const pIndex = active ? Number(active.dataset.paragraph) : 0;
    speaker?.play(reader.speechText(original), playbackVoice, pIndex);
  }
});
$('reset-settings')?.addEventListener('click', async () => {
  $('reset-settings').disabled = true;
  try {
    if ($('romaji')?.checked) {
      $('romaji').checked = false;
      await reader.setReadingFormat('hiragana');
    }
    storage.remove('yomu:romaji');

    if ($('copy-reading')) {
      $('copy-reading').checked = true;
      reader?.setSelection?.('both');
      storage.remove('yomu:copy-reading');
    }

    if ($('ruby-size')) {
      $('ruby-size').value = '68';
      $('ruby-size-val').value = '68%';
      reader?.setSize?.(68);
      storage.remove('yomu:size');
    }

    if ($('speech-rate')) {
      $('speech-rate').value = '1.0';
      $('speech-rate-val').value = '1.0×';
      speaker?.setRate(1.0);
      storage.remove('yomu:speed');
      if (playing && playbackVoice) {
        const active = $('reading').querySelector('.is-speaking');
        const pIndex = active ? Number(active.dataset.paragraph) : 0;
        speaker?.play(reader.speechText(original), playbackVoice, pIndex);
      }
    }
  } catch {
    showError('設定を初期化できませんでした。');
  } finally {
    $('reset-settings').disabled = false;
  }
});
window.addEventListener('pagehide', () => { speaker?.stop(); });
window.addEventListener('beforeunload', () => { speaker?.stop(); disposeReader?.(); });
if ('serviceWorker' in navigator && globalThis.location?.protocol?.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.storage?.persist?.().catch(() => {});
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch(() => {});
        window.addEventListener('online', () => { registration.update().catch(() => {}); });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}
annotate();
})();

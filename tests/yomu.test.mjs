import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import '../yomu/speech.js';
import { prepareSpeechText } from '../src/overrides.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const appConfig = {};
runInNewContext(readFileSync(new URL('../yomu/yomigana-overrides.js', import.meta.url), 'utf8'), appConfig);
const appOverrides = JSON.parse(JSON.stringify(appConfig.yomiganaOverrides));
const { japaneseVoices, speechChunks, createSpeaker, cleanText, preparePlaybackText } = globalThis;

test('Yomu exposes only Japanese voices and ranks browser and OS defaults', () => {
  const voices = [
    { name: 'English Natural', lang: 'en-US' },
    { name: 'Kyoko', lang: 'ja-JP', default: true },
    { name: 'Microsoft Nanami Online (Natural)', lang: 'ja-JP' },
    { name: 'Microsoft Keita Online (Natural)', lang: 'ja-JP' },
    { name: 'Microsoft Haruka Desktop', lang: 'ja-JP' },
    { name: 'Google 日本語', lang: 'ja-JP' },
    { name: 'Japanese', lang: 'ja_JP' },
  ];
  const chrome = japaneseVoices(voices, { userAgent: 'Chrome/140', platform: 'MacIntel' });
  const edge = japaneseVoices(voices, { userAgent: 'Edg/140', platform: 'Win32' });
  const safari = japaneseVoices(voices, { userAgent: 'Safari/18', platform: 'MacIntel' });
  const windows = japaneseVoices(voices, { userAgent: 'Chrome/140', platform: 'Win32' });
  assert.equal(chrome.length, 6);
  assert.equal(chrome[0].name, 'Google 日本語');
  assert.equal(edge[0].name, 'Microsoft Nanami Online (Natural)');
  assert.equal(edge[1].name, 'Microsoft Keita Online (Natural)');
  assert.equal(safari[0].name, 'Kyoko');
  assert.equal(windows[0].name, 'Google 日本語');
  assert.ok(windows.findIndex((voice) => voice.name === 'Microsoft Haruka Desktop') < windows.findIndex((voice) => voice.name === 'Kyoko'));
  assert.equal(japaneseVoices(voices.filter((voice) => !voice.name.startsWith('Google')), {
    userAgent: 'Chrome/140', platform: 'Win32',
  })[0].name, 'Microsoft Nanami Online (Natural)');
  assert.equal(voices[0].name, 'English Natural');
});
test('speech chunks preserve text and Unicode without giant utterances', () => {
  const text = '公園の桜が咲きます。' + '𠮷'.repeat(400) + '！';
  const chunks = speechChunks(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 160));
  assert.deepEqual(speechChunks('  \n'), []);
});
test('speech stop and replacement ignore late callbacks; errors reset playback', () => {
  const spoken = [], states = [];
  const synth = { speak(u) { spoken.push(u); }, cancel() {} };
  class Utterance { constructor(text) { this.text = text; } }
  const speaker = createSpeaker({ synth, Utterance, onState: state => states.push(state) });
  const voice = { lang: 'ja-JP' };
  speaker.play('朝です。夜です。', voice);
  assert.equal(spoken[0].text, '朝です。');
  assert.equal(spoken[0].voice, voice);
  spoken[0].onend();
  assert.equal(spoken[1].text, '夜です。');
  speaker.stop();
  spoken[1].onend();
  assert.equal(spoken.length, 2);
  speaker.play('桜。', voice);
  spoken[1].onerror();
  assert.equal(states.at(-1), 'playing');
  spoken[2].onerror();
  assert.equal(states.at(-1), 'error');
  speaker.play('春。', voice);
  spoken[3].onend();
  assert.equal(states.at(-1), 'idle');
});
test('cleanText removes leading/sentence-initial spaces and empty lines', () => {
  const input = '　吾輩は猫である。　名前はまだ無い。\n\n  \u3000\n　どこで生れたかとんと見当がつかぬ。   ';
  assert.equal(cleanText(input), '吾輩は猫である。名前はまだ無い。\nどこで生れたかとんと見当がつかぬ。');
  assert.equal(cleanText('  桜！　春？ 散歩。'), '桜！春？散歩。');
  assert.equal(cleanText(''), '');
  // Auto breakline on 。 followed by multiple spaces (half-width, full-width, or mixed)
  assert.equal(cleanText('吾輩は猫である。  名前はまだ無い。'), '吾輩は猫である。\n名前はまだ無い。');
  assert.equal(cleanText('吾輩は猫である。 　名前はまだ無い。'), '吾輩は猫である。\n名前はまだ無い。');
  assert.equal(cleanText('吾輩は猫である。　　名前はまだ無い。'), '吾輩は猫である。\n名前はまだ無い。');
  assert.equal(cleanText('吾輩は猫である。  　名前はまだ無い。'), '吾輩は猫である。\n名前はまだ無い。');
});

test('paragraph jumps retain the voice and ignore cancelled start/end events', () => {
  const spoken = [], active = [], states = [];
  class Utterance { constructor(text) { this.text = text; } }
  const speaker = createSpeaker({
    synth: { speak(u) { spoken.push(u); }, cancel() {} }, Utterance,
    onState: state => states.push(state), onParagraph: index => active.push(index),
  });
  const voice = { name: 'Natural', lang: 'ja-JP' };
  const text = '朝です。晴れです。\n昼です。\n夜です。';
  speaker.play(text, voice);
  spoken[0].onstart();
  assert.equal(active.at(-1), 0);
  speaker.play(text, voice, 1);
  const jumped = spoken[1];
  assert.equal(jumped.text, '昼です。');
  assert.equal(jumped.voice, voice);
  spoken[0].onstart();
  spoken[0].onend();
  spoken[0].onerror();
  assert.equal(active.at(-1), null);
  assert.equal(spoken.length, 2);
  jumped.onstart();
  assert.equal(active.at(-1), 1);
  jumped.onend();
  spoken[2].onstart();
  assert.equal(active.at(-1), 2);
  assert.equal(spoken[2].text, '夜です。');
  spoken[2].onend();
  assert.equal(active.at(-1), null);
  assert.equal(states.at(-1), 'idle');
});

test('Yomu paragraph interaction preserves original speech and text selection', async () => {
  const html = await readFile(new URL('../yomu/index.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../yomu/yomu.js', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/yomu/' });
  const { window } = dom;
  const spoken = [];
  class Utterance { constructor(text) { this.text = text; } }
  window.speechSynthesis = {
    getVoices: () => [{ name: 'Natural', lang: 'ja-JP', voiceURI: 'natural' }],
    speak: u => spoken.push(u), cancel() {}, addEventListener() {},
  };
  window.SpeechSynthesisUtterance = Utterance;
  Object.assign(window, { japaneseVoices, createSpeaker, cleanText,
    reader: { speechText: text => prepareSpeechText(text, { overrides: appOverrides }), annotate: async () => {}, restore() {}, destroy() {}, setReadingFormat: async () => {}, setSize(size) { this.size = size; } },
    disposeReader() {},
  });
  try {
    window.eval(source.replace(/^import .*;\n/gm, ''));
    const get = id => window.document.getElementById(id);
    get('input').value = '朝です。\n昼です。\n夜です。';
    get('composer').dispatchEvent(new window.Event('submit', { cancelable: true }));
    const paragraphs = [...get('reading').children];
    assert.equal(paragraphs.length, 3);
    paragraphs[1].innerHTML = '<ruby>昼<rt>ひる</rt></ruby>です。';
    paragraphs[1].click();
    assert.equal(spoken.length, 0);
    get('play').click();
    spoken[0].onstart();
    assert.ok(paragraphs[0].classList.contains('is-speaking'));
    paragraphs[1].querySelector('rt').click();
    assert.equal(spoken.at(-1).text, '昼です。');
    spoken.at(-1).onstart();
    assert.equal(paragraphs[1].getAttribute('aria-current'), 'true');
    const range = window.document.createRange();
    range.selectNodeContents(paragraphs[2]);
    window.getSelection().addRange(range);
    paragraphs[2].click();
    assert.equal(spoken.length, 2);
    window.getSelection().removeAllRanges();
    paragraphs[2].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(spoken.at(-1).text, '夜です。');
    get('play').click();
    assert.equal(get('reading').querySelector('[aria-current]'), null);
    assert.equal(get('reading').querySelector('[tabindex]'), null);
    get('input').value = '   ';
    get('composer').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.equal(get('input').value, '');
    assert.equal(get('reading').children.length, 2);
    assert.equal(window.localStorage.getItem('yomu:input'), null);
    get('input').value = '朝です。  昼です。 　夜です。';
    get('composer').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.equal(get('reading').children.length, 3);
    assert.equal(get('reading').children[0].textContent, '朝です。');
    assert.equal(get('reading').children[1].textContent, '昼です。');
    assert.equal(get('reading').children[2].textContent, '夜です。');

    get('input').value = '○○です（笑）。今日は休みです(笑)。';
    get('composer').dispatchEvent(new window.Event('submit', { cancelable: true }));
    get('play').click();
    assert.equal(spoken.at(-1).text, 'なになにです（わらい）。');
    get('play').click();

    // Ctrl+A / Cmd+A outside textarea selects only #reading
    const selectAllEvent = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    window.document.dispatchEvent(selectAllEvent);
    assert.equal(selectAllEvent.defaultPrevented, true);
    const sel = window.getSelection();
    assert.equal(sel.rangeCount, 1);
    assert.equal(sel.getRangeAt(0).commonAncestorContainer, get('reading'));

    // Ctrl+A / Cmd+A inside textarea does not preventDefault (preserves native behavior)
    const textareaSelectAll = new window.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    get('input').dispatchEvent(textareaSelectAll);
    assert.equal(textareaSelectAll.defaultPrevented, false);
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    await new Promise(resolve => setImmediate(resolve));
    dom.window.close();
  }
});

test('speaker supports rate adjustment via constructor, setRate, and play', () => {
  const spoken = [];
  const synth = { speak(u) { spoken.push(u); }, cancel() {} };
  class Utterance { constructor(text) { this.text = text; } }
  const speaker = createSpeaker({ synth, Utterance, onState: () => {}, rate: 1.5 });
  const voice = { lang: 'ja-JP' };
  speaker.play('朝です。', voice);
  assert.equal(spoken[0].rate, 1.5);
  speaker.setRate(0.8);
  speaker.play('昼です。', voice);
  assert.equal(spoken[1].rate, 0.8);
  speaker.play('夜です。', voice, 0, 1.2);
  assert.equal(spoken[2].rate, 1.2);
  speaker.stop();
});

test('Yomu settings menu controls romaji, size, and speech rate with persistence', async () => {
  const html = await readFile(new URL('../yomu/index.html', import.meta.url), 'utf8');
  const source = await readFile(new URL('../yomu/yomu.js', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/yomu/' });
  const { window } = dom;
  let formattedAs = 'hiragana', readerSize = 68, readerSelection = 'both';
  class Utterance { constructor(text) { this.text = text; } }
  window.speechSynthesis = {
    getVoices: () => [{ name: 'Natural', lang: 'ja-JP', voiceURI: 'natural' }],
    speak() {}, cancel() {}, addEventListener() {},
  };
  window.SpeechSynthesisUtterance = Utterance;
  Object.assign(window, { japaneseVoices, createSpeaker, cleanText,
    reader: {
      annotate: async () => {}, restore() {}, destroy() {},
      setReadingFormat: async (f) => { formattedAs = f; },
      setSize: (s) => { readerSize = s; },
      setSelection: (s) => { readerSelection = s; },
    },
    disposeReader() {},
  });
  try {
    window.eval(source.replace(/^import .*;\n/gm, ''));
    const get = id => window.document.getElementById(id);

    // Initial state
    assert.equal(get('settings-popup').hidden, true);
    assert.equal(get('settings-btn').getAttribute('aria-expanded'), 'false');
    assert.equal(get('ruby-size').value, '68');
    assert.equal(get('ruby-size-val').value, '68%');
    assert.equal(get('speech-rate').value, '1.0');
    assert.equal(get('speech-rate-val').value, '1.0×');
    assert.equal(get('copy-reading').checked, true);

    // Toggle menu open
    get('settings-btn').click();
    assert.equal(get('settings-popup').hidden, false);
    assert.equal(get('settings-btn').getAttribute('aria-expanded'), 'true');

    // Escape closes menu
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(get('settings-popup').hidden, true);
    assert.equal(get('settings-btn').getAttribute('aria-expanded'), 'false');

    // Size slider adjusts size and persists
    get('ruby-size').value = '80';
    get('ruby-size').dispatchEvent(new window.Event('input'));
    assert.equal(get('ruby-size-val').value, '80%');
    assert.equal(readerSize, 80);
    assert.equal(window.localStorage.getItem('yomu:size'), '80');

    // Speed slider adjusts rate display and persists
    get('speech-rate').value = '1.4';
    get('speech-rate').dispatchEvent(new window.Event('input'));
    assert.equal(get('speech-rate-val').value, '1.4×');
    assert.equal(window.localStorage.getItem('yomu:speed'), '1.4');

    get('speech-rate').value = '0.75';
    get('speech-rate').dispatchEvent(new window.Event('input'));
    assert.equal(get('speech-rate-val').value, '0.75×');
    assert.equal(window.localStorage.getItem('yomu:speed'), '0.75');

    assert.equal(get('speech-rate').max, '1.5');
    assert.equal(get('speech-rate').step, '0.05');

    // Romaji switch toggles format and persists
    get('romaji').checked = true;
    get('romaji').dispatchEvent(new window.Event('change'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(formattedAs, 'romaji');
    assert.equal(window.localStorage.getItem('yomu:romaji'), 'true');

    // Copy-reading switch toggles selection mode and persists
    get('copy-reading').checked = false;
    get('copy-reading').dispatchEvent(new window.Event('change'));
    assert.equal(readerSelection, 'base');
    assert.equal(window.localStorage.getItem('yomu:copy-reading'), 'false');

    // Reset button restores all settings to defaults and clears their storage
    window.localStorage.setItem('yomu:voice', 'test-voice');
    get('reset-settings').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(get('romaji').checked, false);
    assert.equal(formattedAs, 'hiragana');
    assert.equal(get('copy-reading').checked, true);
    assert.equal(readerSelection, 'both');
    assert.equal(get('ruby-size').value, '68');
    assert.equal(get('ruby-size-val').value, '68%');
    assert.equal(readerSize, 68);
    assert.equal(get('speech-rate').value, '1.0');
    assert.equal(get('speech-rate-val').value, '1.0×');
    assert.equal(window.localStorage.getItem('yomu:romaji'), null);
    assert.equal(window.localStorage.getItem('yomu:copy-reading'), null);
    assert.equal(window.localStorage.getItem('yomu:size'), null);
    assert.equal(window.localStorage.getItem('yomu:speed'), null);
    assert.equal(window.localStorage.getItem('yomu:voice'), 'test-voice');
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    await new Promise(resolve => setImmediate(resolve));
    dom.window.close();
  }
});

test('Yomu service worker precaches offline bundle assets for offline annotation', async () => {
  const swUrl = new URL('../yomu/sw.js', import.meta.url);
  const swSource = await readFile(swUrl, 'utf8');

  // Verify cache name is updated
  assert.match(swSource, /const CACHE_NAME = 'yomu-v17';/);

  // Extract CORE_ASSETS
  const match = swSource.match(/const CORE_ASSETS = \[\s*([\s\S]*?)\s*\];/);
  assert.ok(match, 'CORE_ASSETS array found in sw.js');
  const assetPaths = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

  // Ensure offline bundle scripts are precached for offline annotation
  assert.ok(
    assetPaths.includes('../dist/offline/kuromoji-dict.js'),
    'CORE_ASSETS must include ../dist/offline/kuromoji-dict.js'
  );
  assert.ok(
    assetPaths.includes('../dist/offline/runtime.js'),
    'CORE_ASSETS must include ../dist/offline/runtime.js'
  );

  assert.ok(assetPaths.includes('./yomigana-overrides.js'), 'Yomu must cache its own override list');

  // Verify every single asset path in CORE_ASSETS exists on disk
  for (const assetPath of assetPaths) {
    if (assetPath === './') continue; // directory index
    const assetUrl = new URL(assetPath, swUrl);
    await assert.doesNotReject(
      access(assetUrl),
      `Asset in CORE_ASSETS must exist on disk: ${assetPath}`
    );
  }
});

test('Yomu annotates on file:// using the offline bundle without network requests', async () => {
  const html = await readFile(new URL('../yomu/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: new URL('../yomu/index.html', import.meta.url).href,
    beforeParse(window) {
      window.Blob = Blob;
      window.Response = Response;
      window.DecompressionStream = DecompressionStream;
      window.fetch = () => { throw new Error('Offline Yomu must not fetch'); };
    }
  });

  try {
    const reading = dom.window.document.getElementById('reading');
    let rubyCount = 0;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      rubyCount = reading?.querySelectorAll('ruby').length || 0;
      if (rubyCount > 0) break;
    }
    assert.ok(rubyCount > 0, 'Yomu must produce ruby annotations offline on file://');
    assert.equal('defaultOverrides' in dom.window.yomiganaWeb, false);
    assert.equal(dom.window.yomiganaWeb.globalOverrides.length, 3);
    assert.notEqual(dom.window.reader.overrides, dom.window.yomiganaWeb.globalOverrides);
    reading.textContent = '○○です（笑）。今日は休みです(笑)。';
    await dom.window.reader.refresh();
    const readings = [...reading.querySelectorAll('rt')].map(rt => rt.textContent);
    assert.ok(readings.includes('なになに'));
    assert.equal(readings.filter(text => text === 'わらい').length, 2);
    assert.equal(dom.window.reader.speechText(reading), 'なになにです（わらい）。今日は休みです（わらい）。');
    // Check comment semantics through the real app-owned list and offline reader.
    const rule = dom.window.reader.overrides.find(entry => entry.match === '（笑）');
    rule.speech = '';
    assert.equal(dom.window.reader.speechText(reading), 'なになにです。今日は休みです（わらい）。');
    assert.equal(reading.querySelectorAll('rt').length, readings.length);
    delete rule.speech;
    assert.equal(dom.window.reader.speechText(reading), 'なになにです（わらい）。今日は休みです（わらい）。');
    rule.annotation = '';
    await dom.window.reader.refresh();
    assert.equal(dom.window.reader.speechText(reading), 'なになにです（笑）。今日は休みです（わらい）。');
    assert.equal([...reading.querySelectorAll('rt')].filter(rt => rt.textContent === 'わらい').length, 1);
    for (const rt of reading.querySelectorAll('rt')) assert.equal(rt.getAttribute('aria-hidden'), 'true');
    reading.innerHTML = '<span data-ym="うえ・した・ひだり・みぎ">上・下・左・右</span>';
    await dom.window.reader.refresh();
    assert.deepEqual([...reading.querySelectorAll('rt')].map(rt => rt.textContent), ['うえ', 'した', 'ひだり', 'みぎ']);
    assert.equal(dom.window.reader.speechText(reading), 'うえ・した・ひだり・みぎ');


  } finally {
    dom.window.close();
  }
});


test('speaker labels receive a sentence pause only during playback', () => {
  const original = '申請者：暗証番号は、何種類設定するんでしょうか？';
  assert.equal(cleanText(original), original);
  assert.equal(preparePlaybackText(original), '申請者。暗証番号は、何種類設定するんでしょうか？');
  assert.equal(preparePlaybackText('佐藤: こんにちは。'), '佐藤。こんにちは。');
  assert.equal(preparePlaybackText('田中：　こんにちは。'), '田中。こんにちは。');
  assert.equal(preparePlaybackText('A：「明日ですね。」'), 'A。「明日ですね。」');
  assert.equal(preparePlaybackText('担当者：10時にお越しください。'), '担当者。10時にお越しください。');
  for (const text of ['10:30に集合します。', 'https://example.com', '説明文です。申請者：こんにちは。', '予定は10:30です。']) {
    assert.equal(preparePlaybackText(text), text);
  }
});

test('playback inserts pauses without changing paragraph indices', () => {
  const utterances = [];
  class Utterance { constructor(text) { this.text = text; } }
  const speaker = createSpeaker({ synth: { cancel() {}, speak(item) { utterances.push(item); } }, Utterance, onState() {} });
  speaker.play('佐藤：こんにちは。\n田中：こんばんは。', { lang: 'ja-JP' }, 1);
  assert.equal(utterances[0].text, '田中。');
  utterances[0].onend();
  assert.equal(utterances[1].text, 'こんばんは。');
  speaker.stop();
});

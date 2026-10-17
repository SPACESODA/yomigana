// Optional showcase controls. Website integrations only need yomigana-setup.js.
globalThis.yomiganaDemoControls = function ({ readers, perKanji, engine, annotatePage }) {
  const $ = (selector) => document.querySelector(selector);
  $('#engine').value = engine;
  $('#engine').disabled = false;
  $('#engine').addEventListener('change', (event) => {
    const url = new URL(location.href);
    url.searchParams.set('engine', event.target.value);
    location.assign(url);
  });
  $('#engine-note').textContent = engine === 'kuromoji'
    ? 'Kuromoji (Full morphological dictionary, ~17 MB, IPADIC)'
    : 'Suzume (Lightweight default, ~1.2 MB, JMdict)';
  $('#alignment').value = perKanji ? 'kanji' : 'word';
  $('#alignment').addEventListener('change', (event) => {
    const url = new URL(location.href);
    url.searchParams.set('alignment', event.target.value);
    location.assign(url);
  });
  const toggle = $('#toggle');
  const format = $('#reading-format');
  format.value = readers[0]?.readingFormat || 'hiragana';
  function updateFormatControls() {
    const romaji = format.value === 'romaji';
    $('#alignment').disabled = romaji;
    $('#romaji-note').hidden = !romaji;
  }
  updateFormatControls();
  format.addEventListener('change', async () => {
    format.disabled = true;
    toggle.disabled = true;
    try {
      await Promise.all(readers.map((reader) => reader.setReadingFormat(format.value)));
      refreshStatus();
    } catch (error) {
      $('#status').textContent = error.message;
      $('#retry').hidden = false;
    } finally {
      updateFormatControls();
      format.disabled = false;
      toggle.disabled = false;
    }
  });
  $('#selection').value = readers[0]?.selection || 'base';
  $('#selection').addEventListener('change', (event) => {
    readers.forEach((reader) => reader.setSelection(event.target.value));
  });
  let visible = true;
  let count = 0;
  for (const reader of readers) {
    reader.onStatus = ({ state, error }) => {
      if (state === 'error') { $('#status').textContent = error.message; $('#retry').hidden = false; }
      if (state === 'ready') refreshStatus();
    };
  }
  function refreshStatus() {
    const count = document.querySelectorAll('ruby[data-yomigana]').length;
    $('#status').textContent = `${count}か所にふりがなを付けました。`;
  }
  function setVisible(value) {
    visible = value;
    readers.forEach((reader) => reader.setVisible(visible));
    toggle.textContent = visible ? 'ふりがなを隠す' : 'ふりがなを表示';
    toggle.setAttribute('aria-pressed', String(visible));
  }
  async function start() {
    toggle.disabled = true;
    $('#retry').hidden = true;
    $('#status').textContent = '辞書を読み込んでいます。初回は少し時間がかかります。';
    try {
      await annotatePage();
      setVisible(visible);
      refreshStatus();
      toggle.disabled = false;
    } catch (error) {
      $('#status').textContent = `読み込みに失敗しました。${error.message}`;
      $('#retry').hidden = false;
    }
  }
  toggle.addEventListener('click', () => setVisible(!visible));
  $('#retry').addEventListener('click', start);
  $('#size').value = readers[0]?.size ?? 60;
  $('#size-value').value = `${$('#size').value}%`;
  $('#size').addEventListener('input', (event) => {
    const value = event.target.value;
    readers.forEach((reader) => reader.setSize(Number(value)));
    $('#size-value').value = `${value}%`;
  });
  const notes = ['駅の近くで、おいしい食べ物を見つけました。', '明日は図書館で、日本の歴史について調べます。', '雨が降っても、散歩を楽しみたいです。', '東京から京都まで、新幹線で旅をしました。'];
  $('#add-note').addEventListener('click', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = notes[count++ % notes.length];
    $('#notes').append(paragraph);
  });
  $('#change-language').addEventListener('click', () => {
    const paragraph = $('#switch-language');
    const japanese = paragraph.lang !== 'ja';
    paragraph.lang = japanese ? 'ja' : 'zh';
    $('#change-language').textContent = japanese ? '最後の段落を中国語に切り替える' : '最後の段落を日本語に切り替える';
  });
  $('#add-language-note').addEventListener('click', () => {
    const paragraph = document.createElement('p');
    paragraph.lang = 'ja-JP';
    paragraph.textContent = '公園の桜が咲きます。';
    $('#language-samples').append(paragraph);
  });
  $('#convert').addEventListener('click', async () => {
    const button = $('#convert');
    button.disabled = true;
    $('#preview-status').textContent = '読み方を調べています…';
    const reader = readers.at(-1);
    reader.restore();
    const paragraph = document.createElement('p');
    paragraph.textContent = $('#input').value;
    $('#preview').replaceChildren(paragraph);
    try {
      await reader.annotate();
      reader.observe();
      $('#preview-status').textContent = '完了しました。読み方は文脈によって異なる場合があります。';
    } catch (error) { $('#preview-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  start();
};

import { yomigana } from '../src/index.js';

// Uses Suzume + JMdict (default lightweight engine, ~1.2 MB).
// selection: 'base' copies original text; 'both': base + reading; 'reading': reading only.
const reader = new yomigana({ root: 'article', size: 60, selection: 'base' });
reader.annotate().catch((error) => {
  console.error(error);
  const notice = document.querySelector('#reading-error');
  notice.hidden = false;
  notice.textContent = 'ふりがなを読み込めませんでした。ページを再読み込みしてください。';
});

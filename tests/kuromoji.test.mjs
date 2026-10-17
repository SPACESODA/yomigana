import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { initializeEngine, tokenize } from '../src/kuromoji-engine.js';
import { annotationsFromTokens } from '../src/align.js';

const sample = '最近、ClaudeをはじめとするAIにUIテキストを書かせると、細部がなかなかうまくいきません。長すぎるラベル、責任転嫁するようなエラー文言、コンテキストを無視した丁寧すぎる言葉遣い。';

test('Kuromoji hosted assets, readings, exact offsets and failures', async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push(req.url);
    try {
      const name = req.url.split('/').at(-1);
      if (!/^[a-z_]+\.dat\.gz$/.test(name) || req.url.startsWith('/missing/')) throw new Error('Missing');
      let bytes = await readFile(new URL(`../vendor/kuromoji/dict/${name}`, import.meta.url));
      if (req.url.startsWith('/decoded/')) bytes = gunzipSync(bytes);
      res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/`;
  const engine = await initializeEngine({ kuromojiDictionaryURL: base });
  assert.equal(requests.length, 12);
  const tokens = tokenize(engine, sample);
  for (const [surface, reading] of [['長', 'なが'], ['文言', 'もんごん'], ['無視', 'むし'], ['遣い', 'づかい']]) {
    assert.equal(tokens.find((token) => token.surface === surface)?.reading, reading, surface);
  }
  assert.ok(tokens.filter((token) => /\p{Script=Han}/u.test(token.surface)).every((token) => token.reading));
  const cases = [
    ['朝の空気は少し冷たく、子供たちが遊んでいます。', [['冷たく', 'つめたく'], ['遊ん', 'あそん']]],
    ['専門用語・技術用語を避ける。', [['専門', 'せんもん'], ['避ける', 'さける']]],
    ['駅まで歩いて、電車に乗りました。', [['歩い', 'あるい'], ['乗り', 'のり']]],
    ['新しい本を買って、図書館で読みました。', [['新しい', 'あたらしい'], ['買っ', 'かっ'], ['図書館', 'としょかん']]],
    ['今日は雨ですが、明日は晴れるでしょう。', [['今日', 'きょう'], ['明日', 'あした']]],
  ];
  for (const [text, expected] of cases) {
    const result = tokenize(engine, text);
    for (const [surface, reading] of expected) assert.equal(result.find((token) => token.surface === surface)?.reading, reading, text);
    assert.ok(result.filter((token) => /\p{Script=Han}/u.test(token.surface)).every((token) => token.reading), text);
    assert.equal(annotationsFromTokens(text, result).map((part) => part.text).join(''), text);
  }
  for (const text of [sample, '', '😀𠮷 ＡＢＣ ﾊﾟ 桜\n\t桜', '桜。桜、桜', '<b>桜</b> & 桜', 'ば 桜  \r\n猫', '\ud800桜']) {
    const result = tokenize(engine, text);
    assert.equal(result.map((token) => token.surface).join(''), text);
    for (const token of result) assert.equal(text.slice(token.start, token.end), token.surface);
    assert.equal(annotationsFromTokens(text, result).map((part) => part.text).join(''), text);
  }
  assert.equal(tokenize(engine, '𠮷')[0].readingStatus, 'unknown');
  assert.equal(tokenize(engine, '日本')[0].readingStatus, 'analyzer');
  engine.alignments = { 桜: { さくら: [['桜', 'さくら']] } };
  assert.deepEqual(tokenize(engine, '桜')[0].alignment, [['桜', 'さくら']]);
  const decoded = await initializeEngine({ kuromojiDictionaryURL: `${base}decoded/`, alignment: 'kanji', dictionaryURL: `${base}missing/manifest.json` });
  assert.equal(tokenize(decoded, '桜')[0].reading, 'さくら');
  await assert.rejects(initializeEngine({ kuromojiDictionaryURL: `${base}missing/` }), /HTTP 404/);
  await assert.rejects(initializeEngine({ kuromojiDictionaryURL: `${base}dict` }), /ending in/);
  await assert.rejects(initializeEngine({ readingPolicy: 'strict' }), /only supported/);
  await assert.rejects(initializeEngine({ alignment: 'invalid' }), /alignment/);
});

# yomigana guide

yomigana adds Japanese readings to existing web content with native HTML ruby. It keeps the surrounding DOM intact, processes text in the browser, and supports both hosted and standalone offline use.

[Quick start](#hosted-quick-start) · [Offline setup](#offline-setup) · [Language scope](#choose-which-text-to-annotate) · [Overrides](#correct-a-reading) · [API](#api-reference) · [Troubleshooting](#troubleshooting)

## Choose a setup

| Setup | Use it when | Processing |
| --- | --- | --- |
| Hosted ES modules | Your site runs over HTTP(S) | Web Worker |
| Standalone offline build | The page must work without a server or network connection, including `file://` | Main thread |

Both setups process text locally. Neither sends page content to a reading API.

## Hosted quick start

Deploy `src/`, `presets/`, and `vendor/` together, preserving their relative paths.

```html
<link rel="stylesheet" href="./src/yomigana.css">

<article id="reading" lang="ja">
  日本では、春になると桜が咲きます。
</article>

<script type="module">
  import { yomigana } from './src/index.js';

  const reader = new yomigana({ root: '#reading' });
  await reader.annotate();
  reader.observe(); // Optional: watch later DOM changes.
</script>
```

The default engine is Suzume with word grouping and hiragana readings. The default reading size is 60%, with a smaller proportional size on large headings.

Module workers require HTTP(S), so use the offline build for pages opened directly from the filesystem.

## Offline setup

The offline build uses ordinary script tags. Load the assets in this order:

```html
<link rel="stylesheet" href="./src/yomigana.css">

<article id="reading" lang="ja">公園の桜が咲きます。</article>

<script src="./dist/offline/suzume-wasm.js"></script>
<script src="./dist/offline/readings.js"></script>
<!-- Optional: needed only for per-kanji dictionary alignment. -->
<script src="./dist/offline/alignments.js"></script>
<script src="./dist/offline/runtime.js"></script>
<script>
  const provider = yomiganaWeb.createLocalProvider({ alignment: 'kanji' });
  const reader = new yomiganaWeb.yomigana({ root: '#reading', provider });

  reader.annotate()
    .then(() => reader.observe())
    .catch(console.error);
</script>
```

For offline Kuromoji, load `kuromoji-dict.js` instead of `suzume-wasm.js` and `readings.js`, then create the provider with `{ engine: 'kuromoji' }`. Keep `runtime.js` and the relevant notices. Load `alignments.js` only when using per-kanji alignment.

Offline analysis runs on the main thread and may briefly pause during dictionary initialization or long inputs. It requires `DecompressionStream('gzip')`. See the [offline demo](demo-offline/index.html) for a complete example.

## Choose which text to annotate

yomigana annotates text inside `<ja>` or text that inherits `lang="ja"` or a Japanese regional tag such as `ja-JP`.

```html
<article lang="ja">
  <p>桜の季節です。</p>
  <p lang="zh">中国的春天。</p>
</article>
```

On a mixed-language page, `<ja>` provides a compact scope:

```html
<p><ja>今週末空いてる？</ja> (Are you free this weekend?)</p>
```

`<ja>` is a yomigana marker rather than a standard language element. Use `<ja lang="ja">` or `<span lang="ja">` when native browser and assistive-technology language metadata also matters. Markdown can use `<ja>` when its renderer preserves inline HTML; block directives such as `:::ja` require a Markdown directive plugin to produce HTML first.

Initialize the reader on an ancestor that contains every marker:

```js
const reader = new yomigana({ root: document.body });
await reader.annotate();
reader.observe();
```

Use `data-yomigana-ignore` to exclude a subtree:

```html
<nav data-yomigana-ignore>この部分は処理しません。</nav>
```

Text without language metadata is skipped by default. Set `assumeJapanese: true` for a known-Japanese area with missing metadata. Explicitly non-Japanese text remains excluded. `language: 'all'` bypasses language filtering and should be used carefully on multilingual pages.

## Choose an engine

```js
import { yomigana, createLocalProvider } from './src/index.js';

const provider = createLocalProvider({
  engine: 'kuromoji',
  alignment: 'kanji',
});

const reader = new yomigana({ root: '#reading', provider });
await reader.annotate();
```

| Engine | Default data | Characteristics |
| --- | --- | --- |
| `suzume` | JMdict | Smaller default engine; chooses from dictionary readings without contextual disambiguation. |
| `kuromoji` | IPADIC | Uses morphological analysis to select a token reading; larger dictionary. |

Both engines may misread names, rare spellings, counters, or ambiguous text. Unknown and unresolved text can remain unannotated. Correct known cases with an override.

### Provider options

| Option | Default | Purpose |
| --- | --- | --- |
| `engine` | `'suzume'` | Select `'suzume'` or `'kuromoji'`. |
| `alignment` | `'word'` | Use `'kanji'` to apply optional per-kanji mappings where available. |
| `readingPolicy` | `'preferred'` | Suzume only. Use `'strict'` to skip results with multiple remaining readings. |
| `dictionaryURL` | Bundled manifest | Relocate hosted JMdict or optional alignment data. Cross-origin hosting requires CORS. |
| `kuromojiDictionaryURL` | Bundled dictionary directory | Relocate the hosted IPADIC files. The URL must end in `/`. |

`fineAlignment` is retained as a legacy alias for `alignment`. Per-kanji alignment changes grouping, not the source or certainty of a reading. Invalid or missing mappings fall back to normal kana-anchor or word grouping.

Share one provider across several non-overlapping readers to avoid duplicate workers and dictionary memory. Destroy the readers before destroying a shared provider.

## Change the display

```js
await reader.setReadingFormat('katakana'); // 'hiragana' | 'katakana' | 'romaji'
reader.setSize(55);
reader.setSelection('both');               // 'base' | 'reading' | 'both'
reader.setVisible(false);
```

Hiragana and katakana retain kana anchors when possible, leaving okurigana outside ruby. Romaji converts only generated readings; it does not transliterate the whole sentence.

Copy modes produce plain text:

| Mode | Example |
| --- | --- |
| `base` | `桜が咲きます。` |
| `reading` | `さくらがさきます。` |
| `both` | `桜(さくら)が咲(さ)きます。` |

Hidden readings copy as base text. The `reading` and `both` modes use the current display format.

## Correct a reading

There are two levels of correction:

1. Use `data-ym` for a per-occurrence override.
2. Pass `overrides` for a reading used throughout one reader.

The priority is `data-ym`, then global overrides, then the engine's reading.

### Per-occurrence overrides with `data-ym`

```html
<p lang="ja">夜が<span data-ym="しんしん">深々</span>と更ける。</p>
<ja data-ym="うて">打て</ja>
```

Write the reading in hiragana or katakana. The same value displays as `しんしん`, `シンシン`, or `shinshin` when the format changes.

Wrap only the text that needs the correction. The wrapper must contain plain text; place formatting outside it:

```html
<strong><span data-ym="しんしん">深々</span></strong>
```

`data-ym` itself does not declare a language. Use it directly on `<ja>` to combine Japanese scope and a local override, on an element with `lang="ja"`, or on a span inside an existing Japanese scope. Invalid, empty, non-kana, or nested-markup values fall back to ordinary annotation; an empty value does not hide furigana or silence speech preparation. With `observe()`, changing or removing the attribute refreshes the reading automatically.

The attribute is `data-ym` throughout the library and demos. Library-owned `data-yomigana` and `data-yomigana-ignore` markers retain their names.

The attribute can also describe several words when the reading repeats the source separators:

```html
<ja><span data-ym="うえ・した・ひだり・みぎ">上・下・左・右</span></ja>
```

Supported separators include spaces, `・`, `、`, `。`, wave dashes, Japanese quotation marks, `（）`, `【】`, and colons. The source and reading must have corresponding parts. Use separate spans when a phrase cannot be represented clearly.

### Global overrides

```js
const overrides = [
  { match: '〇〇', annotation: 'なになに' },
  { match: '（笑）', annotation: 'わらい', speech: '（わらい）' },
];

const reader = new yomigana({ root: '#reading', overrides });
await reader.annotate();
```

Matches are literal and case-sensitive. Matching runs left to right; the longest match wins when several begin at the same position. Duplicate matches are rejected.

| Field | Omitted | Empty string |
| --- | --- | --- |
| `annotation` | Use the dictionary reading | Suppress furigana for the match |
| `speech` | Use the annotation reading with source punctuation, or the original text | Omit the match from prepared speech text |

The optional prepared list can be enabled explicitly:

```js
import { yomigana, globalOverrides } from './src/index.js';

const reader = new yomigana({
  root: '#reading',
  overrides: globalOverrides,
});
```

Edit [presets/global-overrides.js](presets/global-overrides.js) to change that list. Rebuild the offline runtime after editing it. Importing the list does not enable it unless you pass it to the reader.

The older object form, such as `{ 日本: 'にほん' }`, remains supported for exact analyzer-token matches. Use the array form for new code. After changing `reader.overrides`, call `await reader.refresh()`.

## Dynamic content

Call `observe()` after the first annotation to watch added text, text edits, and relevant attributes:

```js
await reader.annotate();
reader.observe();
```

The observer responds to `lang`, `hidden`, `aria-hidden`, `contenteditable`, `data-yomigana-ignore`, and `data-ym`. It also watches those attributes on ancestors of a scoped root. CSS-only visibility changes are not observed.

Use `await reader.refresh()` to remove generated readings and re-evaluate the current content. Use it after moving the root or after policy changes made while observation is disabled.

`restore()` removes the reader's ruby and stops observation. `destroy()` also clears its cache and destroys an internally created provider. A destroyed reader cannot be reused.

## Size and styling

Include `src/yomigana.css`. It targets only generated `ruby[data-yomigana]`, leaving publisher ruby styles alone.

```css
.reading-area {
  --yomigana-color: #526258;
}

.reading-area h1 {
  --yomigana-size: .4em;
}

.vertical-reading {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}
```

`--yomigana-size` overrides the automatic size set by `setSize()`. Native ruby follows horizontal or vertical writing modes; exact placement depends on the browser and font.

## Speech text

`speechText()` prepares corrected text for an app's own speech synthesis. It does not play audio or control screen readers.

```js
const text = reader.speechText(document.querySelector('#reading'));
```

It uses global overrides and valid `data-ym` readings, ignores generated ruby text and excluded content, and always returns kana independently of the visual format. The standalone `prepareSpeechText(source, { overrides })` export provides the same behavior without creating a reader.

## API reference

The module entry exports `yomigana`, `createLocalProvider`, `alignReading`, `prepareSpeechText`, and `globalOverrides`. The offline bundle exposes them on `globalThis.yomiganaWeb`.

### Constructor

```js
const reader = new yomigana({ root: '#reading' });
```

| Option | Default | Purpose |
| --- | --- | --- |
| `root` | Required | An existing element or a selector for its first match. |
| `provider` | Internal Suzume provider | Any object with asynchronous `analyze(texts)` and optional `destroy()`. |
| `size` | `60` | Reading size percentage from greater than 0 through 100. |
| `readingFormat` | `'hiragana'` | `'hiragana'`, `'katakana'`, or `'romaji'`. |
| `selection` | `'base'` | Plain-text copy mode: `'base'`, `'reading'`, or `'both'`. |
| `language` | `'ja'` | Use `'all'` to bypass language filtering. |
| `assumeJapanese` | `false` | Treat missing language metadata as Japanese. |
| `overrides` | No entries | Global reading and speech corrections. |
| `cacheSize` | `300` | Maximum cached text chunks. Use `0` to disable retention. |
| `onStatus` | No-op | Receives loading, ready, and error status objects. |

Construction alone does not annotate or observe. The ready status count is the number of generated ruby elements.

### Reader methods

| Method | Result |
| --- | --- |
| `annotate()` | Annotates eligible text and returns `Promise<void>`. |
| `observe()` | Starts observing and returns the reader. |
| `refresh()` | Restores and re-annotates, preserving observation and visibility. |
| `setReadingFormat(format)` | Changes format, refreshes, and returns `Promise<void>`. |
| `setSize(percent)` | Updates current and future ruby and returns the reader. |
| `setSelection(mode)` | Updates current and future copy behavior and returns the reader. |
| `setVisible(boolean)` | Shows or hides generated readings. |
| `speechText(source?)` | Returns corrected text for speech. |
| `restore()` | Removes owned ruby and stops observation; the reader remains reusable. |
| `destroy()` | Restores, clears caches, and permanently stops the reader. |

Await `annotate()`, `refresh()`, and `setReadingFormat()`. Their errors still reject even when `onStatus` reports them.

### Provider interface

Providers expose `analyze(texts): Promise<Token[][]>` and `destroy()`. A token can include its surface, kana reading, original UTF-16 offsets, grammatical fields, candidate readings, alignment data, and reading status.

`alignReading(surface, reading)` is a synchronous utility. It returns text and reading segments using kana anchors or grouped fallback; it does not tokenize or load a dictionary.

## Scope and limitations

- Existing ruby, code, form controls, editable content, SVG, MathML, and explicitly hidden or ignored subtrees are skipped.
- Text nodes are analyzed separately. A word split by author markup can lose context, and a global override cannot span those elements.
- Iframes, shadow roots, attributes, image text, and CSS-generated content are not traversed automatically.
- Avoid running annotation at the same time a framework is reconciling the same text nodes.
- Reading selection is conservative but not contextually certain. Proper names and ambiguous words need explicit correction.
- Per-kanji grouping is used only when the mapping reconstructs both the written form and chosen reading.
- Generated readings use `aria-hidden="true"` and `data-nosnippet`. Test assistive technology with your own page structure and target browsers.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Nothing is annotated | Confirm the root exists, Japanese scope is present, and no ancestor is ignored or hidden. Await `annotate()` and inspect its rejection. Kana-only text needs no ruby. |
| Some kanji have no reading | The word may be unknown, ambiguous, unusually inflected, or split by markup. Add a global override or `data-ym` when you know the reading. |
| Hosted setup fails from a local file | Run `npm run dev` or use the offline build. Module workers require HTTP(S). |
| An asset loads as HTML | Check the path and server fallback rules. Serve JavaScript, JSON, WASM, and compressed dictionaries with suitable content types. |
| Cross-origin assets fail | Enable CORS for modules, dictionaries, and WASM. |
| CSP blocks loading | Permit the required module, worker, blob, WASM, or offline data URL sources. |
| Readings have the wrong size | Include `yomigana.css` and check inherited `--yomigana-size`. |
| A route change removes annotations | Create a reader for a replaced root. Call `refresh()` if the same root only moved. |

## Demos and maintenance

- [Basic demo](demo-basic/index.html): minimal hosted integration.
- [Online full demo](demo-online/index.html): engines, formats, alignment, copying, overrides, and dynamic content.
- [Offline full demo](demo-offline/index.html): the same features without a server or network connection, including `file://`.
- [Yomu](yomu/index.html): standalone reading and speech tool.

Run `npm run dev` to serve the homepage and hosted demos. Build and dictionary maintenance details are in [scripts/MAINTAINER.md](scripts/MAINTAINER.md).

## Third-party notices

yomigana includes or derives data from Suzume, JMdict, jmdict-simplified, JmdictFurigana, Kuromoji, and IPADIC. Their code and data use separate licenses. Preserve the relevant files in `vendor/` or `dist/offline/` when distributing those assets.

The package is currently private, and a project code license has not yet been selected.


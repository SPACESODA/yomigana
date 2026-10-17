# yomigana

Add Japanese readings to a web page without replacing its HTML.

yomigana turns eligible text nodes into native `<ruby>` markup while preserving links, event listeners, and the surrounding DOM. It supports hiragana, katakana, and romaji; works with dynamic content; and can run from a web server or entirely offline.

[Homepage](https://spacesoda.github.io/yomigana/) · [Full guide](docs.md) · [Online demo](https://spacesoda.github.io/yomigana/demo-online/) · [Offline demo](https://spacesoda.github.io/yomigana/demo-offline/) · [Basic demo](https://spacesoda.github.io/yomigana/demo-basic/) · [Yomu reader](https://spacesoda.github.io/yomigana/yomu/)

## Highlights

- Preserves the existing DOM and publisher-provided ruby.
- Keeps okurigana outside ruby where the reading can be aligned safely.
- Uses `<ja>` or standard `lang="ja"` markup to target Japanese text.
- Supports global and per-occurrence `data-ym` reading overrides.
- Watches dynamically added or edited content with `observe()`.
- Copies clean plain text in base, reading, or combined modes.
- Marks generated readings with `aria-hidden="true"` and `data-nosnippet`.
- Offers a lightweight Suzume engine and a Kuromoji morphological engine.
- Processes text locally, with hosted and standalone offline builds.

## Quick start

Keep `src/`, `presets/`, and `vendor/` together on your server, then add the stylesheet and module:

```html
<link rel="stylesheet" href="./src/yomigana.css">

<article id="reading" lang="ja">
  公園の桜が咲きます。
</article>

<script type="module">
  import { yomigana } from './src/index.js';

  const reader = new yomigana({ root: '#reading' });
  await reader.annotate();
  reader.observe(); // Optional: watch later DOM changes.
</script>
```

Japanese language markup is required by default. On a mixed-language page, `<ja>` is a convenient scope:

```html
<p><ja>今週末空いてる？</ja> (Are you free this weekend?)</p>
```

Correct one occurrence with `data-ym`, either directly on `<ja>` or on a span:

```html
<ja>夜が<span data-ym="しんしん">深々</span>と更ける。</ja>
<ja data-ym="うて">打て</ja>
```

Supply the reading in hiragana or katakana. yomigana converts it when the display changes to hiragana, katakana, or romaji. A local `data-ym` reading takes priority over global overrides and dictionary results.

See the [full guide](docs.md) for offline scripts, engine selection, global overrides, copy modes, styling, dynamic content, and the complete API.

## Engines

| Engine | Best for | Source |
| --- | --- | --- |
| Suzume | Smaller default setup | JMdict readings |
| Kuromoji | Morphological analysis and contextual tokenization | IPADIC |

Both engines run in the browser and may still misread names, uncommon spellings, or ambiguous text. Use an override when the intended reading is known.

Hosted integrations analyze text in a Web Worker. The offline build uses prebuilt classic scripts and also works when opened directly with `file://`.

## Demos

| Demo | Use it for |
| --- | --- |
| [Online full demo](https://spacesoda.github.io/yomigana/demo-online/) | Compare engines, formats, grouping, copying, and overrides over HTTP(S). |
| [Offline full demo](https://spacesoda.github.io/yomigana/demo-offline/) | Try the same controls without a server or network connection. |
| [Basic demo](https://spacesoda.github.io/yomigana/demo-basic/) | See a minimal hosted integration. |
| [Yomu](https://spacesoda.github.io/yomigana/yomu/) | Paste text into a dedicated reading and speech tool. |

Yomu adds a longer pause after line-leading speaker labels (`申請者：` or `佐藤:`) by using `。` in playback text only. Input and displayed text, times, and URLs stay unchanged. This behavior belongs to the app, not the library or its global overrides.

To run the hosted demos locally:

```sh
npm ci
npm run dev
```

Node.js is used only for development and builds. The deployed library consists of static browser files.

## Development

```sh
npm test       # Run the regression suite
npm run build  # Rebuild Kuromoji and offline assets
npm run dev    # Start the local demo server
```

Build and dictionary maintenance details are in [scripts/MAINTAINER.md](scripts/MAINTAINER.md).

## Status and attribution

yomigana is licensed under the [GNU AGPLv3](LICENSE).

yomigana uses [Suzume](https://github.com/libraz/suzume), [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) via [jmdict-simplified](https://github.com/scriptin/jmdict-simplified), optional [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) data, and optional [Kuromoji](https://github.com/takuyaa/kuromoji.js) with IPADIC. Preserve the notices and licenses in `vendor/` or `dist/offline/` when distributing their assets.

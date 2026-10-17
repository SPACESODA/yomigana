---
type: Note
---

# Basic Online Demo

Serve alongside `src/`, `presets/`, and `vendor/` over HTTP(S). For local preview, run `npm run dev` and visit http://127.0.0.1:4173/demo-basic/. This is not a file:// demo.

`index.html` is a simple Japanese article, `styles.css` only styles the page, and `yomigana-setup.js` imports yomigana, creates a reader and annotates the article. No controls or custom provider. Defaults: Web Worker, grouped/kana-anchor alignment, 60% (automatically reduced for larger text) reading size. Only the article is annotated; lang="ja" is inherited from the page.

For your website, include `src/yomigana.css`, mark Japanese content with lang="ja", and use the small setup in yomigana-setup.js. No Node.js, demo controls or offline bundles are needed on your web host.

This basic demo does **not** enable global overrides. Importing `src/index.js` makes the prepared list available but does not activate it. To enable it, import `globalOverrides` and pass `overrides: globalOverrides` to the reader. See [global override setup](../docs.md#reading-overrides).

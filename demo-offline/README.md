---
type: Note
---

# Offline Showcase

Everything here is specific to the Japanese blog example, not required to embed the library.

| File | Purpose |
| --- | --- |
| `index.html` | Blog content, example controls and integration notes |
| `styles.css` | Demo layout and visual design |
| `yomigana-setup.js` | Library configuration and annotation |
| `demo-controls.js` | Optional toggles, slider, notes and custom-text input |
| `yomigana-loader.js` | Loads offline assets and setup |

Open `index.html` locally without a server or network, keeping sibling `src/` and `dist/` folders in place. This demo always uses classic scripts and main-thread analysis, including when hosted at http://127.0.0.1:4173/demo-offline/. External attribution links are references only. Keep demo-controls.js in sync with demo-online/demo-controls.js; tests verify parity.

Demo scripts need no build step. Use `npm run build` to rebuild the offline library assets. The size default is 60% (automatically reduced for larger text). The count reports ruby elements, not distinct words: per-kanji grouping creates more elements for the same covered text.

Defaults to Kuromoji + IPADIC. The Engine selector also offers Suzume + JMdict; changing it reloads the page and resets input. Edit `defaultEngine` in `yomigana-setup.js` to change the initial choice. The loader loads only the selected engine's data: `kuromoji-dict.js` (about 23 MiB), or `suzume-wasm.js` plus `readings.js`. Kuromoji uses the browser's `DecompressionStream`, without fetching local binary files. Keep the generated Kuromoji license/notice files with the distribution. See the [maintainer workflow](../scripts/MAINTAINER.md#updating-kuromoji).

The multilingual section demonstrates Japanese-only annotation, explicit Chinese/English exclusions, `data-yomigana-ignore`, a live language-switch button, and dynamically inserted Japanese paragraphs. Both hosted and offline-compatible builds use the same filtering rules.

This demo passes `yomiganaWeb.globalOverrides` from the offline bundle to each reader. Edit the prepared source list at `../presets/global-overrides.js`, then run `npm run build:offline` to regenerate the bundled copy. There is no separate demo list. Yomu retains its own independent app list. See [global override setup](../docs.md#reading-overrides).

---
type: Note
---

# Online Showcase

Serve the project over HTTP(S), or run `npm run dev` and open http://127.0.0.1:4173/demo-online/. Do not open via file://.

Same full controls as `demo-offline/`, using ES modules and a Web Worker. Defaults to Kuromoji + IPADIC; the Engine selector can switch to the smaller Suzume + JMdict engine. Switching reloads the page and resets input. Edit `defaultEngine` in `yomigana-setup.js` to change the initial choice; the `?engine=` query parameter overrides it. Analysis stays in the browser; no reading API or CDN is used. No Node.js is required on production hosting.

`index.html` is content, `styles.css` is demo styling, `yomigana-setup.js` configures annotation, and `demo-controls.js` adds optional controls. Keep demo-controls.js in sync with `demo-offline/demo-controls.js`; tests check parity. Deploy alongside `src/`, `presets/`, and `vendor/`. No offline bundles are needed.

This demo passes `globalOverrides` from the library to each reader. Edit `../presets/global-overrides.js` to manage its entries. The same source list is used by the offline demo. It has no demo-specific list file. See [global override setup](../docs.md#reading-overrides).

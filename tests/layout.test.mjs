import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
test('library source imports resolve after reorganization', async () => {
  for (const name of await readdir(new URL('src/', root))) {
    if (!name.endsWith('.js')) continue;
    const file = new URL(`src/${name}`, root);
    const source = await readFile(file, 'utf8');
    for (const [, relative] of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) await access(new URL(relative, file));
  }
});
test('demo-only output is separate from library distribution', async () => {
  const files = await readdir(new URL('dist/offline/', root));
  assert.equal(files.includes('demo.js'), false);
  await access(new URL('demo-offline/yomigana-setup.js', root));
  const app = await readFile(new URL('demo-online/yomigana-setup.js', root), 'utf8');
  assert.match(app, /from '\.\.\/src\/index\.js'/);
  for (const demo of ['demo-offline', 'demo-online', 'demo-basic', 'yomu']) {
    const file = new URL(`${demo}/index.html`, root);
    const html = await readFile(file, 'utf8');
    for (const [, relative] of html.matchAll(/(?:src|href)="(\.\.?\/[^"#]+)"/g)) await access(new URL(relative, file));
  }
});
test('showcases keep identical controls with explicit loading paths', async () => {
  assert.equal(await readFile(new URL('demo-offline/demo-controls.js', root), 'utf8'), await readFile(new URL('demo-online/demo-controls.js', root), 'utf8'));
  const loader = await readFile(new URL('demo-offline/yomigana-loader.js', root), 'utf8');
  assert.doesNotMatch(loader, /import\(/);
  assert.match(loader, /dist\/offline\/runtime\.js/);
  const html = await readFile(new URL('demo-online/index.html', root), 'utf8');
  assert.match(html, /type="module" src="\.\/yomigana-setup\.js"/);
  for (const demo of ['demo-online', 'demo-offline']) {
    const page = await readFile(new URL(`${demo}/index.html`, root), 'utf8');
    assert.match(page, /id="engine"/);
    assert.match(page, /value="kuromoji"/);
    assert.match(page, /value="suzume"/);
    const setup = await readFile(new URL(`${demo}/yomigana-setup.js`, root), 'utf8');
    assert.match(setup, /const defaultEngine = 'kuromoji'/);
    assert.match(setup, /createLocalProvider\(\{ engine,/);
  }
});

test('showcase reading-size controls support annotations up to 100%', async () => {
  const [online, offline] = await Promise.all([
    readFile(new URL('../demo-online/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../demo-offline/index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(online, /id="size"[^>]*max="100"/);
  assert.match(offline, /id="size"[^>]*max="100"/);
});
test('basic demo uses default annotation without controls', async () => {
  const html = await readFile(new URL('demo-basic/index.html', root), 'utf8');
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /type="module" src="\.\/yomigana-setup\.js"/);
  assert.doesNotMatch(html, /<(button|input|select|textarea)\b/);
  assert.match(html, /辞書サイズの小さい Suzume \+ JMdict/);
  const app = await readFile(new URL('demo-basic/yomigana-setup.js', root), 'utf8');
  assert.match(app, /new yomigana\(\{ root: 'article', size: 60, selection: 'base' \}\)/);
  assert.match(app, /reader\.annotate\(\)/);
});
test('Yomu uses a default-off romaji switch without a format dropdown', async () => {
  const html = await readFile(new URL('yomu/index.html', root), 'utf8');
  const css = await readFile(new URL('yomu/styles.css', root), 'utf8');
  assert.match(html, /id="romaji" type="checkbox" role="switch"/);
  assert.doesNotMatch(html, /id="romaji"[^>]*checked/);
  assert.doesNotMatch(html, /id="format"/);
  assert.match(css, /select \{ appearance: none; -webkit-appearance: none;/);
});

test('override lists belong to each app and load before reader setup', async () => {
  await assert.rejects(access(new URL('src/default-overrides.js', root)));
  const api = await readFile(new URL('src/index.js', root), 'utf8');
  assert.doesNotMatch(api, /defaultOverrides/);
  for (const app of ['yomu']) {
    const config = await readFile(new URL(`${app}/yomigana-overrides.js`, root), 'utf8');
    assert.match(config, /globalThis\.yomiganaOverrides = \[/);
    assert.doesNotMatch(config, /import|demo-online|demo-offline/);
    const html = await readFile(new URL(`${app}/index.html`, root), 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
    assert.ok(scripts.includes('./yomigana-overrides.js'));
    const entry = app === 'demo-offline' ? './yomigana-loader.js' : './yomigana-setup.js';
    assert.ok(scripts.includes(entry));
    assert.ok(scripts.indexOf('./yomigana-overrides.js') < scripts.indexOf(entry));
    const setup = await readFile(new URL(`${app}/yomigana-setup.js`, root), 'utf8');
    assert.match(setup, /overrides: globalThis\.yomiganaOverrides \?\? \[\]/);
  }
});

test('demos share an optional packaged preset without app-specific lists', async () => {
  const { globalOverrides } = await import('../src/index.js');
  assert.equal(globalOverrides.length, 3);
  assert.ok(globalOverrides.every(entry => !('speech' in entry)));
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.ok(pkg.files.includes('presets/'));
  await access(new URL(pkg.exports['./presets/global-overrides.js'], root));
  for (const app of ['demo-online', 'demo-offline']) {
    await assert.rejects(access(new URL(`${app}/yomigana-overrides.js`, root)));
    const setup = await readFile(new URL(`${app}/yomigana-setup.js`, root), 'utf8');
    assert.match(setup, /overrides: globalOverrides/);
    const html = await readFile(new URL(`${app}/index.html`, root), 'utf8');
    assert.doesNotMatch(html, /src="\.\/yomigana-overrides\.js"/);
  }
});

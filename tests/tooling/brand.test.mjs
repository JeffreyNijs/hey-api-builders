import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { brandNames, renderBrandAssets } from '../../scripts/render-brand.ts';

const root = new URL('../../assets/brand/', import.meta.url);

test('brand exports are current, self-contained and accessible', async () => {
  const assets = await renderBrandAssets();
  assert.deepEqual(
    (await readdir(root)).filter((name) => /\.(svg|png)$/.test(name)).sort(),
    [...assets.keys()].sort()
  );
  for (const [name, expected] of assets) {
    assert.deepEqual(await readFile(new URL(name, root)), Buffer.from(expected), name);
    if (!name.endsWith('.svg')) continue;
    assert.match(expected, /role="img"/);
    assert.match(expected, /<title id="title">/);
    assert.doesNotMatch(expected, /<image\b|<script\b|<animate\b|@keyframes|href=|<!-- mascot -->/);
    assert.doesNotMatch(expected, /M28 50C24 29|hooked tail/);
    const ids = [...expected.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate IDs`);
    // Each normal-sized mascot includes the exact approved face and outline.
    if (name !== 'favicon.svg') {
      assert.match(expected, /M110\.8 132\.9C115\.5 136\.8 125\.7 138 129 129\.8/);
      assert.match(expected, /M147 44L148 66/);
    }
    assert.ok(new Resvg(expected).render().asPng().length > 0);
  }
  assert.equal(brandNames.length, 10);
});

test('social raster is deterministic and 1200 × 630', async () => {
  const first = await renderBrandAssets();
  const second = await renderBrandAssets();
  const png = first.get('social.png');
  assert.deepEqual(png, second.get('social.png'));
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.doesNotMatch(first.get('social.svg'), /<text\b/);
});

test('small icon renders at 16, 24 and 32 pixels', async () => {
  const assets = await renderBrandAssets();
  for (const size of [16, 24, 32]) {
    const rendered = new Resvg(assets.get('favicon.svg'), {
      fitTo: { mode: 'width', value: size },
    }).render();
    assert.equal(rendered.width, size);
    assert.equal(rendered.height, size);
    assert.ok(rendered.pixels.some((value) => value !== 0));
  }
});

test('README, docs navigation, social metadata and story references resolve', async () => {
  const assets = await renderBrandAssets();
  const repo = new URL('../../', import.meta.url);
  const references = new Set();
  for (const file of [
    'README.md',
    'apps/docs/.vitepress/config.ts',
    'apps/docs/.vitepress/theme/MimletHome.vue',
    'apps/docs/content.ts',
  ]) {
    const contents = await readFile(new URL(file, repo), 'utf8');
    for (const match of contents.matchAll(/(?:brand\/|illustration: ')([a-z-]+\.(?:svg|png))/g)) {
      references.add(match[1]);
      assert.ok(assets.has(match[1]), `${file}: missing ${match[1]}`);
    }
    assert.doesNotMatch(contents, /M28 50C24 29/);
  }
  for (const name of [
    'mark.svg',
    'mark-dark.svg',
    'favicon.svg',
    'social.png',
    'readme-banner.svg',
    'schema.svg',
    'scenarios.svg',
    'replay.svg',
  ]) {
    assert.ok(references.has(name), `uncovered reference: ${name}`);
  }
});

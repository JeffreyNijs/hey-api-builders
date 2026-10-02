/** Shared, hand-authored geometry. Published assets are static, self-contained SVGs. */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const source = new URL('./brand/', import.meta.url);
export const brandNames = [
  'mark',
  'mark-dark',
  'favicon',
  'wordmark',
  'wordmark-dark',
  'readme-banner',
  'schema',
  'scenarios',
  'replay',
  'social',
] as const;

export async function renderBrandAssets(): Promise<Map<string, string | Buffer>> {
  const master = await readFile(new URL('mascot.svg', source), 'utf8');
  // IDs belong to the standalone master. Remove them when composing multiple mascots.
  const geometry = master
    .replace(/^.*?<\/desc>/s, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/ id="[^"]*"/g, '');
  // Fit the approved 240-unit drawing to the existing 148 × 120 layout slot.
  const mascot = `<g transform="translate(-1 -18) scale(.65)">${geometry}</g>`;
  // Build the approved warm-paper dark-surface keyline from the same body/feet.
  const body = master.match(/<g id="body"><path fill="[^"]*" d="([^"]+)"/)?.[1];
  const feet = [...master.matchAll(/<path id="foot-(?:left|right)" d="([^"]+)"/g)].map(
    (match) => match[1]
  );
  if (!body || feet.length !== 2) {
    throw new Error('Master mascot is missing its body or feet.');
  }
  const keyline = `<g stroke="#faf7ee" stroke-width="13" stroke-linejoin="round" fill="none"><path d="${body}"/><path d="${feet.join('')}"/></g>`;
  const darkMascot = `<g transform="translate(-1 -18) scale(.65)">${keyline}${geometry}</g>`;
  const assets = new Map<string, string | Buffer>();
  for (const name of brandNames) {
    const svg =
      name === 'favicon'
        ? await readFile(new URL('icon.svg', source), 'utf8')
        : (
            await readFile(
              new URL(`layouts/${name === 'mark-dark' ? 'mark' : name}.svg`, source),
              'utf8'
            )
          ).replaceAll('<!-- mascot -->', name.endsWith('-dark') ? darkMascot : mascot);
    assets.set(`${name}.svg`, svg.trim() + '\n');
  }
  const social = assets.get('social.svg');
  if (!social) {
    throw new Error('Missing social card source.');
  }
  assets.set(
    'social.png',
    new Resvg(social, {
      fitTo: { mode: 'width', value: 1200 },
      font: { loadSystemFonts: false },
    })
      .render()
      .asPng()
  );
  return assets;
}

// Importing this module for verification must not rewrite checked-in files.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('../assets/brand/', import.meta.url);
  const check = process.argv.includes('--check');
  for (const [name, contents] of await renderBrandAssets()) {
    const target = new URL(name, root);
    if (check) {
      const existing = await readFile(target);
      if (!existing.equals(Buffer.from(contents))) {
        throw new Error(`${name} is stale. Run pnpm brand:render.`);
      }
    } else {
      await writeFile(target, contents);
    }
  }
  console.log(
    check ? 'Brand assets are current.' : 'Rendered brand SVGs and social.png (1200 × 630).'
  );
}

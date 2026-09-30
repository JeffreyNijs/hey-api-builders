/** Raster exports come from the checked-in vector artwork; this never touches package output. */
import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const root = new URL('../assets/brand/', import.meta.url);
const source = await readFile(new URL('social.svg', root), 'utf8');
const renderer = new Resvg(source, {
  fitTo: { mode: 'width', value: 1200 },
  font: { defaultFontFamily: 'Arial', loadSystemFonts: true },
});
await writeFile(new URL('social.png', root), renderer.render().asPng());
console.log('Rendered assets/brand/social.png (1200 × 630) from social.svg.');

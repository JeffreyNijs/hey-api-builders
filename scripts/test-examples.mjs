/** Execute the checked-in example against real, isolated package tarballs. */
import { execFileSync } from 'node:child_process';
import { cp } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { withPackedConsumer } from './packed-consumer.mjs';
const fixture = fileURLToPath(new URL('../examples/', import.meta.url));
await withPackedConsumer(fixture, async ({ temporary }) => {
  await cp(new URL('../examples/shop.mjs', import.meta.url), `${temporary}/shop.mjs`);
  await cp(new URL('../examples/shop.test.mjs', import.meta.url), `${temporary}/shop.test.mjs`);
  execFileSync(process.execPath, ['--test', 'shop.test.mjs'], {
    cwd: temporary,
    stdio: 'inherit',
    timeout: 30_000,
  });
});

/** Run every checked-in optional compatibility fixture; new packages cannot escape CI wiring. */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = readdirSync(join(root, 'tests/compatibility'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'typebox')
  .map((entry) => entry.name)
  .sort();
for (const fixture of fixtures) {
  if (!/^[a-z0-9-]+$/.test(fixture)) throw new Error('Invalid compatibility fixture directory');
  execFileSync(process.execPath, [join(root, 'scripts/test-optional.mjs'), fixture], {
    cwd: root,
    stdio: 'inherit',
    timeout: 300_000,
  });
}

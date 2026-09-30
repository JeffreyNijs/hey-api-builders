/** Browser acceptance runs against installed npm tarballs, not source aliases. */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withPackedConsumer } from './packed-consumer.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some((arg) => !['--install', '--list'].includes(arg))) {
  throw new Error('Usage: node scripts/test-browser.mjs [--install] [--list]');
}
const fixture = join(root, 'tests/browser');
await withPackedConsumer(fixture, async ({ temporary }) => {
  for (const file of await readdir(fixture)) {
    if (
      [
        'node_modules',
        'package.json',
        'package-lock.json',
        'playwright-report',
        'test-results',
      ].includes(file)
    )
      continue;
    await cp(join(fixture, file), join(temporary, file), { recursive: true });
  }
  const cli = join(temporary, 'node_modules/@playwright/test/cli.js');
  try {
    if (args.includes('--install')) {
      execFileSync(
        process.execPath,
        [cli, 'install', '--with-deps', 'chromium', 'firefox', 'webkit'],
        {
          cwd: temporary,
          stdio: 'inherit',
          timeout: 600_000,
        }
      );
    }
    execFileSync(process.execPath, [cli, 'test', ...(args.includes('--list') ? ['--list'] : [])], {
      cwd: temporary,
      stdio: 'inherit',
      timeout: 900_000,
    });
  } finally {
    const result = join(root, 'test-results/browser');
    await mkdir(result, { recursive: true });
    for (const folder of ['playwright-report', 'test-results']) {
      if (existsSync(join(temporary, folder))) {
        await cp(join(temporary, folder), join(result, folder), { recursive: true });
      }
    }
  }
});

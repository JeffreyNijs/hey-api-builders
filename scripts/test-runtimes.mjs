/** Exercise a packed dependency-free core in the selected runtime, without workspace imports. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = process.argv[2] ?? 'node';
if (!['node', 'bun', 'deno'].includes(runtime) || process.argv.length > 3)
  throw new Error('Usage: node scripts/test-runtimes.mjs [node|bun|deno]');
const npm = [
  join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
].find(existsSync);
if (!npm) throw new Error('Cannot locate npm');
const temporary = await mkdtemp(join(tmpdir(), 'toolkit-runtime-'));
try {
  const [packed] = JSON.parse(
    execFileSync(
      process.execPath,
      [
        npm,
        'pack',
        join(root, 'packages/core'),
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        temporary,
      ],
      { encoding: 'utf8', cwd: temporary, timeout: 30_000 }
    )
  );
  await mkdir(join(temporary, 'core'));
  execFileSync('tar', [
    '-xzf',
    join(temporary, packed.filename),
    '--strip-components=1',
    '-C',
    join(temporary, 'core'),
  ]);
  await cp(join(root, 'tests/runtimes/contract.mjs'), join(temporary, 'contract.mjs'));
  const executable = runtime === 'node' ? process.execPath : runtime;
  const args =
    runtime === 'deno'
      ? ['run', '--no-config', '--no-lock', '--cached-only', 'contract.mjs']
      : ['contract.mjs'];
  execFileSync(executable, ['--version'], { stdio: 'inherit', timeout: 10_000 });
  // Deno receives no filesystem, environment, subprocess or network API permissions.
  execFileSync(executable, args, { cwd: temporary, stdio: 'inherit', timeout: 30_000 });
} finally {
  await rm(temporary, { recursive: true, force: true });
}

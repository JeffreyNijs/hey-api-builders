/** Preserve the audit's status while saving its output; a logging pipe must not turn failure green. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cli = process.env.npm_execpath;
if (!cli) {
  throw new Error('Run the production audit through pnpm audit:production');
}
const result = spawnSync(
  process.execPath,
  [cli, 'audit', '--prod', '--audit-level=high', '--json'],
  { encoding: 'utf8', timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
);
const directory = join(process.cwd(), 'test-results', 'audit');
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, 'advisories.json'), result.stdout ?? '');
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) {
  console.error(result.error.message);
}
process.exitCode = result.error || result.signal ? 1 : (result.status ?? 1);

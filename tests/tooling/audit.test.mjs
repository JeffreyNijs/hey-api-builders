import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { it } from 'node:test';

const script = fileURLToPath(new URL('../../scripts/audit-production.ts', import.meta.url));
for (const code of [0, 7, 3]) {
  it(`retains audit exit ${code} and its report instead of the logger's success`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'toolkit-audit-'));
    try {
      const cli = join(directory, 'package-manager.cjs');
      await writeFile(
        cli,
        `console.log(JSON.stringify({ arguments: process.argv.slice(2), status: ${code} })); process.exitCode = ${code};`
      );
      const result = spawnSync(process.execPath, [script], {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, npm_execpath: cli },
      });
      assert.equal(result.status, code, result.stderr);
      const report = JSON.parse(
        await readFile(join(directory, 'test-results/audit/advisories.json'), 'utf8')
      );
      assert.deepEqual(report, {
        arguments: ['audit', '--prod', '--audit-level=high', '--json'],
        status: code,
      });
      assert.deepEqual(JSON.parse(result.stdout), report);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
it('fails when the audit process cannot run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'toolkit-audit-'));
  try {
    const result = spawnSync(process.execPath, [script], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: join(directory, 'missing.cjs') },
    });
    assert.notEqual(result.status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('uses the same status-preserving gate for PR and release validation', async () => {
  for (const name of ['ci', 'npm-publish']) {
    const workflow = await readFile(
      new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
      'utf8'
    );
    assert.match(workflow, /run: pnpm audit:production/);
    assert.doesNotMatch(workflow, /audit[^\n]*\|/);
  }
});

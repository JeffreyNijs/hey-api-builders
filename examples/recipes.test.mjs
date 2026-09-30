import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { admin } from './compiled/hero.js';
import { code } from './compiled/factory.js';
import { shop } from './compiled/scenario.js';
import { first, again } from './compiled/replay.js';
import { report } from './compiled/shrinking.js';
import { files } from './compiled/codegen.js';

test('the landing-page example builds the advertised validated fixture', () => {
  assert.deepEqual(admin, { id: 'user-1', role: 'admin' });
});
test('a custom factory satisfies a native refinement', () => assert.equal(code, 'APP-42'));
test('the documented scenario preserves foreign keys and totals', () => {
  assert.equal(shop.order.customerId, shop.customer.id);
  assert.equal(shop.order.totalCents, 3000);
});
test('the documented snapshot reproduces the next operation', () => assert.deepEqual(first, again));
test('the documented shrinking recipe retains its dependent total', () => {
  assert.equal(report.details.failed, true);
  assert.ok(report.details.numShrinks > 0);
  assert.deepEqual(report.details.counterexample, [{ prices: [5], total: 5 }]);
});
test('the generated API uses Mimlet imports and named fluent methods', () => {
  assert.match(files[0].content, /from "@mimlet\/core"/);
  assert.match(files[0].content, /withId\(/);
  assert.match(files[0].content, /withRole\(/);
});
test('installed codegen exposes the renamed executable', async () => {
  const metadata = JSON.parse(await readFile('node_modules/@mimlet/codegen/package.json', 'utf8'));
  assert.deepEqual(metadata.bin, { mimlet: './dist/cli.js' });
  const result = spawnSync(
    process.execPath,
    ['node_modules/@mimlet/codegen/dist/cli.js', '--help'],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^mimlet --config/);
});

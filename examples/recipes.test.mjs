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
import { input as zodInput, user as zodUser } from './compiled/zod.js';
import { input as arkInput, user as arkUser } from './compiled/arktype.js';
import { input as fluentInput, output as fluentOutput, asynchronous } from './compiled/fluent.js';
import { runScenarioDemo, replayScenarioDemo } from './compiled/scenario-demo.js';

test('named fluent setters retain encoded input, native output and async behavior', () => {
  assert.deepEqual(fluentInput, { name: 'Ada', age: '42' });
  assert.deepEqual(fluentOutput, { name: 'Ada', age: 42 });
  assert.deepEqual(asynchronous, { name: 'Grace', age: 24 });
});
test('the interactive demo uses genuine shrinking and compatible replay with coherent relationships', () => {
  for (const seed of [12345, 1, 42, 100]) {
    const result = runScenarioDemo(seed, 40);
    assert.equal(result.failed, true);
    assert(result.shrinks > 0);
    assert.deepEqual(result, runScenarioDemo(seed, 40));
    for (const order of [result.first, result.shrunk]) {
      assert.equal(order.order.customerId, order.customer.id);
      assert(order.lines.every((line) => line.orderId === order.order.id));
      assert.equal(
        order.order.totalCents,
        order.lines.reduce((total, line) => total + line.priceCents, 0)
      );
      assert(order.order.totalCents > 40);
      assert(order.prices.length >= 1 && order.prices.length <= 6);
      assert(order.prices.every((price) => Number.isInteger(price) && price >= 1 && price <= 100));
    }
    assert.deepEqual(replayScenarioDemo(JSON.parse(JSON.stringify(result.replay))), result.shrunk);
    assert(result.shrunk.order.totalCents <= result.first.order.totalCents);
    assert.throws(() => replayScenarioDemo({ ...result.replay, budgetCents: 41 }), /identity/);
  }
  for (const input of [
    null,
    {},
    { format: 'mimlet/scenario-demo', version: 2 },
    { format: 'mimlet/scenario-demo', version: 1, budgetCents: 0, replay: {} },
  ])
    assert.throws(() => replayScenarioDemo(input));
  assert.throws(() => runScenarioDemo(1.5, 40), /seed/);
  assert.throws(() => runScenarioDemo(1, 201), /budget/);
});

test('dedicated Zod and ArkType recipes preserve encoded and decoded values', () => {
  for (const [input, output] of [
    [zodInput, zodUser],
    [arkInput, arkUser],
  ]) {
    assert.deepEqual(input, { name: 'Ada', age: '42' });
    assert.deepEqual(output, { name: 'Ada', age: 42 });
  }
});

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

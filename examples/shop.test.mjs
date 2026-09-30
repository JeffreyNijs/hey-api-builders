import assert from 'node:assert/strict';
import { test } from 'node:test';
import { provider, users, checkout, loadStory, respondOrder, persistOrders } from './shop.mjs';
import { restoreSession, captureFixture, restoreFixture } from '@jeffreynijs/test-builders';

test('native codecs and realistic correlated fixtures reproduce a saved batch', () => {
  const session = provider.session(42),
    before = session.snapshot();
  const values = checkout.buildList(5, session);
  assert.deepEqual(checkout.buildList(5, restoreSession(before, provider.identity)), values);
  for (const { customer, order, lines } of values) {
    assert(customer.joined instanceof Date);
    assert.equal(order.customerId, customer.id);
    assert.equal(order.lines, lines);
    assert.equal(
      order.totalCents,
      lines.reduce((sum, x) => sum + x.quantity * x.priceCents, 0)
    );
  }
  assert.deepEqual(restoreFixture(captureFixture(values)), values);
});
test('scenario overrides recompute relationships instead of leaving stale foreign keys', () => {
  const changed = checkout
    .override('customer', (s) => users.with({ id: 'fixed', name: 'Ada' }).buildValidated(s))
    .override('lines', () => [{ sku: 'TEE', priceCents: 2500, quantity: 2 }]);
  const fixture = changed.build(provider.session(42));
  assert.equal(fixture.order.customerId, 'fixed');
  assert.equal(fixture.order.totalCents, 5000);
  assert.notEqual(checkout.build(provider.session(42)).order.customerId, 'fixed');
});
test('previews and HTTP handlers consume the same deterministic recipe', async () => {
  const a = await loadStory({ id: 'one' }),
    b = await loadStory({ id: 'one' });
  assert.deepEqual(a, b);
  a.checkout.lines.push({ sku: 'other', quantity: 1, priceCents: 1 });
  assert.notDeepEqual(a, b);
  const response = await respondOrder(
    new globalThis.Request('https://example.invalid/orders?id=one')
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), b.checkout.order);
});
test('persistence receives a bounded complete batch once and propagates sink rejection', async () => {
  let calls = 0;
  const written = await persistOrders(3, (values) => {
    calls++;
    return values.map((v) => v.totalCents);
  });
  assert.equal(calls, 1);
  assert.equal(written.length, 3);
  const failure = new Error('rollback by caller');
  await assert.rejects(
    persistOrders(2, () => {
      throw failure;
    }),
    (e) => e === failure
  );
  await assert.rejects(
    persistOrders(101, () => assert.fail('must not write')),
    RangeError
  );
});

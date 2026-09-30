/* global Request, AbortController */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fixtureLoader,
  jsonResponseResolver,
  persistFixtureBatch,
} from '@jeffreynijs/test-builders-consumers';
import { createBuilder, createSchemaBuilder, createSession } from '@jeffreynijs/test-builders';
const request = () => new Request('https://example.invalid/test');
const reject = () => {
  throw new Error('must not run');
};
const aborted = () => {
  const c = new AbortController();
  c.abort(new Error('cancelled'));
  return c;
};

describe('explicit fixture consumers', () => {
  it('loads isolated story fixtures without mutating the context or shared source', async () => {
    const shared = { values: [1] },
      context = { id: 'story-one' };
    const load = fixtureLoader('user', function (c) {
      assert.equal(this, undefined);
      assert.equal(c, context);
      return shared;
    });
    const a = await load(context),
      b = await load(context);
    a.user.values.push(2);
    assert.deepEqual(b.user, shared);
    assert.deepEqual(context, { id: 'story-one' });
    assert.notEqual(a.user, shared);
  });
  it('handles prototype-like loader keys safely and supports explicit native clones', async () => {
    class Model {
      constructor(x) {
        this.x = x;
      }
    }
    const load = fixtureLoader('__proto__', async () => new Model(2), {
      clone: (value) => new Model(value.x),
    });
    const value = await load({});
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(Object.hasOwn(value, '__proto__'), true);
    assert.equal(value.__proto__.x, 2);
    assert.equal({}.x, undefined);
  });
  it('propagates loader cancellation both before and after asynchronous generation', async () => {
    const controller = aborted();
    await assert.rejects(
      fixtureLoader('v', reject, { signal: controller.signal })({}),
      /cancelled/
    );
    const c = new AbortController();
    await assert.rejects(
      fixtureLoader(
        'v',
        async () => {
          c.abort();
          return 1;
        },
        { signal: c.signal }
      )({}),
      /abort/i
    );
  });
  it('rejects invalid loader configuration and asynchronous clone hooks', async () => {
    assert.throws(() => fixtureLoader('', () => 1), /key/);
    assert.throws(() => fixtureLoader(1, () => 1), /key/);
    assert.throws(() => fixtureLoader('x', 1), /functions/);
    assert.throws(() => fixtureLoader('x', () => 1, { clone: 1 }), /functions/);
    await assert.rejects(
      fixtureLoader('x', () => 1, { clone: () => Promise.reject(new Error('bad clone')) })({}),
      /synchronous/
    );
    assert.equal((await fixtureLoader('x', () => null)({})).x, null);
    const f = () => 1;
    assert.equal((await fixtureLoader('x', () => f, { clone: (v) => v })({})).x, f);
  });
  it('returns fresh JSON Responses from validated builders and preserves request context', async () => {
    const headers = { 'x-fixture': 'yes' };
    const resolver = jsonResponseResolver(
      function (r) {
        assert.equal(this, undefined);
        return { method: r.method, ok: true };
      },
      { status: 201, headers }
    );
    headers['x-fixture'] = 'mutated';
    const a = await resolver(request()),
      b = await resolver(request());
    assert.notEqual(a, b);
    assert.equal(a.status, 201);
    assert.equal(
      await (await resolver(new Request('https://example.invalid', { method: 'HEAD' }))).text(),
      ''
    );
    assert.equal(a.headers.get('x-fixture'), 'yes');
    assert.match(a.headers.get('content-type'), /^application\/json/);
    assert.deepEqual(await a.json(), { method: 'GET', ok: true });
    assert.deepEqual(await b.json(), { method: 'GET', ok: true });
    const model = createSchemaBuilder(
      {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (v) => ({ value: { age: Number(v.age) } }),
        },
      },
      () => ({ age: '42' })
    );
    assert.deepEqual(
      await (await jsonResponseResolver(() => model.buildValidated())(request())).json(),
      { age: 42 }
    );
  });
  it('uses native request aborts and never repairs JSON serialization failures', async () => {
    const c = aborted();
    await assert.rejects(
      jsonResponseResolver(reject)(new Request('https://example.invalid', { signal: c.signal })),
      /cancelled/
    );
    const pending = new AbortController();
    await assert.rejects(
      jsonResponseResolver(async () => {
        pending.abort();
        return 1;
      })(new Request('https://example.invalid', { signal: pending.signal })),
      /abort/i
    );
    await assert.rejects(jsonResponseResolver(() => undefined)(request()), /JSON response/);
    await assert.rejects(jsonResponseResolver(() => 1n)(request()), /BigInt/i);
    const cyclic = {};
    cyclic.self = cyclic;
    await assert.rejects(jsonResponseResolver(() => cyclic)(request()), /circular/i);
    const failure = new Error('validation failed');
    await assert.rejects(
      jsonResponseResolver(() => {
        throw failure;
      })(request()),
      (e) => e === failure
    );
  });
  it('bounds response bytes rather than UTF-16 length and validates HTTP configuration', async () => {
    const value = 'é';
    assert.equal(
      await (await jsonResponseResolver(() => value, { maxBodyBytes: 4 })(request())).json(),
      value
    );
    await assert.rejects(
      jsonResponseResolver(() => value, { maxBodyBytes: 3 })(request()),
      /maxBodyBytes/
    );
    await assert.rejects(
      jsonResponseResolver(() => null, { maxBodyBytes: 0 })(request()),
      /maxBodyBytes/
    );
    for (const status of [199, 600, 204, 205, 304, 200.5, NaN])
      assert.throws(() => jsonResponseResolver(() => 1, { status }), /status/);
    for (const maxBodyBytes of [-1, 0.1, Infinity])
      assert.throws(() => jsonResponseResolver(() => 1, { maxBodyBytes }), /budgets/);
    assert.throws(() => jsonResponseResolver(1), /functions/);
  });
  it('prepares a complete sequential isolated batch before one transactional handoff', async () => {
    const events = [],
      context = { session: createSession({ seed: 42, fingerprint: 'sink', provider: 'test' }) };
    const b = createBuilder((s) => ({ id: s.sequence('id', 1) }));
    const result = await persistFixtureBatch(
      3,
      async function (index, ctx) {
        assert.equal(this, undefined);
        assert.equal(ctx, context);
        events.push(`start${index}`);
        await Promise.resolve();
        events.push(`end${index}`);
        return b.build(ctx.session);
      },
      async function (values, ctx, signal) {
        assert.equal(this, undefined);
        assert.equal(ctx, context);
        assert.equal(signal, undefined);
        assert.equal(Object.isFrozen(values), true);
        events.push('persist');
        return values.map((v) => v.id);
      },
      context
    );
    assert.deepEqual(result, [1, 2, 3]);
    assert.deepEqual(events, ['start0', 'end0', 'start1', 'end1', 'start2', 'end2', 'persist']);
  });
  it('does not call the sink when generation, cloning or pre-handoff cancellation fails', async () => {
    const failure = new Error('invalid fixture');
    await assert.rejects(
      persistFixtureBatch(
        3,
        (index) => {
          if (index === 1) throw failure;
          return index;
        },
        reject,
        {}
      ),
      (e) => e === failure
    );
    await assert.rejects(
      persistFixtureBatch(
        1,
        () => 1,
        reject,
        {},
        {
          clone: () => {
            throw failure;
          },
        }
      ),
      (e) => e === failure
    );
    await assert.rejects(
      persistFixtureBatch(1, reject, reject, {}, { signal: aborted().signal }),
      /cancelled/
    );
    const c = new AbortController();
    await assert.rejects(
      persistFixtureBatch(
        1,
        () => {
          c.abort();
          return 1;
        },
        reject,
        {},
        { signal: c.signal }
      ),
      /abort/i
    );
  });
  it('hands cancellation during persistence to the sink and never claims rollback', async () => {
    const c = new AbortController();
    const result = await persistFixtureBatch(
      1,
      () => ({ x: 1 }),
      async (values, ctx, signal) => {
        assert.equal(signal, c.signal);
        c.abort();
        return { written: values.length };
      },
      {},
      { signal: c.signal }
    );
    assert.deepEqual(result, { written: 1 });
    const failure = new Error('transaction rejected');
    await assert.rejects(
      persistFixtureBatch(
        1,
        () => 1,
        () => {
          throw failure;
        },
        {}
      ),
      (e) => e === failure
    );
  });
  it('validates batch budgets and explicitly passes empty batches once', async () => {
    assert.equal(await persistFixtureBatch(0, reject, (v) => v.length, {}, { maxItems: 0 }), 0);
    for (const count of [-1, 0.1, NaN, Infinity, 1001])
      await assert.rejects(persistFixtureBatch(count, reject, reject, {}), RangeError);
    await assert.rejects(persistFixtureBatch(1, reject, reject, {}, { maxItems: -1 }), RangeError);
    await assert.rejects(persistFixtureBatch(1, 1, reject, {}), /functions/);
    await assert.rejects(persistFixtureBatch(1, reject, 1, {}), /functions/);
    const shared = { x: 1 };
    const result = await persistFixtureBatch(
      2,
      () => shared,
      (v) => v,
      {}
    );
    assert.notEqual(result[0], result[1]);
  });
});

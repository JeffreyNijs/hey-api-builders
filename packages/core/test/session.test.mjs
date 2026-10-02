import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers';
import {
  createSession,
  restoreSession,
  createBuilder,
  createSchemaBuilder,
  SessionBudgetError,
  SessionReplayError,
} from '../dist/index.js';
const identity = {
  fingerprint: 'orders/v1',
  provider: 'test-provider@1',
  configuration: 'minimal',
};
const options = { ...identity, seed: 'stable' };
const make = (extra = {}) => createSession({ ...options, ...extra });

describe('reproducible execution sessions', () => {
  it('matches the independent SplitMix64/FNV golden vector', () => {
    const s = make();
    assert.deepEqual(
      Array.from({ length: 5 }, () => s.random()),
      [
        0.48643830687101985, 0.1347603098201583, 0.3499756977164171, 0.44587275852696207,
        0.5847862555423541,
      ]
    );
    s.scope('b').random();
    s.scope('a').random();
    const snapshot = s.snapshot();
    assert.deepEqual(
      snapshot.streams.map(([key]) => key),
      [...snapshot.streams.map(([key]) => key)].sort()
    );
  });
  it('repeats streams without a global RNG or clock', () => {
    const a = make();
    const b = make();
    const x = Array.from({ length: 50 }, () => a.random());
    assert.deepEqual(
      x,
      Array.from({ length: 50 }, () => b.random())
    );
    assert(x.every((n) => n >= 0 && n < 1));
    assert.notEqual(make({ seed: 'other' }).random(), x[0]);
    assert.notEqual(make({ seed: 1 }).random(), make({ seed: '1' }).random());
    assert.notEqual(make({ seed: -0 }).random(), make({ seed: 0 }).random());
    assert.notEqual(make({ seed: '🐈' }).random(), make({ seed: '🐕' }).random());
  });
  it('preserves negative zero and typed scope keys through JSON replay', () => {
    const s = make({ seed: -0 }).scope(-0);
    s.random();
    const resumed = restoreSession(JSON.parse(JSON.stringify(s.snapshot())), identity);
    assert.equal(s.random(), resumed.random());
  });
  it('keeps named streams independent of unrelated generation', () => {
    const a = make();
    const b = make();
    assert.equal(a.scope('user').random(), b.scope('user').random());
    for (let i = 0; i < 100; i++) a.scope('unrelated').random();
    assert.equal(a.scope('user').random(), b.scope('user').random());
    assert.notEqual(a.scope('a/b').random(), b.scope('a', 'b').random());
    assert.notEqual(a.scope(1).random(), b.scope('1').random());
    assert.equal(a.scope().random(), b.scope().random());
  });
  it('supports integer endpoints and the complete safe integer range', () => {
    const s = make();
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(s.integer(-2, 2));
    assert.deepEqual([...seen].sort(), [-1, -2, 0, 1, 2]);
    assert.equal(s.integer(7, 7), 7);
    for (let i = 0; i < 100; i++) {
      const n = s.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      assert(Number.isSafeInteger(n));
    }
    for (const bounds of [
      [2, 1],
      [0.5, 2],
      [0, Infinity],
      [NaN, 0],
    ]) {
      assert.throws(() => s.integer(...bounds), RangeError);
    }
  });
  it('provides boolean and dense-array selection with explicit boundaries', () => {
    const s = make();
    assert.equal(s.boolean(0), false);
    assert.equal(s.boolean(1), true);
    assert.equal(typeof s.boolean(), 'boolean');
    assert.equal(s.pick(['only']), 'only');
    assert.equal(s.pick([undefined]), undefined);
    for (const p of [-1, 2, NaN]) assert.throws(() => s.boolean(p), RangeError);
    assert.throws(() => s.pick([]), RangeError);
    assert.throws(() => s.pick(null), RangeError);
    assert.throws(() => s.pick(new Array(1)), /sparse/);
  });
  it('generates scoped sequences and rejects configuration changes or overflow', () => {
    const s = make();
    assert.equal(s.sequence('id'), 0);
    assert.equal(s.sequence('id'), 1);
    assert.equal(s.scope('other').sequence('id'), 0);
    assert.equal(s.sequence('down', 10, -2), 10);
    assert.equal(s.sequence('down', 10, -2), 8);
    assert.throws(() => s.sequence('down', 0, -2), /cannot change/);
    assert.throws(() => s.sequence('x', 0, 0), RangeError);
    assert.equal(s.sequence('top', Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    assert.throws(() => s.sequence('top', Number.MAX_SAFE_INTEGER), /safe integer range/);
  });
  it('checks identity on replay and resumes all state after a JSON round-trip', () => {
    const first = make();
    const scoped = first.scope('orders');
    scoped.random();
    scoped.sequence('id', 10);
    scoped.unique('code', () => 'A');
    const snapshot = JSON.parse(JSON.stringify(scoped.snapshot()));
    const resumed = restoreSession(snapshot, identity);
    assert.equal(resumed.random(), scoped.random());
    assert.equal(resumed.sequence('id', 10), scoped.sequence('id', 10));
    assert.throws(() => resumed.unique('code', () => 'A', { attempts: 2 }), SessionBudgetError);
    assert.throws(
      () => restoreSession(snapshot, { ...identity, fingerprint: 'v2' }),
      SessionReplayError
    );
    assert.throws(
      () => restoreSession(snapshot, { ...identity, provider: 'v2' }),
      SessionReplayError
    );
    assert.throws(
      () => restoreSession(snapshot, { ...identity, configuration: 'other' }),
      SessionReplayError
    );
    assert.throws(
      () => restoreSession(snapshot, { ...identity, configuration: undefined }),
      SessionReplayError
    );
  });
  it('isolates snapshots, restored state, and reference dates', () => {
    const s = make({ configuration: undefined });
    const snapshot = s.snapshot();
    const expected = { fingerprint: identity.fingerprint, provider: identity.provider };
    assert.equal(restoreSession(snapshot, expected).random(), s.random());
    snapshot.settings.seedToken = 's7:changed';
    assert.notEqual(restoreSession(snapshot, expected).random(), make().random());
    const date = s.referenceDate();
    date.setFullYear(2099);
    assert.equal(s.referenceDate().toISOString(), '2000-01-01T00:00:00.000Z');
    const custom = make({ referenceTime: '2026-09-29T00:00:00.000Z' });
    assert.equal(custom.referenceDate().toISOString(), '2026-09-29T00:00:00.000Z');
  });
  it('supports primitive uniqueness and explicit keys for object identities', () => {
    const s = make();
    for (const value of [null, undefined, false, true, 2n, 1, '1', -0, 0, NaN]) {
      assert.equal(
        s.unique('all', () => value),
        value
      );
    }
    const a = { id: 'A' };
    assert.equal(
      s.unique('objects', () => a, { keyOf: (v) => v.id }),
      a
    );
    assert.throws(
      () => s.unique('objects', () => ({ id: 'A' }), { keyOf: (v) => v.id, attempts: 2 }),
      SessionBudgetError
    );
    assert.throws(() => s.unique('unkeyed', () => ({})), /keyOf/);
    let n = 0;
    assert.equal(
      s.unique('codes', () => 'first'),
      'first'
    );
    assert.equal(
      s.unique('codes', () => (++n < 3 ? 'first' : 'second')),
      'second'
    );
    assert.equal(
      s.scope('another').unique('codes', () => 'first'),
      'first'
    );
  });
  it('bounds operations, keys, unique values, and attempts', () => {
    const s = make({ maxOperations: 1 });
    s.random();
    assert.throws(() => s.random(), SessionBudgetError);
    assert.throws(() => make({ maxKeys: 0 }).random(), SessionBudgetError);
    assert.throws(() => make({ maxKeys: 0 }).sequence('id'), SessionBudgetError);
    assert.throws(() => make({ maxKeys: 0 }).unique('id', () => 1), SessionBudgetError);
    assert.throws(() => make({ maxUniqueValues: 0 }).unique('id', () => 1), SessionBudgetError);
    for (const attempts of [0, 101, -1, 1.5, NaN]) {
      assert.throws(() => make().unique('id', () => 1, { attempts }), RangeError);
    }
    assert.throws(() => make().unique('id', null), /callable/);
    assert.throws(() => make().unique('id', () => 1, { keyOf: false }), /callable/);
  });
  it('observes accidental asynchronous uniqueness failures', async () => {
    assert.throws(
      () => make().unique('x', () => Promise.reject(new Error('observed'))),
      /synchronous/
    );
    await new Promise((resolve) => setImmediate(resolve));
  });
  it('rejects ambiguous keys, clocks, identities, and budgets', () => {
    for (const seed of [null, {}, Infinity, 'x'.repeat(4097)])
      assert.throws(() => make({ seed }), TypeError);
    for (const name of [null, {}, Infinity]) assert.throws(() => make().scope(name), TypeError);
    assert.throws(() => make().scope(...Array(65).fill('x')), RangeError);
    for (const config of [
      { fingerprint: '' },
      { provider: '' },
      { configuration: 1 },
      { referenceTime: 'yesterday' },
      { referenceTime: '2026-01-01' },
      { maxOperations: -1 },
      { maxKeys: 1.5 },
      { maxAttempts: Infinity },
    ]) {
      assert.throws(() => make(config));
    }
  });
  it('rejects malformed or budget-inconsistent replay state', () => {
    const baseline = make().snapshot();
    const invalid = [
      null,
      { ...baseline, version: 2 },
      { ...baseline, algorithm: 'future' },
      { ...baseline, scope: null },
      { ...baseline, scope: ['s2:x'] },
      { ...baseline, scope: ['invalid'] },
      { ...baseline, settings: { ...baseline.settings, seedToken: 42 } },
      { ...baseline, scope: Array(65).fill('x') },
      { ...baseline, operations: -1 },
      { ...baseline, operations: 2_000_000 },
      { ...baseline, streams: null },
      { ...baseline, sequences: null },
      { ...baseline, unique: null },
      { ...baseline, streams: [['x', -1]] },
      { ...baseline, streams: [['x', 1]] },
      {
        ...baseline,
        streams: [
          ['x', 0],
          ['x', 0],
        ],
      },
      { ...baseline, streams: [[2, 0]] },
      { ...baseline, streams: [['x']] },
      { ...baseline, streams: [['x'.repeat(300001), 0]] },
      { ...baseline, sequences: [['x', { start: 0, step: 0, index: 0 }]] },
      { ...baseline, sequences: [['x', null]] },
      { ...baseline, unique: [['x', [1]]] },
      { ...baseline, unique: [['x', ['a', 'a']]] },
      { ...baseline, unique: [['x', ['a']]] },
      { ...baseline, unique: [['x', null]] },
      { ...baseline, settings: { ...baseline.settings, maxKeys: 0 }, streams: [['x', 0]] },
      {
        ...baseline,
        operations: 1,
        streams: [
          ['a', 1],
          ['b', 1],
        ],
      },
      {
        ...baseline,
        settings: { ...baseline.settings, maxUniqueValues: 0 },
        unique: [['x', ['a']]],
      },
    ];
    for (const item of invalid)
      assert.throws(() => restoreSession(item, identity), SessionReplayError);
  });
  it('copies sequence and uniqueness state instead of trusting mutable snapshots', () => {
    const s = make();
    s.sequence('x');
    s.unique('x', () => 1);
    const snapshot = s.snapshot();
    const restored = restoreSession(snapshot, identity);
    snapshot.sequences[0][1].index = 999;
    snapshot.unique[0][1].length = 0;
    assert.equal(restored.sequence('x'), 1);
    assert.throws(() => restored.unique('x', () => 1, { attempts: 1 }), SessionBudgetError);
  });
  it('integrates with existing builders through ordinary typed factory arguments', () => {
    const users = createBuilder((s) => ({
      id: s.sequence('id'),
      age: s.scope('age').integer(18, 80),
    }));
    assert.deepEqual(users.buildList(20, make()), users.buildList(20, make()));
  });
});

describe('default sessions', () => {
  const counted = () => {
    const created = [];
    const defaultSession = () => {
      const session = make();
      created.push(session);
      return session;
    };
    return { created, defaultSession };
  };
  const identityOf = (s) => (s === undefined ? 'missing' : s.snapshot().operations);
  const passthrough = {
    '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) },
  };

  it('draws successive session-less list items from one default session', () => {
    const { created, defaultSession } = counted();
    const users = createBuilder((s) => s?.integer(0, 1_000_000), { defaultSession });
    const list = users.buildList(5);
    assert.equal(created.length, 1);
    assert.equal(new Set(list).size, 5);
    assert.deepEqual(list, users.buildList(5, make()));
    assert.deepEqual(users.buildList(5), list);
    assert.equal(users.build(), list[0]);
    assert.equal(users.build(), list[0]);
    assert.equal(created.length, 4);
  });
  it('keeps session-less lists replayable from the default session', () => {
    const { defaultSession } = counted();
    const users = createBuilder((s) => ({ id: s.sequence('id', 1), age: s.integer(18, 80) }), {
      defaultSession,
    });
    const before = defaultSession().snapshot();
    const replay = restoreSession(JSON.parse(JSON.stringify(before)), identity);
    assert.deepEqual(users.buildList(3, replay), users.buildList(3));
    assert.deepEqual(
      users.buildList(3).map(({ id }) => id),
      [1, 2, 3]
    );
  });
  it('shares the default with operations and transforms, and never overrides an explicit session', () => {
    const { created, defaultSession } = counted();
    const seen = [];
    const builder = createBuilder((s, label) => ({ label, at: identityOf(s) }), { defaultSession })
      .withFactory((s) => ({ patched: identityOf(s) }))
      .transform((value, s, label) => {
        seen.push([s, label]);
        return value;
      });
    assert.deepEqual(builder.buildList(2, undefined, 'x'), [
      { label: 'x', at: 0, patched: 0 },
      { label: 'x', at: 0, patched: 0 },
    ]);
    assert.equal(created.length, 1);
    assert.ok(seen.every(([s, label]) => s === created[0] && label === 'x'));
    const explicit = make();
    builder.build(explicit, 'y');
    assert.equal(created.length, 1);
    assert.deepEqual(seen.at(-1), [explicit, 'y']);
  });
  it('creates no default session for empty or invalid lists', async () => {
    const { created, defaultSession } = counted();
    const builder = createSchemaBuilder(passthrough, (s) => s.random(), { defaultSession });
    assert.deepEqual(builder.buildList(0), []);
    assert.deepEqual(builder.buildValidatedList(0), []);
    assert.deepEqual(await builder.buildListAsync(0), []);
    assert.deepEqual(await builder.buildValidatedListAsync(0), []);
    assert.throws(() => builder.buildList(-1), RangeError);
    await assert.rejects(builder.buildValidatedListAsync(0.5), RangeError);
    assert.equal(created.length, 0);
  });
  it('applies the same default to validated and asynchronous builds', async () => {
    const { created, defaultSession } = counted();
    const builder = createSchemaBuilder(passthrough, async (s) => s.integer(0, 1_000_000), {
      defaultSession,
    });
    const expected = await builder.buildListAsync(4, make());
    assert.equal(new Set(expected).size, 4);
    assert.deepEqual(await builder.buildListAsync(4), expected);
    assert.deepEqual(await builder.buildValidatedListAsync(4), expected);
    assert.equal(await builder.buildAsync(), expected[0]);
    assert.equal(await builder.buildValidatedAsync(), expected[0]);
    const sync = createSchemaBuilder(passthrough, (s) => s.integer(0, 1_000_000), {
      defaultSession,
    });
    assert.deepEqual(sync.buildValidatedList(4), expected);
    assert.equal(sync.buildValidated(), expected[0]);
    assert.equal(created.length, 6);
  });
  it('rejects a non-callable default session and propagates default failures', async () => {
    assert.throws(
      () => createBuilder((s) => s, { defaultSession: make() }),
      /defaultSession requires a factory function/
    );
    const failure = new Error('no default');
    const builder = createBuilder(async (s) => s, {
      defaultSession: () => {
        throw failure;
      },
    });
    await assert.rejects(builder.buildAsync(), (error) => error === failure);
    await assert.rejects(builder.buildListAsync(1), (error) => error === failure);
  });
});

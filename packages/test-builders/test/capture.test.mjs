import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  captureFixture,
  restoreFixture,
  cloneFixture,
  fixtureValue,
  FixtureCaptureError,
  createBuilder,
  createSchemaBuilder,
} from '../dist/index.js';
const wrap = (root, nodes = []) =>
  JSON.stringify({ format: 'test-builders/fixture', version: 1, root, nodes });
const clone = (value, options) => restoreFixture(captureFixture(value, options), options);

describe('portable fixture capture and cloning', () => {
  it('round-trips primitives JSON alone cannot represent', () => {
    for (const value of [
      null,
      undefined,
      true,
      false,
      '',
      '🐱',
      -0,
      0,
      NaN,
      Infinity,
      -Infinity,
      42,
      -42.5,
      0n,
      9007199254740993n,
    ]) {
      assert(Object.is(clone(value), value));
    }
  });
  it('preserves cycles, graph aliases, holes, and null prototypes', () => {
    const user = { id: 'one' };
    const root = Object.create(null);
    root.user = user;
    root.sameUser = user;
    root.self = root;
    root.items = [user, undefined, undefined];
    delete root.items[1];
    root.items.extra = 'yes';
    root.items['4294967295'] = 'not-an-index';
    root['__proto__'] = { polluted: true };
    const out = clone(root);
    assert.equal(Object.getPrototypeOf(out), null);
    assert.equal(out.self, out);
    assert.equal(out.user, out.sameUser);
    assert.equal(out.items[0], out.user);
    assert.equal(out.items.length, 3);
    assert.equal(1 in out.items, false);
    assert.equal(2 in out.items, true);
    assert.equal(out.items.extra, 'yes');
    assert.equal(out.items['4294967295'], 'not-an-index');
    assert.equal({}.polluted, undefined);
    assert.notEqual(out.user, user);
  });
  it('restores maps and sets with their graph identities intact', () => {
    const key = { x: 1 };
    const map = new Map();
    const set = new Set([key, map]);
    map.set(key, set);
    map.set(map, map);
    const out = clone({ key, map, set });
    assert.equal(out.map.get(out.key), out.set);
    assert.equal(out.map.get(out.map), out.map);
    assert(out.set.has(out.key));
    assert(out.set.has(out.map));
  });
  it('preserves dates, invalid dates, and regexp state', () => {
    const regexp = /x+/giu;
    regexp.lastIndex = 3;
    const out = clone({ valid: new Date(1), invalid: new Date(NaN), regexp });
    assert.equal(out.valid.getTime(), 1);
    assert(Number.isNaN(out.invalid.getTime()));
    assert.equal(out.regexp.source, 'x+');
    assert.equal(out.regexp.flags, 'giu');
    assert.equal(out.regexp.lastIndex, 3);
  });
  it('preserves buffer aliasing, offsets, byte values, and native view types', () => {
    const buffer = new ArrayBuffer(64);
    new Uint8Array(buffer).set([1, 2, 3, 4, 5, 6]);
    const constructors = [
      Int8Array,
      Uint8Array,
      Uint8ClampedArray,
      Int16Array,
      Uint16Array,
      Int32Array,
      Uint32Array,
      Float32Array,
      Float64Array,
      BigInt64Array,
      BigUint64Array,
      DataView,
    ];
    const views = constructors.map((C) => new C(buffer, 8, 2));
    const out = clone({ buffer, views });
    assert.deepEqual([...new Uint8Array(out.buffer)], [...new Uint8Array(buffer)]);
    for (let i = 0; i < views.length; i++) {
      assert.equal(Object.getPrototypeOf(out.views[i]), constructors[i].prototype);
      assert.equal(out.views[i].buffer, out.buffer);
      assert.equal(out.views[i].byteOffset, 8);
      assert.equal(out.views[i].byteLength, views[i].byteLength);
    }
    assert.notEqual(out.buffer, buffer);
  });
  it('rejects unsupported values instead of evaluating accessors or discarding data', () => {
    let calls = 0;
    const getter = {
      get value() {
        calls++;
        return 1;
      },
    };
    const hidden = Object.defineProperty({}, 'x', { value: 1 });
    const date = new Date();
    date.extra = 1;
    const regexp = /a/;
    regexp.lastIndex = -1;
    class Model {
      x = 1;
    }
    class SpecialArray extends Array {}
    class SpecialView extends Uint8Array {}
    for (const value of [
      getter,
      hidden,
      date,
      regexp,
      new Model(),
      new SpecialArray(),
      new SpecialView(2),
      () => 1,
      Symbol('x'),
      { [Symbol('x')]: 1 },
      Promise.resolve(1),
      new WeakMap(),
      new Proxy({}, { ownKeys: () => ['changed'], getOwnPropertyDescriptor: () => undefined }),
    ]) {
      assert.throws(
        () => captureFixture(value),
        (e) => e instanceof FixtureCaptureError && e.code === 'UNSUPPORTED_FIXTURE'
      );
    }
    assert.equal(calls, 0);
  });
  it('enforces encoding and decoding resource limits', () => {
    const cases = [
      [{}, { maxNodes: 0 }],
      [1, { maxEntries: 0 }],
      [[1], { maxDepth: 0 }],
      [new Array(3), { maxEntries: 2 }],
      ['long', { maxCharacters: 2 }],
      [0, { maxCharacters: 2 }],
      [new ArrayBuffer(3), { maxBufferBytes: 2 }],
      [new Uint8Array(3), { maxBufferBytes: 2 }],
      [
        new Map([
          [1, 1],
          [2, 2],
        ]),
        { maxEntries: 1 },
      ],
      [new Set([1, 2]), { maxEntries: 1 }],
    ];
    for (const [value, options] of cases)
      assert.throws(
        () => captureFixture(value, options),
        (e) => e.code === 'CAPTURE_LIMIT'
      );
    assert.throws(
      () => restoreFixture(captureFixture({}), { maxNodes: 0 }),
      (e) => e.code === 'CAPTURE_LIMIT'
    );
    assert.throws(
      () => restoreFixture(captureFixture(1), { maxEntries: 0 }),
      (e) => e.code === 'CAPTURE_LIMIT'
    );
    assert.throws(
      () => restoreFixture(captureFixture(new Array(3)), { maxEntries: 2 }),
      (e) => e.code === 'CAPTURE_LIMIT'
    );
    assert.throws(
      () => restoreFixture(captureFixture(new ArrayBuffer(3)), { maxBufferBytes: 2 }),
      (e) => e.code === 'CAPTURE_LIMIT'
    );
    assert.throws(
      () => restoreFixture(captureFixture(1), { maxCharacters: 2 }),
      (e) => e.code === 'CAPTURE_LIMIT'
    );
    for (const options of [{ maxDepth: 257 }, { maxNodes: -1 }, { maxCharacters: NaN }])
      assert.throws(() => captureFixture(0, options), RangeError);
  });
  it('rejects malformed data and unknown constructors without evaluating code', () => {
    const invalid = [
      null,
      '{',
      'null',
      '{}',
      wrap(['ref', 1]),
      wrap([]),
      wrap(['null', 1, 2]),
      wrap(['number', '01']),
      wrap(['bigint', '01']),
      wrap(['boolean', 1]),
      wrap(['string', 1]),
      wrap(['unknown']),
      wrap('not-a-token'),
      wrap(['ref', 0], [null]),
      wrap(['ref', 0], [{ kind: 'Function', data: 'process.exit()' }]),
      wrap(['ref', 0], [{ kind: 'array', data: [1, [], 2] }]),
      wrap(['ref', 0], [{ kind: 'array', data: [-1, []] }]),
      wrap(['ref', 0], [{ kind: 'date', data: ['string', 'wrong'] }]),
      wrap(['ref', 0], [{ kind: 'regexp', data: ['(', 'g', 0] }]),
      wrap(['ref', 0], [{ kind: 'regexp', data: ['', 'g', -1] }]),
      wrap(['ref', 0], [{ kind: 'buffer', data: 'gg' }]),
      wrap(['ref', 0], [{ kind: 'buffer', data: 'a' }]),
      wrap(
        ['ref', 0],
        [
          { kind: 'view', data: ['constructor', ['ref', 1], 0, 1] },
          { kind: 'buffer', data: '00' },
        ]
      ),
      wrap(['ref', 0], [{ kind: 'view', data: ['Uint8Array', ['null'], 0, 1] }]),
      wrap(
        ['ref', 0],
        [
          { kind: 'view', data: ['Uint16Array', ['ref', 1], 0, 1] },
          { kind: 'buffer', data: '00' },
        ]
      ),
      wrap(
        ['ref', 0],
        [
          { kind: 'view', data: ['Uint8Array', ['ref', 1], 4, 1] },
          { kind: 'buffer', data: '00' },
        ]
      ),
      wrap(
        ['ref', 0],
        [
          {
            kind: 'object',
            data: [
              ['x', ['null']],
              ['x', ['null']],
            ],
          },
        ]
      ),
      wrap(['ref', 0], [{ kind: 'array', data: [1, [['length', ['number', '1']]]] }]),
      wrap(['ref', 0], [{ kind: 'array', data: [1, [['2', ['number', '1']]]] }]),
      wrap(['ref', 0], [{ kind: 'map', data: [[['null']]] }]),
    ];
    for (const input of invalid)
      assert.throws(
        () => restoreFixture(input),
        (e) => e instanceof FixtureCaptureError && e.code === 'INVALID_CAPTURE'
      );
  });
  it('boxes promise fixture data without assimilating it', async () => {
    const promise = Promise.resolve(42);
    const builder = createBuilder(() => fixtureValue(promise));
    assert.equal(builder.build().value, promise);
    assert.equal((await builder.buildAsync()).value, promise);
    assert.equal(await builder.build().value, 42);
    assert.equal(Object.isFrozen(builder.build()), true);
  });
  it('can clone composed inputs before transforms without mutating shared overrides', async () => {
    const initial = { tags: ['base'] };
    const shared = ['override'];
    const builder = createBuilder(() => initial, { cloneInput: cloneFixture })
      .with({ tags: shared })
      .transform((v) => {
        v.tags.push('changed');
        return v;
      });
    assert.deepEqual(builder.build(), { tags: ['override', 'changed'] });
    assert.deepEqual(await builder.buildAsync(), { tags: ['override', 'changed'] });
    assert.deepEqual(shared, ['override']);
    assert.deepEqual(initial, { tags: ['base'] });
    assert.equal(builder.describe().cloneInput, true);
    assert.equal(createBuilder(() => 1).describe().cloneInput, false);
    let calls = 0;
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(value) {
          calls++;
          value.tags.push('parsed');
          return { value };
        },
      },
    };
    const checked = createSchemaBuilder(schema, () => initial, { cloneInput: cloneFixture });
    assert.deepEqual(checked.buildValidated(), { tags: ['base', 'parsed'] });
    assert.deepEqual(initial, { tags: ['base'] });
    assert.equal(calls, 1);
  });
  it('observes incorrect async clone policies and preserves original thrown errors', async () => {
    assert.throws(() => createBuilder(() => 1, { cloneInput: null }), /cloneInput/);
    const builder = createBuilder(() => 1, {
      cloneInput: () => Promise.reject(new Error('observed')),
    });
    assert.throws(() => builder.build(), /synchronous input clone/);
    await assert.rejects(builder.buildAsync(), /synchronous input clone/);
    await setImmediate();
    const error = new Error('clone-failed');
    assert.throws(
      () =>
        createBuilder(() => 1, {
          cloneInput: () => {
            throw error;
          },
        }).build(),
      (e) => e === error
    );
  });
});

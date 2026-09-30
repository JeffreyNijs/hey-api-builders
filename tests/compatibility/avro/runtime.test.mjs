import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import avro from 'avsc';
import { avroAdapter, fromAvro, AvroFixtureError } from '@mimlet/avro';
import { BuilderValidationError, restoreSession } from 'mimlet';

const scalar = (type) => avroAdapter(type);
const Event = {
  type: 'record',
  name: 'Event',
  fields: [
    { name: 'id', type: 'long', default: 42 },
    { name: 'name', type: 'string', default: 'Ada' },
    { name: 'tag', type: ['null', 'string'], default: null },
  ],
};
const zigzag = (n) => {
  let value = (n << 1n) ^ (n >> 63n);
  const bytes = [];
  do {
    const byte = Number(value & 127n);
    value >>= 7n;
    bytes.push(byte | (value ? 128 : 0));
  } while (value);
  return bytes;
};
const wire = (...chunks) => Uint8Array.from(chunks.flat());
const roundTrip = (schema, value, options) => {
  const adapter = avroAdapter(schema, options);
  assert.equal(adapter.check(value), true);
  const decoded = adapter.decode(adapter.encode(value));
  assert.deepEqual(decoded, value);
  return adapter;
};

describe('native Avro semantics', () => {
  it('generates and overrides complete native records through the shared runtime', () => {
    const base = fromAvro(Event);
    assert.deepEqual(base.build(), { id: 0n, name: '', tag: null });
    assert.deepEqual(base.with({ name: 'Grace' }).buildValidated(), {
      id: 0n,
      name: 'Grace',
      tag: null,
    });
    assert.equal(base.build().name, '');
    assert.throws(() => base.with({ id: 1 }).buildValidated(), BuilderValidationError);
    assert.deepEqual(fromAvro(Event, { profile: 'defaults' }).build(), {
      id: 42n,
      name: 'Ada',
      tag: null,
    });
    assert.throws(() => fromAvro(Event, { maxListSize: 0 }).buildList(1), RangeError);
  });
  it('keeps union branch wrappers and qualified named branches unambiguous', () => {
    roundTrip(['null', 'string'], { string: 'example' });
    roundTrip(['int', 'long'], { long: 1n });
    roundTrip(
      ['null', { type: 'record', name: 'org.Named', fields: [{ name: 'n', type: 'int' }] }],
      { 'org.Named': { n: 3 } }
    );
    assert.equal(scalar(['int', 'long']).check(1), false);
    assert.equal(scalar(['int', 'long']).check({ int: 1, long: 1n }), false);
    assert.equal(scalar(['null', 'string']).check(null), true);
  });
  it('encodes every signed 64-bit boundary without JavaScript-number precision loss', () => {
    const adapter = scalar('long');
    for (const value of [
      -(2n ** 63n),
      -(2n ** 53n) - 1n,
      -1n,
      0n,
      1n,
      2n ** 53n + 1n,
      2n ** 63n - 1n,
    ]) {
      assert.deepEqual([...adapter.encode(value)], zigzag(value));
      assert.equal(adapter.decode(wire(zigzag(value))), value);
      assert.equal(adapter.clone(value), value);
    }
    for (const value of [2n ** 63n, -(2n ** 63n) - 1n, 1, '1'])
      assert.equal(adapter.check(value), false);
  });
  it('retains logical-type wire values without inventing codecs', () => {
    const adapter = scalar({ type: 'long', logicalType: 'timestamp-micros' });
    assert.equal(adapter.decode(adapter.encode(1700000000000001n)), 1700000000000001n);
    assert.equal(adapter.metadata.logicalTypes, 'underlying-wire-representation');
    const custom = scalar({ type: 'string', logicalType: 'future-vocabulary' });
    assert.equal(custom.create(), '');
  });
  it('supports native records, errors, arrays, maps, enums, bytes, fixed, numbers and booleans', () => {
    const types = [
      'null',
      'boolean',
      'int',
      'long',
      'float',
      'double',
      'string',
      'bytes',
      { type: 'record', name: 'Empty', fields: [] },
      { type: 'error', name: 'Issue', fields: [{ name: 'message', type: 'string' }] },
      { type: 'array', items: 'long' },
      { type: 'map', values: 'int' },
      { type: 'fixed', name: 'Hash', size: 8 },
      { type: 'enum', name: 'Suit', symbols: ['A', 'B'] },
      ['string', 'long'],
    ];
    for (const schema of types)
      for (const profile of ['minimal', 'random', 'boundary', 'defaults']) {
        const adapter = avroAdapter(schema, { profile });
        const session = adapter.session(19);
        for (let i = 0; i < 12; i++) {
          const value = adapter.create(session);
          assert.equal(adapter.check(value), true);
          assert.deepEqual(adapter.decode(adapter.encode(value)), value);
        }
      }
    roundTrip('float', Math.fround(0.1));
    assert.equal(scalar('float').check(0.1), false);
    roundTrip('double', 0.1);
    roundTrip('double', -Infinity);
    roundTrip('float', NaN);
  });
  it('matches an independent native encoder for ordinary schemas', () => {
    const schema = {
      type: 'record',
      name: 'Person',
      fields: [
        { name: 'name', type: 'string' },
        { name: 'age', type: 'int' },
      ],
    };
    const native = avro.Type.forSchema(schema);
    const adapter = avroAdapter(schema);
    const value = { name: 'Ada \u{1f680}', age: 30 };
    assert.deepEqual(Buffer.from(adapter.encode(value)), native.toBuffer(value));
    assert.deepEqual(adapter.decode(native.toBuffer(value)), value);
  });
  it('requires every field at validation time even when a reader default exists', () => {
    const adapter = avroAdapter(Event);
    assert.equal(adapter.check({ name: 'Ada', tag: null }), false);
    assert.deepEqual(adapter.issues({ name: 'Ada', tag: null })[0].path, ['id']);
    assert.throws(() => adapter.encode({ name: 'Ada', tag: null }), /required/);
    assert.equal(adapter.check({ id: 0n, name: '', tag: null, extra: 1 }), false);
  });
  it('constructs finite recursive values and stops required infinite recursion', () => {
    const schema = {
      type: 'record',
      name: 'Node',
      fields: [{ name: 'next', type: ['Node', 'null'] }],
    };
    const adapter = avroAdapter(schema, { profile: 'random', maxDepth: 8 });
    for (let i = 0; i < 10; i++)
      assert.equal(adapter.check(adapter.create(adapter.session(i))), true);
    assert.deepEqual(avroAdapter(schema).create(), { next: null });
    assert.throws(
      () =>
        avroAdapter(
          { type: 'record', name: 'Loop', fields: [{ name: 'loop', type: 'Loop' }] },
          { maxDepth: 6 }
        ).create(),
      /budget/
    );
    const deep = { type: 'record', name: 'Deep', fields: [{ name: 'a', type: 'int' }] };
    assert.throws(() => avroAdapter(deep, { maxDepth: 0 }), /budget/);
  });
  it('snapshots schemas, yields fresh data, and reproduces explicit sessions', () => {
    const source = JSON.parse(JSON.stringify(Event));
    const adapter = avroAdapter(source, { profile: 'random' });
    source.fields[0].type = 'string';
    assert.equal(typeof adapter.create().id, 'bigint');
    const a = adapter.session(42),
      b = adapter.session(42);
    assert.deepEqual(
      Array.from({ length: 4 }, () => adapter.create(a)),
      Array.from({ length: 4 }, () => adapter.create(b))
    );
    const checkpoint = a.snapshot();
    const resumed = restoreSession(checkpoint, adapter.identity);
    assert.deepEqual(adapter.create(a), adapter.create(resumed));
    const defaults = avroAdapter(
      {
        type: 'record',
        name: 'D',
        fields: [{ name: 'list', type: { type: 'array', items: 'int' }, default: [1] }],
      },
      { profile: 'defaults' }
    );
    const first = defaults.create();
    first.list.push(2);
    assert.deepEqual(defaults.create().list, [1]);
    const bytes = scalar('bytes');
    const input = Buffer.from([1]);
    const copied = bytes.clone(input);
    copied[0] = 2;
    assert.equal(input[0], 1);
  });
});

describe('Avro resource and data boundaries', () => {
  it('rejects malformed schemas and unsafe executable/native handles', () => {
    for (const schema of [
      null,
      false,
      1,
      'Missing',
      [],
      { type: 'madeup' },
      { type: 'record', name: 'R', fields: [{ name: '__proto__', type: 'int' }] },
      { type: 'record', name: 'constructor', fields: [] },
      JSON.parse('{"type":"string","__proto__":{}}'),
    ]) {
      assert.throws(() => avroAdapter(schema), AvroFixtureError);
    }
    let calls = 0;
    const getter = {
      get type() {
        calls++;
        return 'string';
      },
    };
    assert.throws(() => avroAdapter(getter), /data properties/);
    assert.equal(calls, 0);
    assert.throws(() => avroAdapter(avro.Type.forSchema('string')), /plain/);
    const cyclic = {};
    cyclic.type = cyclic;
    assert.throws(() => avroAdapter(cyclic), /acyclic/);
    for (const number of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => avroAdapter({ type: 'double', default: number }), /lossless/);
    assert.throws(
      () =>
        avroAdapter({
          type: 'record',
          name: 'R',
          fields: [{ name: 'n', type: 'long', default: 1.5 }],
        }),
      /compilation/
    );
    assert.throws(() => avroAdapter('int', { profile: 'all' }), /profile/);
  });
  it('checks option, schema and generation budgets', () => {
    for (const option of [
      'maxDepth',
      'maxNodes',
      'maxBytes',
      'maxSchemaCharacters',
      'listLength',
    ]) {
      for (const value of [-1, NaN, Infinity, 0.1, 100000001])
        assert.throws(() => avroAdapter('int', { [option]: value }), /budget/);
    }
    assert.throws(() => avroAdapter('string', { maxSchemaCharacters: 2 }), /size/);
    assert.throws(() => avroAdapter('int', { maxNodes: 0 }), /budget/);
    assert.throws(
      () => avroAdapter({ type: 'fixed', name: 'F', size: 5 }, { maxBytes: 4 }).create(),
      /size/
    );
    assert.throws(() => avroAdapter('int', { maxBytes: 0 }).encode(1), /byte budget/);
    assert.throws(
      () =>
        avroAdapter(
          { type: 'array', items: 'int' },
          { profile: 'random', listLength: 10, maxNodes: 4 }
        ).create(),
      /budget/
    );
  });
  it('rejects input accessors, native instances, cycles, sparse arrays and extra array keys', () => {
    const adapter = avroAdapter({ type: 'map', values: 'int' });
    let calls = 0;
    assert.equal(
      adapter.check({
        get x() {
          calls++;
          return 1;
        },
      }),
      false
    );
    assert.equal(calls, 0);
    for (const value of [
      new Date(),
      new (class {
        x = 1;
      })(),
      { x: undefined },
      { x: () => 1 },
      { [Symbol()]: 1 },
      Object.defineProperty({}, 'hidden', { value: 1 }),
      { x: 1n },
    ])
      assert.equal(adapter.check(value), false);
    const self = {};
    self.self = self;
    assert.equal(adapter.check(self), false);
    const arrays = avroAdapter({ type: 'array', items: 'int' });
    for (const value of [
      new Array(1),
      Object.assign([1], { extra: 1 }),
      Object.defineProperty([1], '0', {
        get() {
          calls++;
          return 1;
        },
      }),
    ])
      assert.equal(arrays.check(value), false);
    assert.equal(calls, 0);
    assert.equal(
      avroAdapter({ type: 'array', items: 'int' }, { maxNodes: 4 }).check([1, 2, 3, 4]),
      false
    );
    assert.equal(scalar('string').check('\ud800'), false);
    assert.equal(avroAdapter('bytes', { maxBytes: 2 }).check(Buffer.alloc(3)), false);
    assert.equal(avroAdapter('string', { maxBytes: 2 }).check('abc'), false);
  });
  it('rejects malformed, truncated, oversized and trailing binary input before native decoding', () => {
    assert.throws(() => scalar('int').decode('bytes'), /bounded/);
    assert.throws(() => avroAdapter('int', { maxBytes: 0 }).decode(wire(0)), /bounded/);
    for (const bytes of [[], [128], [0, 0], [...Array(9).fill(128), 2]])
      assert.throws(() => scalar('int').decode(wire(bytes)), AvroFixtureError);
    assert.throws(() => scalar('int').decode(wire(zigzag(2n ** 31n))), /int/);
    assert.throws(() => scalar('boolean').decode(wire(2)), /boolean/);
    assert.throws(() => scalar(['null', 'int']).decode(wire(zigzag(2n))), /union/);
    assert.throws(
      () => scalar({ type: 'enum', name: 'E', symbols: ['A'] }).decode(wire(zigzag(-1n))),
      /enum/
    );
    assert.throws(() => scalar('string').decode(wire(zigzag(-1n))), /length/);
    assert.throws(() => scalar('bytes').decode(wire(zigzag(10000001n))), /length/);
    assert.throws(() => scalar('string').decode(wire(zigzag(1n), 255)), /UTF-8/);
    assert.throws(() => scalar('double').decode(wire(1, 2)), /Truncated/);
  });
  it('preflights collection expansion including negative count blocks and recursive binary input', () => {
    const arrays = avroAdapter({ type: 'array', items: 'null' }, { maxNodes: 10 });
    assert.throws(() => arrays.decode(wire(zigzag(1000000000n))), /collection budget/);
    assert.deepEqual(arrays.decode(wire(zigzag(-2n), zigzag(0n), zigzag(0n))), [null, null]);
    assert.throws(() => arrays.decode(wire(zigzag(-2n), zigzag(1n), zigzag(0n))), /block size/);
    const map = avroAdapter({ type: 'map', values: 'int' });
    assert.deepEqual(map.decode(wire(zigzag(-1n), zigzag(3n), zigzag(1n), 65, zigzag(1n), 0)), {
      A: 1,
    });
    const schema = { type: 'record', name: 'N', fields: [{ name: 'next', type: ['N', 'null'] }] };
    assert.throws(
      () => avroAdapter(schema, { maxDepth: 8 }).decode(wire(Array(20).fill(0), 2)),
      /depth/
    );
    const longArray = avroAdapter({ type: 'array', items: 'null' }, { maxNodes: 5 });
    assert.throws(() => longArray.decode(wire(zigzag(3n), zigzag(3n))), /collection/);
  });
});

it('rejects provider-unsafe map keys and duplicate wire keys without prototype mutation', () => {
  const map = avroAdapter({ type: 'map', values: 'int' });
  assert.equal(map.check(JSON.parse('{"__proto__":1}')), false);
  const name = Array.from(Buffer.from('__proto__'));
  assert.throws(
    () => map.decode(wire(zigzag(1n), zigzag(BigInt(name.length)), name, 0, 0)),
    /map key/
  );
  assert.throws(() => map.decode(wire(zigzag(2n), 2, 65, 0, 2, 65, 0, 0)), /duplicate/);
  assert.equal({}.polluted, undefined);
});

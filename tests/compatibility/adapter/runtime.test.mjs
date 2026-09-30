import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  defineAdapter,
  fromAdapter,
  AdapterDefinitionError,
} from '@jeffreynijs/test-builders-adapter';
import {
  checkAdapterConformance,
  assertAdapterConformance,
} from '@jeffreynijs/test-builders-adapter/testing';
const standard = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate(value) {
      assert.equal(this.vendor, 'test');
      return typeof value === 'string'
        ? { value: value.length }
        : { issues: [{ message: 'Expected string' }] };
    },
  },
};
const definition = (operations = {}) => ({ id: 'test', version: '1.0.0', standard, operations });
const valid = { name: 'valid', input: () => 'abc', valid: true, output: (value) => value === 3 };
const invalid = { name: 'invalid', input: () => null, valid: false };

it('preserves native handles, types and factory arguments through the shared runtime', async () => {
  const source = { native: Symbol('source') };
  const adapter = defineAdapter({
    ...definition({ create: (value) => value, encode: (value) => 'x'.repeat(value) }),
    source,
  });
  assert.equal(adapter.source, source);
  assert.equal(adapter.standard, standard);
  assert.equal(fromAdapter(adapter).build('abc'), 'abc');
  assert.equal(fromAdapter(adapter).buildValidated('abc'), 3);
  assert.equal(adapter.fromFactory(() => 'abc').buildValidated(), 3);
  assert.equal(
    await fromAdapter(
      defineAdapter(definition({ create: async () => 'ab' }))
    ).buildValidatedAsync(),
    2
  );
  assert.equal(adapter.operations.encode(3), 'xxx');
});
it('inspects capabilities without invoking factories, native arbitrary makers or validators', () => {
  let calls = 0;
  const touch = () => {
    calls++;
    throw new Error('Must not run');
  };
  const fields = [
    { name: '__proto__', required: true, description: 'Safe metadata, never executable code' },
  ];
  const limitations = ['Opaque refinements need a factory'];
  const arbitrary = { vendor: 'native', version: '3', representation: 'input', make: touch };
  const operations = {
    create: touch,
    encode: touch,
    cloneInput: touch,
    checkInput: touch,
    fields,
    arbitrary,
  };
  const def = { ...definition(operations), limitations };
  const adapter = defineAdapter(def);
  operations.create = () => 'changed';
  fields[0].name = 'changed';
  limitations.push('changed');
  arbitrary.version = 'changed';
  const inspection = adapter.inspect();
  assert.equal(calls, 0);
  assert.deepEqual(inspection.fields, [
    { name: '__proto__', required: true, description: 'Safe metadata, never executable code' },
  ]);
  assert.deepEqual(inspection.limitations, ['Opaque refinements need a factory']);
  assert.deepEqual(inspection.arbitrary, {
    vendor: 'native',
    version: '3',
    representation: 'input',
  });
  assert.equal(inspection.validation, 'standard-schema-v1');
  for (const capability of ['generation', 'encoding', 'cloning', 'inputCheck'])
    assert.equal(inspection[capability], true);
  assert.equal(Object.isFrozen(inspection), true);
  assert.equal(Object.isFrozen(inspection.fields[0]), true);
  assert.equal(adapter.operations.create, touch);
  assert.equal(adapter.operations.arbitrary.make, touch);
  assert.throws(() => fromAdapter(adapter).build(), /Must not run/);
});
it('distinguishes unsupported capabilities from empty field lists and snapshots the schema reference', () => {
  const def = definition();
  const adapter = defineAdapter(def);
  def.standard = {
    '~standard': { ...standard['~standard'], validate: () => ({ value: 'wrong' }) },
  };
  assert.equal(adapter.fromFactory(() => 'abc').buildValidated(), 3);
  assert.deepEqual(adapter.inspect(), {
    id: 'test',
    version: '1.0.0',
    validation: 'standard-schema-v1',
    generation: false,
    encoding: false,
    inputCheck: false,
    cloning: false,
    fields: null,
    arbitrary: null,
    limitations: [],
  });
  assert.deepEqual(defineAdapter(definition({ fields: [] })).inspect().fields, []);
  assert.deepEqual(
    defineAdapter(definition({ fields: [{ name: 'value', required: false }] })).inspect().fields,
    [{ name: 'value', required: false }]
  );
  assert.throws(() => fromAdapter(adapter), /factory/);
});
it('rejects malformed, unknown and contradictory capability declarations', () => {
  for (const id of ['', null, 'a'.repeat(257)])
    assert.throws(() => defineAdapter({ ...definition(), id }), AdapterDefinitionError);
  for (const standard of [null, {}, { '~standard': { version: 2, validate() {} } }])
    assert.throws(() => defineAdapter({ ...definition(), standard }), AdapterDefinitionError);
  for (const operations of [
    null,
    [],
    1,
    { unknown() {} },
    { create: false },
    { encode: 'bad' },
    { cloneInput: 2 },
    { checkInput: true },
    { fields: {} },
    { fields: Array(10001).fill({ name: 'x', required: true }) },
    {
      fields: [
        { name: 'x', required: true },
        { name: 'x', required: false },
      ],
    },
    { fields: [{ name: 'x', required: 'yes' }] },
    { fields: [{ name: 'x', required: true, description: '' }] },
    { arbitrary: null },
    { arbitrary: { vendor: 'test', version: '', representation: 'input', make() {} } },
    { arbitrary: { vendor: 'test', version: '1', representation: 'unknown', make() {} } },
    { arbitrary: { vendor: 'test', version: '1', representation: 'input', make: 1 } },
  ])
    assert.throws(() => defineAdapter(definition(operations)), AdapterDefinitionError);
  for (const limitations of [{}, Array(1001).fill('x'), ['']])
    assert.throws(() => defineAdapter({ ...definition(), limitations }), AdapterDefinitionError);
});
it('runs a shared conformance suite on native checks, transformed outputs and async validation', async () => {
  const adapter = defineAdapter(definition({ checkInput: (value) => typeof value === 'string' }));
  const result = await checkAdapterConformance(adapter, [valid, invalid]);
  assert.equal(result.passed, true);
  assert.equal(result.adapter, 'test');
  assert.equal(Object.isFrozen(result.cases), true);
  await assertAdapterConformance(adapter, [valid, invalid]);
  const asynchronous = defineAdapter({
    ...definition(),
    standard: {
      '~standard': {
        version: 1,
        vendor: 'async',
        validate: async (input) => standard['~standard'].validate(input),
      },
    },
  });
  assert.equal((await checkAdapterConformance(asynchronous, [valid, invalid])).passed, true);
});
it('reports actionable conformance failures without printing private fixture values', async () => {
  const adapter = defineAdapter(definition());
  const examples = [
    [{ ...valid, input: () => 'private-string', valid: false }],
    [{ ...valid, output: () => false }],
    [
      {
        ...valid,
        input: () => {
          throw new Error('private-string');
        },
      },
    ],
  ];
  for (const cases of examples) {
    const result = await checkAdapterConformance(adapter, cases);
    assert.equal(result.passed, false);
    assert.equal(JSON.stringify(result).includes('private-string'), false);
    await assert.rejects(assertAdapterConformance(adapter, cases), /conformance failed/);
  }
  const disagree = defineAdapter(definition({ checkInput: () => false }));
  assert.match(
    (await checkAdapterConformance(disagree, [valid])).cases[0].reason,
    /Native input check/
  );
  let call = 0;
  const inconsistent = defineAdapter({
    ...definition(),
    standard: {
      '~standard': {
        version: 1,
        vendor: 'changing',
        validate: () => (++call === 1 ? { value: 3 } : { issues: [] }),
      },
    },
  });
  assert.match(
    (await checkAdapterConformance(inconsistent, [valid])).cases[0].reason,
    /Validated builder/
  );
  call = 0;
  const changed = defineAdapter({
    ...definition(),
    standard: {
      '~standard': {
        version: 1,
        vendor: 'changing',
        validate: () => ({ value: ++call === 1 ? 3 : 4 }),
      },
    },
  });
  assert.match((await checkAdapterConformance(changed, [valid])).cases[0].reason, /Builder output/);
});
it('validates conformance case definitions before invoking application code', async () => {
  const adapter = defineAdapter(definition());
  for (const cases of [
    [],
    {},
    Array(10001).fill(valid),
    [valid, valid],
    [null],
    [{ ...valid, name: '' }],
    [{ ...valid, input: 1 }],
    [{ ...valid, valid: 'yes' }],
    [{ ...valid, output: false }],
  ]) {
    await assert.rejects(checkAdapterConformance(adapter, cases), TypeError);
  }
});

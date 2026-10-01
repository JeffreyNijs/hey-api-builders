import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBuilder,
  createSchemaBuilder,
  fluent,
  BuilderValidationError,
} from '../dist/index.js';

describe('opt-in named fluent builders', () => {
  it('retains factory arguments, immutable branches and configuration order without probing data', () => {
    let calls = 0;
    const source = createBuilder((id, name = 'base') => {
      calls++;
      return { id, name, age: 7 };
    });
    const fields = ['name', 'age'];
    const base = fluent(source, fields);
    fields[0] = 'other';
    const changed = base
      .withName('Ada')
      .with({ age: 8 })
      .withAge(9)
      .transform((value) => ({ ...value, name: `${value.name}!` }))
      .withName('Grace');
    assert.equal(calls, 0);
    assert.deepEqual(changed.build(1), { id: 1, name: 'Grace!', age: 9 });
    assert.deepEqual(base.build(2), { id: 2, name: 'base', age: 7 });
    assert.deepEqual(source.build(3), { id: 3, name: 'base', age: 7 });
    assert.notEqual(changed, base);
    assert.equal(changed.describe().operations.length, 6);
    assert.throws(() => base.withName.call({}, 'invalid'), /receiver/);
  });
  it('preserves validation, encoded inputs and named methods after asynchronous transitions', async () => {
    let parses = 0;
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(value) {
          parses++;
          return value.age === 'bad'
            ? { issues: [{ message: 'invalid' }] }
            : { value: { age: Number(value.age) } };
        },
      },
    };
    const base = fluent(
      createSchemaBuilder(schema, (age) => ({ age })),
      ['age']
    );
    assert.deepEqual(base.withAge('42').build('1'), { age: '42' });
    assert.equal(parses, 0);
    assert.deepEqual(base.withAge('42').buildValidated('1'), { age: 42 });
    assert.equal(parses, 1);
    const asyncBuilder = base.transformAsync(async (value) => value).withAge('43');
    assert.deepEqual(await asyncBuilder.buildValidatedAsync('1'), { age: 43 });
    assert.throws(() => asyncBuilder.build('1'), /buildAsync/);
    assert.throws(() => base.withAge('bad').buildValidated('1'), BuilderValidationError);
    const nativeAsync = fluent(
      createBuilder(async (id) => ({ id })),
      ['id']
    );
    assert.deepEqual(await nativeAsync.withId(9).buildAsync(1), { id: 9 });
  });
  it('normalizes explicit field names and allows unambiguous method aliases', () => {
    const source = createBuilder(() => ({
      'first-name': 'base',
      first_name: 'base',
      factory: '',
      '': 1,
    }));
    assert.equal(fluent(source, ['first-name']).withFirstName('Ada').build()['first-name'], 'Ada');
    assert.equal(fluent(source, ['']).withValue(2).build()[''], 2);
    const mapping = Object.assign(Object.create(null), {
      withFactoryValue: 'factory',
      named: 'first_name',
    });
    const base = fluent(source, mapping);
    mapping.named = 'factory';
    assert.equal(base.named('Grace').withFactoryValue('domain').build().first_name, 'Grace');
    for (const fields of [
      ['first-name', 'first_name'],
      ['factory'],
      ['name', 'name'],
      { one: 'factory', two: 'factory' },
    ])
      assert.throws(() => fluent(source, fields), /unique|capabilities/);
    const property = 'x'.repeat(100);
    assert.equal(
      fluent(
        createBuilder(() => ({ [property]: 1 })),
        { withLong: property }
      )
        .withLong(2)
        .build()[property],
      2
    );
  });
  it('rejects active, oversized and capability-overriding selections without invoking accessors', () => {
    const base = createBuilder(() => ({ name: '' }));
    let reads = 0;
    const accessor = Object.defineProperty({}, 'withName', {
      enumerable: true,
      get() {
        reads++;
        return 'name';
      },
    });
    const sparse = new Array(1);
    const extra = Object.assign(['name'], { extra: true });
    for (const selection of [
      null,
      undefined,
      1,
      [],
      {},
      new Date(),
      sparse,
      extra,
      accessor,
      Object.defineProperty({}, 'withName', { value: 'name' }),
      { [Symbol('hidden')]: 'name' },
      [1],
      ['x'.repeat(65)],
      { long: 'x'.repeat(1025) },
      { 'not valid': 'name' },
      { ['x'.repeat(129)]: 'name' },
      { build: 'name' },
      { then: 'name' },
      { toJSON: 'name' },
      new Array(1001).fill('name'),
    ])
      assert.throws(() => fluent(base, selection), TypeError);
    assert.equal(reads, 0);
    assert.throws(() => fluent(null, ['name']), /builder/);
  });
});

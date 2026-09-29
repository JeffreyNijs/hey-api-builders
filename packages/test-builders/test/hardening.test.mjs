import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { createBuilder, createSchemaBuilder, BuilderValidationError, BuilderGenerationError } from '../dist/index.js';
const schema = (validate) => ({ '~standard': { vendor: 'test', version: 1, validate } });

describe('core hardening', () => {
  it('rejects partial patches onto absent values before claiming a record', () => {
    for (const initial of [null, undefined, 1, 'old', new Date(), new Map()]) {
      const builder = createBuilder(() => initial);
      assert.throws(() => builder.with({ name: 'Ada' }).build(), /use replace/);
      assert.deepEqual(builder.replace({ id: '1', name: 'Ada' }).build(), { id: '1', name: 'Ada' });
    }
  });
  it('replaces union variants without retaining properties from the old variant', () => {
    const cats = createBuilder(() => ({ kind: 'cat', lives: 9 }));
    assert.deepEqual(cats.replace({ kind: 'dog', bark: true }).build(), { kind: 'dog', bark: true });
  });
  it('creates independent nested overrides for every build', () => {
    const items = createBuilder(() => ({ id: 1, nested: { tags: [] } }))
      .withFactory(() => ({ nested: { tags: ['new'] } }));
    const [first, second] = items.buildList(2);
    first.nested.tags.push('mutated');
    assert.deepEqual(second.nested.tags, ['new']);
  });
  it('forwards the factory argument tuple to per-build overrides and transforms', async () => {
    const builder = createBuilder((offset, text) => ({ value: offset, text }))
      .withFactory((offset, text) => ({ value: offset * 2, text }))
      .transform((value, offset, text) => ({ value: value.value + offset, text: text + value.text }));
    assert.deepEqual(builder.build(3, 'x'), { value: 9, text: 'xx' });
    assert.deepEqual(await builder.buildAsync(4, 'y'), { value: 12, text: 'yy' });
  });
  it('runs each replacement factory on every build, without changing the source builder', () => {
    let next = 0;
    const base = createBuilder(() => ({ value: 100 }));
    const replaced = base.replaceFactory(() => ({ value: ++next }));
    assert.deepEqual(replaced.buildList(2), [{ value: 1 }, { value: 2 }]);
    assert.deepEqual(base.build(), { value: 100 });
  });
  it('omits fields without mutating the input, including own symbols and prototype-like keys', () => {
    const key = Symbol('optional');
    const original = { id: 1, note: 'old', [key]: true, ...JSON.parse('{"__proto__":1}') };
    const result = createBuilder(() => original).omit('note', key, '__proto__').build();
    assert.deepEqual(result, { id: 1 });
    assert.equal(original.note, 'old');
    assert.equal(Object.hasOwn(original, '__proto__'), true);
    assert.equal(original[key], true);
  });
  it('distinguishes absent, undefined and null values', () => {
    const base = createBuilder(() => ({ id: 1, optional: 'present' }));
    assert.equal(Object.hasOwn(base.omit('optional').build(), 'optional'), false);
    assert.equal(Object.hasOwn(base.with({ optional: undefined }).build(), 'optional'), true);
    assert.equal(base.with({ optional: null }).build().optional, null);
  });
  it('retains patch-before-transform ordering and operation order within each stage', () => {
    const order = [];
    const result = createBuilder(() => { order.push('factory'); return { value: 0, note: 'x' }; })
      .transform((value) => { order.push('transform1'); return { ...value, value: value.value * 2 }; })
      .withFactory(() => { order.push('patch'); return { value: 3 }; })
      .omit('note')
      .transform((value) => { order.push('transform2'); return { ...value, value: value.value + 1 }; })
      .build();
    assert.deepEqual(result, { value: 7 });
    assert.deepEqual(order, ['factory', 'patch', 'transform1', 'transform2']);
  });
  it('accepts explicit async transforms and keeps asynchronous lists sequential', async () => {
    let active = 0;
    let next = 0;
    const builder = createBuilder(() => ({ id: ++next }))
      .transformAsync(async (value) => {
        active++;
        assert.equal(active, 1);
        await nextTurn();
        active--;
        return { id: value.id * 2 };
      })
      .withFactory(() => ({}));
    assert.deepEqual(await builder.buildListAsync(3), [{ id: 2 }, { id: 4 }, { id: 6 }]);
    assert.throws(() => builder.build(), /buildAsync/);
    assert.equal(next, 3);
  });
  it('keeps validation through every new fluent operation, including async transforms', async () => {
    let validations = 0;
    const base = createSchemaBuilder(schema((input) => {
      validations++;
      return { value: { count: Number(input.count) } };
    }), () => ({ count: '1', note: 'x' }));
    const next = base.withFactory(() => ({ count: '2' }))
      .replaceFactory(() => ({ count: '3', note: 'x' })).omit('note')
      .transformAsync(async (value) => ({ count: String(Number(value.count) + 1) }));
    assert.deepEqual(await next.buildValidatedAsync(), { count: 4 });
    assert.equal(validations, 1);
    assert.deepEqual(base.build(), { count: '1', note: 'x' });
  });
  it('forwards validation options separately from factory arguments and preserves the receiver', () => {
    const options = { libraryOptions: { custom: 42 } };
    const input = { id: 'x' };
    let received;
    const validator = schema(function(value, validationOptions) {
      assert.equal(this.vendor, 'test');
      received = validationOptions;
      return { value };
    });
    const base = createSchemaBuilder(validator, (value) => value);
    const configured = base.usingValidation(options).withFactory(() => ({}));
    assert.deepEqual(configured.buildValidated(input), input);
    assert.deepEqual(received, options);
    base.buildValidated(input);
    assert.equal(received, undefined);
    createSchemaBuilder(validator, () => input, { validationOptions: options }).buildValidated();
    assert.deepEqual(received, received);
  });
  it('rejects malformed schema handles with a useful error', () => {
    for (const invalid of [undefined, null, {}, { '~standard': {} }, { '~standard': { version: 2, validate() {} } }]) {
      assert.throws(() => createSchemaBuilder(invalid, () => 1), /Standard Schema v1/);
    }
  });
  it('enforces configurable allocation budgets before any factory or validation work', async () => {
    let calls = 0;
    const base = createSchemaBuilder(schema((value) => { calls++; return { value }; }), () => { calls++; return 1; }, { maxListSize: 2 });
    assert.throws(() => base.buildList(3), RangeError);
    assert.throws(() => base.buildValidatedList(3), RangeError);
    await assert.rejects(base.buildListAsync(3), RangeError);
    await assert.rejects(base.buildValidatedListAsync(3), RangeError);
    assert.equal(calls, 0);
    assert.deepEqual(base.buildValidatedList(2), [1, 1]);
    assert.equal(calls, 4);
  });
  it('allows an explicit zero list budget and rejects invalid configurations', () => {
    const base = createBuilder(() => assert.fail(), { maxListSize: 0 });
    assert.deepEqual(base.buildList(0), []);
    assert.throws(() => base.buildList(1), RangeError);
    for (const maxListSize of [-1, 0.5, NaN, Infinity, 2 ** 32]) {
      assert.throws(() => createBuilder(() => 1, { maxListSize }), RangeError);
    }
    assert.throws(() => createBuilder(() => assert.fail()).buildList(10_001), RangeError);
  });
  it('never includes fixture values in the operation description', () => {
    const base = createBuilder(() => ({ secret: 'do-not-log' })).with({ secret: 'private' }).omit('missing').transform((v) => v);
    const description = base.describe();
    assert.deepEqual(description.operations, ['factory', 'merge', 'omit', 'transform']);
    assert.equal(JSON.stringify(description).includes('private'), false);
    assert.equal(description.validation, false);
    assert.equal(Object.isFrozen(description), true);
    assert.equal(Object.isFrozen(description.operations), true);
    assert.equal(createSchemaBuilder(schema((value) => ({ value })), () => 1).describe().validation, true);
  });
  it('checks callbacks when configured, not only when executed', () => {
    const base = createBuilder(() => 1);
    for (const name of ['withFactory', 'replaceFactory', 'transform', 'transformAsync']) {
      assert.throws(() => base[name](null), /factory function/);
    }
    assert.throws(() => base.omit('x').build(), /plain record/);
  });
  it('observes rejected promises returned by mistakenly synchronous patch and replacement factories', async () => {
    for (const name of ['withFactory', 'replaceFactory']) {
      const builder = createBuilder(() => 1)[name](() => Promise.reject(new Error('rejected')));
      assert.throws(() => builder.build(), /synchronous .* factory/);
      await assert.rejects(builder.buildAsync(), /synchronous .* factory/);
    }
    await nextTurn();
  });
  it('preserves thrown causes and native issue paths', async () => {
    const cause = new Error('native');
    const error = new BuilderGenerationError('could not generate', cause);
    assert.equal(error.cause, cause);
    assert.equal(error.code, 'GENERATION_FAILED');
    const issues = [{ message: 'no', path: ['x', { key: 1 }] }];
    const base = createSchemaBuilder(schema(() => ({ issues })), () => 1).transformAsync(async v => v);
    await assert.rejects(base.buildValidatedAsync(), error => error instanceof BuilderValidationError && error.issues === issues);
  });
  it('preserves cross-realm asynchronous factories and validation', async () => {
    const base = createSchemaBuilder(schema(() => runInNewContext('Promise.resolve({value: 3})')), () => runInNewContext('Promise.resolve(1)'));
    assert.equal(await base.buildValidatedAsync(), 3);
    assert.throws(() => base.build(), /buildAsync/);
  });
});

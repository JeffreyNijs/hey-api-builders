import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';

import { BuilderValidationError, createBuilder, createSchemaBuilder } from '../dist/index.js';

function schema(validate) {
  return { '~standard': { version: 1, vendor: 'test', validate } };
}

const invalidCounts = [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 2 ** 32];

describe('factory builders', () => {
  it('keeps base and derived configurations independent', () => {
    const base = createBuilder(() => ({ name: 'base', role: 'reader' }));
    const named = base.with({ name: 'Ada' });
    const admin = named.with({ role: 'admin' });
    assert.deepEqual(base.build(), { name: 'base', role: 'reader' });
    assert.deepEqual(named.build(), { name: 'Ada', role: 'reader' });
    assert.deepEqual(admin.build(), { name: 'Ada', role: 'admin' });
    assert.notEqual(base, named);
    assert.equal(Object.isFrozen(base), true);
  });

  it('runs patches before transforms regardless of registration order', () => {
    const base = createBuilder(() => ({ value: 1 }));
    const changed = base
      .transform(({ value }) => ({ value: value * 2 }))
      .with({ value: 3 })
      .transform(({ value }) => ({ value: value + 1 }));
    assert.deepEqual(changed.build(), { value: 7 });
    assert.deepEqual(base.build(), { value: 1 });
  });

  it('replaces nested objects and arrays rather than deep-merging', () => {
    const nested = { x: 3 };
    const value = createBuilder(() => ({ nested: { x: 1, y: 2 }, tags: ['old'] }))
      .with({ nested, tags: ['new'] })
      .build();
    assert.deepEqual(value, { nested: { x: 3 }, tags: ['new'] });
    assert.equal(value.nested, nested);
  });

  it('distinguishes record replacement from a shallow patch', () => {
    const base = createBuilder(() => ({ x: 1, optional: true }));
    assert.deepEqual(base.with({ x: 2 }).build(), { x: 2, optional: true });
    assert.deepEqual(base.replace({ x: 2 }).build(), { x: 2 });
    assert.deepEqual(base.with({ x: 9 }).replace({ x: 2 }).build(), { x: 2 });
    assert.deepEqual(base.replace({ x: 2 }).with({ optional: false }).build(), {
      x: 2,
      optional: false,
    });
  });

  it('handles arrays, primitives, null and explicit undefined replacements', () => {
    assert.deepEqual(
      createBuilder(() => [1, 2])
        .with([3])
        .build(),
      [3]
    );
    assert.equal(
      createBuilder(() => 'old')
        .with('new')
        .build(),
      'new'
    );
    assert.equal(
      createBuilder(() => 1)
        .with(0)
        .build(),
      0
    );
    assert.equal(
      createBuilder(() => true)
        .with(false)
        .build(),
      false
    );
    assert.equal(
      createBuilder(() => 'old')
        .with(null)
        .build(),
      null
    );
    assert.equal(
      createBuilder(() => 'old')
        .with(undefined)
        .build(),
      undefined
    );
  });

  it('preserves Date, Map, Set, RegExp and typed-array replacements', () => {
    const values = [new Date(1), new Map([['x', 1]]), new Set([1]), /test/u, new Uint8Array([1])];
    for (const value of values) {
      assert.equal(
        createBuilder(() => value)
          .with(value)
          .build(),
        value
      );
    }
  });

  it('rejects partial-record patches of class instances and offers replace()', () => {
    class Model {
      constructor(value) {
        this.value = value;
      }
      doubled() {
        return this.value * 2;
      }
    }
    const replacement = new Model(4);
    const base = createBuilder(() => new Model(1));
    assert.throws(() => base.with({ value: 2 }).build(), /use replace/);
    assert.equal(base.replace(replacement).build().doubled(), 8);
    assert.equal(base.with(replacement).build(), replacement);
  });

  it('accepts null-prototype records without prototype pollution', () => {
    const patch = JSON.parse('{"__proto__":{"polluted":true},"value":2}');
    const value = createBuilder(() => Object.assign(Object.create(null), { value: 1 }))
      .with(patch)
      .build();
    assert.equal(value.value, 2);
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(Object.hasOwn(value, '__proto__'), true);
    assert.equal({}.polluted, undefined);
  });

  it('forwards all required factory arguments unchanged', () => {
    const options = { offset: 2 };
    const base = createBuilder((received, multiplier) => {
      assert.equal(received, options);
      return received.offset * multiplier;
    });
    assert.equal(base.build(options, 3), 6);
    assert.deepEqual(base.buildList(2, options, 4), [8, 8]);
  });

  it('calls a fresh factory for every build and preserves sequence order', () => {
    let sequence = 0;
    const base = createBuilder(() => ({ id: ++sequence }));
    const values = base.buildList(3);
    assert.deepEqual(values, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    assert.notEqual(values[0], values[1]);
    assert.equal(base.build().id, 4);
  });

  it('does not invoke factories for empty or invalid lists', async () => {
    const base = createBuilder(() => {
      assert.fail('factory must not run');
    });
    assert.deepEqual(base.buildList(0), []);
    assert.deepEqual(await base.buildListAsync(0), []);
    for (const count of invalidCounts) {
      assert.throws(() => base.buildList(count), RangeError);
      await assert.rejects(base.buildListAsync(count), RangeError);
    }
  });

  it('supports async factories and sequential asynchronous lists', async () => {
    let active = 0;
    let sequence = 0;
    const base = createBuilder(async (prefix) => {
      assert.equal(active, 0);
      active += 1;
      await nextTurn();
      active -= 1;
      return `${prefix}${++sequence}`;
    });
    assert.deepEqual(await base.buildListAsync(3, 'x'), ['x1', 'x2', 'x3']);
    assert.equal(await base.buildAsync('y'), 'y4');
  });

  it('rejects asynchronous results in sync builds without unhandled rejections', async () => {
    const rejecting = createBuilder(() => Promise.reject(new Error('factory rejected')));
    assert.throws(() => rejecting.build(), /buildAsync/);
    await nextTurn();
    const crossRealm = createBuilder(() => runInNewContext('Promise.resolve(42)'));
    assert.throws(() => crossRealm.build(), /buildAsync/);
    assert.equal(await crossRealm.buildAsync(), 42);
  });

  it('propagates factory and transform failures', async () => {
    const failure = new Error('original');
    const base = createBuilder(() => {
      throw failure;
    });
    assert.throws(
      () => base.build(),
      (error) => error === failure
    );
    await assert.rejects(base.buildAsync(), (error) => error === failure);
    const transformed = createBuilder(() => 1).transform(() => {
      throw failure;
    });
    assert.throws(
      () => transformed.build(),
      (error) => error === failure
    );
  });

  it('rejects asynchronous transforms rather than silently returning promises', async () => {
    const base = createBuilder(() => 1).transform(async (value) => value + 1);
    assert.throws(() => base.build(), /synchronous transform/);
    await assert.rejects(base.buildAsync(), /synchronous transform/);
  });

  it('reports an invalid factory at creation time', () => {
    assert.throws(() => createBuilder(null), /factory function/);
  });
});

describe('Standard Schema validation', () => {
  it('passes patched input to validation once and returns transformed output', () => {
    let calls = 0;
    const validator = schema((input) => {
      calls += 1;
      assert.equal(input.age, '43');
      return { value: { age: Number(input.age) } };
    });
    const base = createSchemaBuilder(validator, () => ({ age: '42' }));
    const changed = base
      .with({ age: '41' })
      .transform(({ age }) => ({ age: String(Number(age) + 2) }));
    assert.deepEqual(changed.buildValidated(), { age: 43 });
    assert.equal(calls, 1);
    assert.deepEqual(base.build(), { age: '42' });
    assert.equal(calls, 1);
  });

  it('leaves intentionally invalid fixtures unvalidated in ordinary builds', () => {
    const validator = schema(() => ({ issues: [{ message: 'invalid' }] }));
    const base = createSchemaBuilder(validator, () => ({ email: 'broken' }));
    assert.deepEqual(base.build(), { email: 'broken' });
    assert.throws(() => base.buildValidated(), BuilderValidationError);
  });

  it('preserves issues and paths without retrying or overwriting overrides', () => {
    let calls = 0;
    const issues = [{ message: 'invalid age', path: [{ key: 'age' }] }];
    const validator = schema((input) => {
      calls += 1;
      assert.equal(input.age, 'broken');
      return { issues };
    });
    const base = createSchemaBuilder(validator, () => ({ age: '42' })).with({ age: 'broken' });
    assert.throws(
      () => base.buildValidated(),
      (error) => {
        assert.equal(error.name, 'BuilderValidationError');
        assert.equal(error.message, 'Schema validation failed');
        assert.equal(error.code, 'VALIDATION_FAILED');
        assert.equal(error.issues, issues);
        return true;
      }
    );
    assert.equal(calls, 1);
  });

  it('treats even an empty issues array as a validation failure', () => {
    const base = createSchemaBuilder(
      schema(() => ({ issues: [] })),
      () => 1
    );
    assert.throws(() => base.buildValidated(), /Schema validation failed/);
  });

  it('preserves validation after with(), replace() and transform()', () => {
    const validator = schema((value) => ({ value: value * 10 }));
    const base = createSchemaBuilder(validator, () => 1);
    const changed = base
      .with(2)
      .replace(3)
      .transform((value) => value + 1);
    assert.equal(changed.buildValidated(), 40);
    assert.equal(base.buildValidated(), 10);
  });

  it('supports async validation and async factories', async () => {
    const validator = schema(async (input) => ({ value: Number(input) }));
    const base = createSchemaBuilder(validator, async (input) => input);
    assert.equal(await base.buildValidatedAsync('42'), 42);
    assert.deepEqual(await base.buildValidatedListAsync(2, '7'), [7, 7]);
  });

  it('directs sync callers to async validation and observes rejected promises', async () => {
    const validator = schema(() => Promise.reject(new Error('validator rejected')));
    const base = createSchemaBuilder(validator, () => 1);
    assert.throws(() => base.buildValidated(), /buildValidatedAsync/);
    await nextTurn();
    await assert.rejects(base.buildValidatedAsync(), /validator rejected/);
  });

  it('recognizes cross-realm validation promises', async () => {
    const validator = schema(() => runInNewContext('Promise.resolve({ value: 42 })'));
    const base = createSchemaBuilder(validator, () => '42');
    assert.throws(() => base.buildValidated(), /buildValidatedAsync/);
    assert.equal(await base.buildValidatedAsync(), 42);
  });

  it('generates and validates lists sequentially', async () => {
    const order = [];
    let sequence = 0;
    const validator = schema((input) => {
      order.push(`validate:${input}`);
      return { value: input * 10 };
    });
    const base = createSchemaBuilder(validator, () => {
      const value = ++sequence;
      order.push(`generate:${value}`);
      return value;
    });
    assert.deepEqual(base.buildValidatedList(2), [10, 20]);
    assert.deepEqual(await base.buildValidatedListAsync(1), [30]);
    assert.deepEqual(order, [
      'generate:1',
      'validate:1',
      'generate:2',
      'validate:2',
      'generate:3',
      'validate:3',
    ]);
  });

  it('checks list counts before validation or generation', async () => {
    const base = createSchemaBuilder(
      schema(() => assert.fail()),
      () => assert.fail()
    );
    assert.deepEqual(base.buildValidatedList(0), []);
    assert.deepEqual(await base.buildValidatedListAsync(0), []);
    for (const count of invalidCounts) {
      assert.throws(() => base.buildValidatedList(count), RangeError);
      await assert.rejects(base.buildValidatedListAsync(count), RangeError);
    }
  });

  it('propagates exceptions thrown by validators unchanged', async () => {
    const failure = new Error('validator exploded');
    const base = createSchemaBuilder(
      schema(() => {
        throw failure;
      }),
      () => 1
    );
    assert.throws(
      () => base.buildValidated(),
      (error) => error === failure
    );
    await assert.rejects(base.buildValidatedAsync(), (error) => error === failure);
  });

  it('preserves the validator receiver', () => {
    const validator = schema(function (value) {
      assert.equal(this.vendor, 'test');
      return { value };
    });
    assert.equal(createSchemaBuilder(validator, () => 1).buildValidated(), 1);
  });

  it('checks the standard version and validation capability', () => {
    const validator = schema((value) => ({ value }));
    validator['~standard'].version = 2;
    assert.throws(() => createSchemaBuilder(validator, () => 1), /Standard Schema v1/);
  });
});

// A validator may echo private input in native diagnostics. Default error surfaces
// remain safe while deliberate issue inspection retains the original objects.
for (const asynchronous of [false, true]) {
  it(`keeps native fixture diagnostics opt-in (${asynchronous ? 'async' : 'sync'})`, async () => {
    const marker = 'PRIVATE_FIXTURE_SENTINEL';
    const issues = [{ message: marker, path: ['value'], input: marker }];
    const validator = schema(() => (asynchronous ? Promise.resolve({ issues }) : { issues }));
    const builder = createSchemaBuilder(validator, () => marker);
    const check = (error) => {
      assert.ok(error instanceof BuilderValidationError);
      assert.equal(error.code, 'VALIDATION_FAILED');
      assert.equal(error.issues, issues);
      assert.equal(String(error).includes(marker), false);
      assert.equal(error.stack.includes(marker), false);
      assert.equal(JSON.stringify(error).includes(marker), false);
      assert.equal(Object.keys(error).includes('issues'), false);
      return true;
    };
    if (asynchronous) await assert.rejects(builder.buildValidatedAsync(), check);
    else assert.throws(() => builder.buildValidated(), check);
  });
}

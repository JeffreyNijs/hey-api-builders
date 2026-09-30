import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  builderClass,
  createBuilderClass,
  createSchemaBuilderClass,
  createBuilder,
  BuilderValidationError,
} from '../dist/index.js';

describe('canonical class facades', () => {
  it('retains generated convenience methods and subclass identity throughout fluent configuration', () => {
    let calls = 0;
    class UserBuilder extends createBuilderClass((prefix = '') => {
      calls++;
      return { name: `${prefix}base`, role: 'reader', note: 'optional' };
    }) {
      label = 'User';
      withName(name) {
        return this.with({ name });
      }
      withRole(role) {
        return this.with({ role });
      }
    }
    const base = new UserBuilder();
    const configured = base
      .withName('Ada')
      .with({ role: 'admin' })
      .omit('note')
      .withRole('owner')
      .transform((value) => ({ ...value, name: `${value.name}!` }));
    assert.equal(calls, 0);
    assert.equal(configured instanceof UserBuilder, true);
    assert.equal(configured.label, 'User');
    assert.deepEqual(configured.build('x'), { name: 'Ada!', role: 'owner' });
    assert.deepEqual(base.build(), { name: 'base', role: 'reader', note: 'optional' });
    assert.deepEqual(new UserBuilder({ name: 'initial' }).build().name, 'initial');
    assert.notEqual(base, configured);
    assert.deepEqual(
      configured.buildList(2).map((v) => v.name),
      ['Ada!', 'Ada!']
    );
    assert.deepEqual(configured.replace({ name: 'replace', role: 'none' }).build(), {
      name: 'replace!',
      role: 'none',
    });
    assert.deepEqual(configured.withFactory(() => ({ name: 'fresh' })).build().name, 'fresh!');
    assert.deepEqual(
      configured.replaceFactory(() => ({ name: 'fresh', role: 'reader' })).build().role,
      'reader'
    );
    assert.equal(configured.describe().validation, false);
  });
  it('preserves async transitions through generated fluent methods without changing the base', async () => {
    class Users extends createBuilderClass((id) => ({ id })) {
      withId(id) {
        return this.with({ id });
      }
    }
    const base = new Users();
    const asynchronous = base.transformAsync(async (v) => ({ id: `${v.id}!` })).withId('changed');
    assert.equal(asynchronous instanceof Users, true);
    assert.equal((await asynchronous.buildAsync('base')).id, 'changed!');
    assert.deepEqual(await asynchronous.buildListAsync(2, 'base'), [
      { id: 'changed!' },
      { id: 'changed!' },
    ]);
    assert.throws(() => asynchronous.build('x'), /buildAsync/);
    assert.equal(base.build('original').id, 'original');
    const FromAsync = createBuilderClass(async (id) => ({ id }));
    assert.deepEqual(await new FromAsync().buildAsync(7), { id: 7 });
  });
  it('preserves schema validation and separate input/output behavior through all operations', async () => {
    let count = 0;
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(value, options) {
          assert.equal(this.vendor, 'test');
          if (options) assert.equal(options.custom, true);
          count++;
          return value.age === 'bad'
            ? { issues: [{ message: 'bad', path: ['age'] }] }
            : { value: { age: Number(value.age) } };
        },
      },
    };
    class Users extends createSchemaBuilderClass(schema, (age) => ({ age })) {
      withAge(age) {
        return this.with({ age });
      }
    }
    const base = new Users();
    const changed = base.withAge('43').usingValidation({ custom: true });
    assert.deepEqual(changed.buildValidated('42'), { age: 43 });
    assert.equal(count, 1);
    assert.deepEqual(changed.build('42'), { age: '43' });
    assert.deepEqual(await changed.buildValidatedAsync('42'), { age: 43 });
    assert.deepEqual(changed.buildValidatedList(2, '42'), [{ age: 43 }, { age: 43 }]);
    assert.deepEqual(await changed.buildValidatedListAsync(2, '42'), [{ age: 43 }, { age: 43 }]);
    assert.deepEqual(
      await changed
        .transformAsync(async (v) => v)
        .withAge('44')
        .buildValidatedAsync('42'),
      { age: 44 }
    );
    assert.throws(() => changed.withAge('bad').buildValidated('42'), BuilderValidationError);
    const Native = builderClass(() => createBuilder(() => ({ value: 1 })));
    assert.deepEqual(new Native().build(), { value: 1 });
  });
  it('guards malformed definitions, borrowed methods and unavailable capabilities', async () => {
    assert.throws(() => builderClass(null), /definition/);
    for (const value of [null, undefined, 1, {}, () => {}, Promise.reject(new Error('no'))]) {
      const Invalid = builderClass(() => value);
      assert.throws(() => new Invalid(), /synchronously/);
    }
    assert.throws(() => createSchemaBuilderClass(undefined, () => 1), /Standard Schema/);
    const Base = createBuilderClass(() => 1);
    const base = new Base();
    assert.throws(() => base.build.call({}), /receiver/);
    assert.throws(() => base.buildValidated(), /unavailable/);
    assert.throws(() => base.usingValidation({}), /unavailable/);
    await setImmediate();
  });
});

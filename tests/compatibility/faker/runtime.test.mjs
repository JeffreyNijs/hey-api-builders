import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { en, nl, faker as globalFaker } from '@faker-js/faker';
import { fakerAdapter, fromFaker, fromFakerSchema, FakerSessionError } from '@mimlet/faker';
import { restoreSession, SessionBudgetError, BuilderValidationError } from '@mimlet/core';
import { createRequire } from 'node:module';
const fakerVersion = createRequire(import.meta.url)('@faker-js/faker/package.json').version;
const options = { fingerprint: 'person/v1' };
const schema = (validate) => ({ '~standard': { version: 1, vendor: 'test', validate } });

describe('real Faker session conformance', () => {
  it('replays realistic native values and reference dates across fresh instances', () => {
    const p = fakerAdapter(options);
    const b = fromFaker(
      (f) => ({
        id: f.string.uuid(),
        name: f.person.fullName(),
        email: f.internet.email(),
        date: f.date.recent(),
      }),
      options
    );
    const s = p.session(42, { referenceTime: '2026-01-01T00:00:00.000Z' });
    const before = s.snapshot();
    const values = b.buildList(5, s);
    assert.deepEqual(b.buildList(5, restoreSession(before, p.identity)), values);
    assert.equal(new Set(values.map((x) => x.id)).size, 5);
    assert.ok(values.every((x) => x.date instanceof Date && x.date < new Date('2026-01-01')));
    assert.notDeepEqual(b.buildList(5, s), values);
  });
  it('names the installed Faker release in the replay identity', () => {
    const p = fakerAdapter(options);
    assert.equal(p.identity.provider, `@faker-js/faker@${fakerVersion}/session-randomizer-v1`);
    const other = {
      ...p.identity,
      provider: p.identity.provider.replace(fakerVersion, '0.0.0'),
    };
    assert.throws(() => restoreSession(p.session(42).snapshot(), other));
  });
  it('separates named fields and locale streams without resetting their sequences', () => {
    const p = fakerAdapter(options),
      localized = fakerAdapter({ ...options, locale: [nl, en], localeIdentity: 'nl+en/v1' });
    const a = p.session(42),
      b = p.session(42);
    p.instance(a, 'name').person.fullName();
    localized.instance(a, 'name').person.fullName();
    assert.equal(p.instance(a, 'email').internet.email(), p.instance(b, 'email').internet.email());
    assert.notEqual(
      p.instance(a, 'email').internet.email(),
      p.instance(p.session(42), 'email').internet.email()
    );
    assert.notDeepEqual(p.identity, localized.identity);
    assert.throws(() => restoreSession(a.snapshot(), localized.identity));
  });
  it('uses fixed default reference time and rejects hidden native reseeding', () => {
    const p = fakerAdapter(options),
      s = p.session();
    const f = p.instance(s);
    const date = f.date.soon();
    assert.ok(date >= new Date('2000-01-01') && date < new Date('2000-02-01'));
    assert.throws(
      () => f.seed(123),
      (e) => e instanceof FakerSessionError && e.code === 'FAKER_SESSION_RECONFIGURATION'
    );
    assert.ok(f.number.int({ max: 10 }) >= 0);
    assert.equal(Object.isFrozen(p), true);
    assert.equal(p.metadata.generation, 'realistic-seeded');
  });
  it('does not perturb a preconfigured global Faker singleton', () => {
    globalFaker.seed(234);
    const expected = globalFaker.person.fullName();
    globalFaker.seed(234);
    const p = fakerAdapter(options);
    p.instance(p.session()).person.fullName();
    assert.equal(globalFaker.person.fullName(), expected);
  });
  it('uses the same shared override, transform, clone and list-budget behavior', () => {
    const p = fakerAdapter(options);
    const b = fromFaker((f) => ({ id: f.string.uuid(), nested: { values: [] } }), {
      ...options,
      maxListSize: 2,
      cloneInput: (v) => globalThis.structuredClone(v),
    });
    assert.equal(b.describe().cloneInput, true);
    const changed = b
      .withFactory(() => ({ nested: { values: [1] } }))
      .transform((v) => ({ ...v, id: 'fixed' }));
    const [a, b2] = changed.buildList(2, p.session());
    a.nested.values.push(2);
    assert.deepEqual(b2.nested.values, [1]);
    assert.equal(a.id, 'fixed');
    assert.throws(() => b.buildList(3, p.session()), RangeError);
  });
  it('preserves native schema parsing, input overrides and one validation entry', async () => {
    let count = 0;
    const s = schema((v) => {
      count++;
      return typeof v.age === 'string'
        ? { value: { age: Number(v.age) } }
        : { issues: [{ message: 'expected text', path: ['age'] }] };
    });
    const p = fakerAdapter(options);
    const b = fromFakerSchema(
      s,
      (f) => ({ age: String(f.number.int({ min: 18, max: 80 })) }),
      options
    );
    assert.equal(b.with({ age: '42' }).build(p.session()).age, '42');
    assert.equal(count, 0);
    assert.deepEqual(b.with({ age: '42' }).buildValidated(p.session()), { age: 42 });
    assert.equal(count, 1);
    assert.throws(() => b.with({ age: 42 }).buildValidated(p.session()), BuilderValidationError);
    assert.equal(count, 2);
    const asyncB = fromFakerSchema(
      schema(async (v) => ({ value: v })),
      async (f) => ({ name: f.person.firstName() }),
      options
    );
    assert.equal(typeof (await asyncB.buildValidatedAsync(p.session())).name, 'string');
  });
  it('retains asynchronous generation and deterministic sequential lists', async () => {
    const p = fakerAdapter(options),
      s = p.session(42),
      before = s.snapshot();
    const b = fromFaker(async (f, execution) => {
      await Promise.resolve();
      return { id: execution.sequence('id', 1), name: f.person.firstName() };
    }, options);
    assert.throws(() => b.build(s), /buildAsync/);
    // The deliberately mistaken synchronous call may already have started a native async factory.
    const fresh = p.session(42);
    const expected = await b.buildListAsync(4, fresh);
    assert.deepEqual(await b.buildListAsync(4, restoreSession(before, p.identity)), expected);
    assert.deepEqual(
      expected.map((v) => v.id),
      [1, 2, 3, 4]
    );
  });
  it('honors draw budgets and propagates application failures without retries', () => {
    const p = fakerAdapter(options);
    assert.throws(
      () => p.instance(p.session(1, { maxOperations: 0 })).string.uuid(),
      SessionBudgetError
    );
    const failure = new Error('factory failed');
    let calls = 0;
    const b = fromFaker(function () {
      assert.equal(this, undefined);
      calls++;
      throw failure;
    }, options);
    assert.throws(
      () => b.build(p.session()),
      (e) => e === failure
    );
    assert.equal(calls, 1);
  });
  it('rejects a missing session with an explicit error before invoking the factory', async () => {
    const missing = { name: 'TypeError', message: /requires an explicit GenerationSession/ };
    let calls = 0;
    const b = fromFaker((f) => {
      calls++;
      return { name: f.person.firstName() };
    }, options);
    assert.throws(() => b.build(), missing);
    assert.throws(() => b.build(undefined), missing);
    assert.throws(() => b.buildList(2), missing);
    await assert.rejects(b.buildListAsync(2), missing);
    assert.throws(() => fakerAdapter(options).instance(), missing);
    const validated = fromFakerSchema(
      schema((v) => ({ value: v })),
      (f) => ({ name: f.person.firstName() }),
      options
    );
    assert.throws(() => validated.buildValidated(), missing);
    assert.throws(() => validated.buildValidatedList(2), missing);
    assert.equal(calls, 0);
    assert.equal(typeof b.build(fakerAdapter(options).session()).name, 'string');
  });
  it('checks configuration and callbacks before doing any generation', () => {
    for (const value of [undefined, {}, { fingerprint: '' }, { fingerprint: 1 }])
      assert.throws(() => fakerAdapter(value), /fingerprint/);
    assert.throws(() => fakerAdapter({ ...options, configuration: 1 }), /configuration/);
    for (const value of [{ locale: en }, { localeIdentity: '' }, { localeIdentity: 1 }])
      assert.throws(() => fakerAdapter({ ...options, ...value }), /localeIdentity/);
    for (const locale of [[], [null], [1]])
      assert.throws(
        () => fakerAdapter({ ...options, locale, localeIdentity: 'custom' }),
        /locale definition/
      );
    assert.throws(() => fromFaker(1, options), /factory/);
    assert.equal(
      fakerAdapter({ ...options, locale: en, localeIdentity: 'en/custom', configuration: 'one' })
        .metadata.localeIdentity,
      'en/custom'
    );
  });
});

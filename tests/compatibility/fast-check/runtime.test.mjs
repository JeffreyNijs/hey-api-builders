import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import * as fc from 'fast-check';
import {
  createBuilder,
  createScenario,
  createSession,
  cloneFixture,
  captureFixture,
  restoreFixture,
  BuilderValidationError,
} from 'mimlet';
import {
  fromArbitrary,
  fromSchemaArbitrary,
  mapFixtureArbitrary,
  schemaFixtureArbitrary,
  scenarioArbitrary,
  checkFixtureProperty,
  checkFixturePropertyAsync,
  replayFixtureProperty,
  replayFixturePropertyAsync,
  PropertyIntegrationError,
  FixturePropertyError,
  assertFixtureProperty,
  assertFixturePropertyAsync,
} from '@mimlet/fast-check';
const identity = { fingerprint: 'fixture/v1', provider: 'tests@1', configuration: 'default' };
const options = { identity, seed: 12345, numRuns: 100 };
const session = () => createSession({ ...identity, seed: 42 });
const schema = (validate) => ({ '~standard': { version: 1, vendor: 'test', validate } });

describe('real shrink-aware property integration', () => {
  it('offers assertions that fail CI without embedding counterexamples in default error metadata', async () => {
    assertFixtureProperty(fc.integer(), () => true, options);
    await assertFixturePropertyAsync(fc.integer(), async () => true, options);
    const check = (error) =>
      error instanceof FixturePropertyError &&
      error.code === 'PROPERTY_FAILED' &&
      error.report.details.failed &&
      !JSON.stringify(error).includes('private-fixture');
    assert.throws(
      () => assertFixtureProperty(fc.constant('private-fixture'), () => false, options),
      check
    );
    await assert.rejects(
      assertFixturePropertyAsync(fc.constant('private-fixture'), async () => false, options),
      check
    );
  });
  it('samples native arbitraries deterministically through explicit sessions', async () => {
    const data = fc.record({ age: fc.integer({ min: 1, max: 100 }), name: fc.string() });
    const builder = fromArbitrary(data);
    assert.deepEqual(builder.buildList(20, session()), builder.buildList(20, session()));
    assert.equal(builder.with({ age: 42 }).build(session()).age, 42);
    const promised = fromArbitrary(fc.constant(Promise.resolve(7)));
    assert.equal(await promised.buildAsync(session()), 7);
    assert.throws(() => promised.build(session()), /buildAsync/);
  });
  it('preserves schema input/output types and applies validation and clone policy once', () => {
    let calls = 0,
      clones = 0;
    const validator = schema(function (value) {
      assert.equal(this.vendor, 'test');
      calls++;
      return { value: { age: Number(value.age) } };
    });
    const builder = fromSchemaArbitrary(validator, fc.constant({ age: '42' }), {
      cloneInput: (value) => {
        clones++;
        return cloneFixture(value);
      },
    });
    assert.deepEqual(builder.buildValidated(session()), { age: 42 });
    assert.equal(calls, 1);
    assert.equal(clones, 1);
    assert.deepEqual(builder.build(session()), { age: '42' });
    assert.equal(calls, 1);
  });
  it('actually shrinks mapped builder fixtures while keeping fixed overrides intact', () => {
    const data = fc.record({ n: fc.integer({ min: 1, max: 10000 }), tag: fc.string() });
    const mapped = mapFixtureArbitrary(data, (input) =>
      createBuilder(() => input)
        .with({ tag: 'fixed' })
        .build()
    );
    const result = checkFixtureProperty(
      mapped,
      (value) => {
        assert.equal(value.tag, 'fixed');
        return value.n < 10;
      },
      options
    );
    assert.equal(result.details.failed, true);
    assert(result.details.numShrinks > 0);
    assert.deepEqual(result.details.counterexample, [{ n: 10, tag: 'fixed' }]);
    const replay = replayFixtureProperty(
      mapped,
      (value) => value.n < 10,
      JSON.parse(JSON.stringify(result.replay)),
      identity
    );
    assert.equal(replay.details.failed, true);
    assert.deepEqual(replay.details.counterexample, result.details.counterexample);
  });
  it('recomputes scenario relationships and totals during structural shrinking', () => {
    const cart = createScenario()
      .node('lines', [], () => [])
      .node('total', ['lines'], ({ lines }) => lines.reduce((sum, n) => sum + n, 0));
    const arb = scenarioArbitrary(
      fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
      (lines) => cart.override('lines', () => lines),
      { ...identity, seed: 1 }
    );
    const result = checkFixtureProperty(
      arb,
      (value) => {
        assert.equal(
          value.total,
          value.lines.reduce((sum, n) => sum + n, 0)
        );
        return value.total < 5;
      },
      options
    );
    assert(result.details.failed);
    assert(result.details.numShrinks > 0);
    assert.deepEqual(result.details.counterexample, [{ lines: [5], total: 5 }]);
  });
  it('clones source inputs before mapping so mutation does not corrupt shrink context', () => {
    const original = { values: [1, 2] };
    const mapped = mapFixtureArbitrary(fc.constant(original), (value) => {
      value.values.push(3);
      return value;
    });
    assert.deepEqual(
      fc.sample(mapped, { seed: 1, numRuns: 3 }),
      Array.from({ length: 3 }, () => ({ values: [1, 2, 3] }))
    );
    assert.deepEqual(original, { values: [1, 2] });
    const native = () => 1;
    assert.equal(
      fc.sample(
        mapFixtureArbitrary(fc.constant(native), (value) => value, { clone: (value) => value }),
        { seed: 1, numRuns: 1 }
      )[0],
      native
    );
  });
  it('supports an explicit unmapper for user-supplied counterexamples', () => {
    const mapped = mapFixtureArbitrary(fc.integer({ min: 0, max: 100 }), (n) => ({ n }), {
      unmapper: (value) => {
        if (!value || typeof value.n !== 'number') throw new Error('unsupported');
        return value.n;
      },
    });
    assert(mapped.canShrinkWithoutContext({ n: 50 }));
    assert(!mapped.canShrinkWithoutContext('wrong'));
    const shrinks = [...mapped.shrink({ n: 50 }, undefined)].map((value) => value.value);
    assert(shrinks.some((value) => value.n === 0));
  });
  it('validates every mapped candidate once without silently retrying rejected schema inputs', async () => {
    let calls = 0;
    const validator = schema((value) => {
      calls++;
      return value >= 0
        ? { value: String(value) }
        : { issues: [{ message: 'negative', path: [] }] };
    });
    assert.deepEqual(
      fc.sample(schemaFixtureArbitrary(validator, fc.constant(1)), { seed: 1, numRuns: 2 }),
      ['1', '1']
    );
    assert.equal(calls, 2);
    assert.throws(
      () => fc.sample(schemaFixtureArbitrary(validator, fc.constant(-1)), { seed: 1, numRuns: 1 }),
      BuilderValidationError
    );
    assert.equal(calls, 3);
    assert.throws(() => schemaFixtureArbitrary({}, fc.integer()), PropertyIntegrationError);
    assert.throws(
      () =>
        fc.sample(
          schemaFixtureArbitrary(
            schema(() => Promise.reject(new Error('observed'))),
            fc.constant(1)
          ),
          { seed: 1, numRuns: 1 }
        ),
      /async property/
    );
    assert.throws(
      () =>
        fc.sample(
          mapFixtureArbitrary(fc.constant(1), () => Promise.reject(new Error('observed'))),
          { seed: 1, numRuns: 1 }
        ),
      /synchronous/
    );
    await setImmediate();
  });
  it('runs and replays asynchronous predicates without disabling shrinking', async () => {
    const arb = fc.integer({ min: 0, max: 100 });
    const predicate = async (n) => {
      await setImmediate();
      return n < 10;
    };
    const result = await checkFixturePropertyAsync(arb, predicate, options);
    assert(result.details.failed);
    assert.deepEqual(result.details.counterexample, [10]);
    const replay = await replayFixturePropertyAsync(arb, predicate, result.replay, identity);
    assert.deepEqual(replay.details.counterexample, [10]);
    assert.equal(
      (await checkFixturePropertyAsync(arb, async () => true, options)).details.failed,
      false
    );
  });
  it('reports successful runs and exhausted preconditions without fabricating a replay', () => {
    assert.equal(checkFixtureProperty(fc.integer(), () => true, options).details.failed, false);
    assert.equal(checkFixtureProperty(fc.integer(), () => true, options).replay, undefined);
    const exhausted = checkFixtureProperty(
      fc.integer(),
      () => {
        fc.pre(false);
      },
      { ...options, maxSkipsPerRun: 0 }
    );
    assert(exhausted.details.failed);
    assert.equal(exhausted.replay, undefined);
    assert.equal(
      checkFixtureProperty(fc.integer(), () => true, { identity, seed: 1 }).details.numRuns,
      100
    );
  });
  it('validates seeds, budgets, identities, and replay compatibility', () => {
    const arb = fc.integer({ min: 0, max: 100 });
    const baseline = checkFixtureProperty(arb, () => false, options).replay;
    for (const overrides of [
      { seed: NaN },
      { seed: 0x80000000 },
      { seed: -0x80000001 },
      { numRuns: 0 },
      { numRuns: 1_000_001 },
      { maxSkipsPerRun: -1 },
      { maxSkipsPerRun: 10_001 },
    ])
      assert.throws(
        () => checkFixtureProperty(arb, () => true, { ...options, ...overrides }),
        RangeError
      );
    for (const id of [
      null,
      {},
      { fingerprint: 'x', provider: '' },
      { fingerprint: '', provider: 'x' },
      { fingerprint: 'x', provider: 'y', configuration: 1 },
    ])
      assert.throws(
        () => checkFixtureProperty(arb, () => true, { seed: 1, identity: id }),
        PropertyIntegrationError
      );
    for (const replay of [
      null,
      { ...baseline, version: 2 },
      { ...baseline, engine: 'other' },
      { ...baseline, identity: null },
      { ...baseline, path: 'bad' },
      { ...baseline, path: '0'.repeat(100001) },
      { ...baseline, identity: { ...identity, fingerprint: 'other' } },
      { ...baseline, identity: { ...identity, provider: 'other' } },
      { ...baseline, identity: { ...identity, configuration: 'other' } },
    ])
      assert.throws(
        () => replayFixtureProperty(arb, () => false, replay, identity),
        PropertyIntegrationError
      );
    const noConfig = { fingerprint: 'x', provider: 'y' };
    const result = checkFixtureProperty(arb, () => false, { seed: 1, identity: noConfig });
    assert(replayFixtureProperty(arb, () => false, result.replay, noConfig).details.failed);
  });
  it('does not silently inherit process-global fast-check options', () => {
    fc.configureGlobal({ numRuns: 17 });
    try {
      assert.throws(
        () => checkFixtureProperty(fc.integer(), () => true, options),
        PropertyIntegrationError
      );
      assert.throws(() => fromArbitrary(fc.integer()).build(session()), PropertyIntegrationError);
      assert.equal(
        fc.sample(
          mapFixtureArbitrary(fc.constant(1), (n) => n),
          { seed: 1, numRuns: 1 }
        )[0],
        1
      );
    } finally {
      fc.resetConfigureGlobal();
    }
  });
  it('property-checks core clone and capture invariants over generated data', () => {
    const values = fc.oneof(
      fc.jsonValue(),
      fc.bigInt(),
      fc.date({ noInvalidDate: false }),
      fc.uint8Array()
    );
    fc.assert(
      fc.property(values, (value) => {
        const copy = cloneFixture(value);
        assert.deepEqual(copy, value);
        assert.deepEqual(restoreFixture(captureFixture(value)), value);
      }),
      { seed: 894, numRuns: 250 }
    );
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 30 }), (values) => {
        const base = createBuilder(() => ({ values: [] }));
        const changed = base.withFactory(() => ({ values: [...values] }));
        assert.deepEqual(base.build(), { values: [] });
        const first = changed.build();
        first.values.push(999);
        assert.deepEqual(changed.build(), { values });
      }),
      { seed: 345, numRuns: 250 }
    );
  });
});

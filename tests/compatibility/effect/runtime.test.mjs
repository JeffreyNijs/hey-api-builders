import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as S from 'effect/Schema';
import * as E from 'effect/Effect';
import * as FC from 'effect/FastCheck';
import {
  fromEffect,
  fromEffectAsync,
  fromEffectFactory,
  effectAdapter,
} from '@jeffreynijs/test-builders-effect';
import { createSession, BuilderValidationError } from '@jeffreynijs/test-builders';
const session = () =>
  createSession({ seed: 42, fingerprint: 'effect-corpus/v1', provider: 'effect@3.22.2' });
describe('Effect native adapter', () => {
  it('generates input via native output arbitrary and encoder', () => {
    const schema = S.Struct({ age: S.NumberFromString, label: S.NonEmptyString });
    const b = fromEffect(schema);
    const input = b.build(session());
    assert.equal(typeof input.age, 'string');
    const parsed = b.with({ age: '42' }).buildValidated(session());
    assert.equal(parsed.age, 42);
    assert.ok(parsed.label.length > 0);
  });
  it('retains native Date values and codec operations, without JSON conversion', async () => {
    let decode = 0,
      encode = 0;
    const schema = S.transform(S.Number, S.DateFromSelf, {
      strict: true,
      decode: (v) => {
        decode++;
        return new Date(v);
      },
      encode: (v) => {
        encode++;
        return v.getTime();
      },
    });
    const adapter = effectAdapter(schema);
    assert.equal(adapter.source, schema);
    assert.ok(adapter.outputArbitrary() === adapter.outputArbitrary());
    assert.equal(adapter.checkInput(1), true);
    assert.equal(adapter.checkInput('bad'), false);
    assert.equal(adapter.checkOutput(new Date(1)), true);
    assert.equal(adapter.checkOutput('bad'), false);
    assert.equal(adapter.decode(1).getTime(), 1);
    assert.equal((await adapter.decodeAsync(2)).getTime(), 2);
    assert.equal(adapter.encode(new Date(3)), 3);
    assert.equal(await adapter.encodeAsync(new Date(4)), 4);
    decode = 0;
    encode = 0;
    const b = fromEffect(schema);
    const value = b.replace(1000).buildValidated(session());
    assert.equal(value.getTime(), 1000);
    assert.equal(decode, 1);
    assert.equal(encode, 1);
  });
  it('reproduces sessions and respects explicit list budgets', () => {
    const b = fromEffect(S.Int, { maxListSize: 3 });
    assert.deepEqual(b.buildList(3, session()), b.buildList(3, session()));
    assert.throws(() => b.buildList(4, session()), RangeError);
  });
  it('preserves real native shrinking and re-encodes shrunk values', () => {
    const schema = S.compose(S.NumberFromString, S.Int.pipe(S.between(0, 100)));
    const a = effectAdapter(schema);
    const report = FC.check(
      FC.property(a.inputArbitrary(), (input) => Number(input) < 5),
      { seed: 1, numRuns: 100 }
    );
    assert.equal(report.failed, true);
    assert.deepEqual(report.counterexample, ['5']);
    assert.ok(report.numShrinks > 0);
    assert.equal(a.decode(report.counterexample[0]), 5);
    assert.equal(a.metadata.shrinking, 'native-fast-check-3');
  });
  it('uses custom factories without eagerly requiring an arbitrary or inverse', () => {
    const failure = new Error('one-way encoder');
    const schema = S.transform(S.String, S.Number, {
      strict: true,
      decode: (v) => Number(v),
      encode: () => {
        throw failure;
      },
    });
    assert.equal(fromEffectFactory(schema, (n) => String(n)).buildValidated(42), 42);
    assert.throws(
      () => fromEffect(schema).build(session()),
      (e) => e === failure
    );
  });
  it('retains async custom factory arguments and validation', async () => {
    const b = fromEffectFactory(S.NumberFromString, async (value) => value);
    assert.equal(await b.buildValidatedAsync('42'), 42);
    assert.deepEqual(await b.buildValidatedListAsync(2, '7'), [7, 7]);
    await assert.rejects(b.buildValidatedAsync('no'), BuilderValidationError);
  });
  it('supports explicit asynchronous native encoding and decoding', async () => {
    let encodes = 0,
      decodes = 0;
    const schema = S.transformOrFail(S.String, S.Number, {
      strict: true,
      decode: (value) =>
        E.promise(async () => {
          decodes++;
          return Number(value);
        }),
      encode: (value) =>
        E.promise(async () => {
          encodes++;
          return String(value);
        }),
    });
    const b = fromEffectAsync(schema);
    const result = await b.replace('42').buildValidatedAsync(session());
    assert.equal(result, 42);
    assert.equal(encodes, 1);
    assert.equal(decodes, 1);
    assert.equal(typeof (await b.buildAsync(session())), 'string');
  });
  it('rejects invalid overrides and default excess properties without repairing them', () => {
    const schema = S.Struct({ age: S.Number });
    const b = fromEffect(schema);
    assert.throws(() => b.with({ age: 'bad' }).buildValidated(session()), BuilderValidationError);
    assert.throws(() => b.with({ extra: true }).buildValidated(session()), BuilderValidationError);
    const nativeStrip = fromEffect(schema, { parseOptions: { onExcessProperty: 'ignore' } });
    assert.deepEqual(nativeStrip.replace({ age: 1, extra: true }).buildValidated(session()), {
      age: 1,
    });
  });
  it('guards hidden native global configuration without mutating it', () => {
    FC.configureGlobal({ seed: 11 });
    try {
      assert.throws(() => fromEffect(S.Int).build(session()), /unmodified/);
    } finally {
      FC.resetConfigureGlobal();
    }
    assert.equal(typeof fromEffect(S.Int).build(session()), 'number');
  });
});

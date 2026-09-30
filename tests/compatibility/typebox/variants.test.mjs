import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Type from 'typebox';
import { Type as Legacy } from '@sinclair/typebox';
import * as modern from '@mimlet/typebox';
import * as legacy from '@mimlet/typebox-legacy';
import { BuilderGenerationError, BuilderValidationError, createSchemaBuilder } from 'mimlet';

for (const [name, T, api] of [
  ['modern', Type, modern],
  ['legacy', Legacy, legacy],
]) {
  const Cat = T.Object({ kind: T.Literal('cat'), lives: T.Integer({ default: 9 }) });
  const Dog = T.Object({ kind: T.Literal('dog'), bark: T.Boolean({ default: true }) });
  const Pet = T.Union([Cat, Dog]);
  describe(`${name}: complete native union variants`, () => {
    it('constructs a complete branch without carrying properties from a different variant', () => {
      const dogs = api.fromTypeBoxVariant(Pet, 1);
      assert.deepEqual(dogs.build(), { kind: 'dog', bark: true });
      assert.deepEqual(dogs.with({ bark: false }).buildValidated(), { kind: 'dog', bark: false });
      assert.deepEqual(api.fromTypeBoxVariant(Pet, 0).buildValidated(), { kind: 'cat', lives: 9 });
      assert.deepEqual(dogs.build(), { kind: 'dog', bark: true });
    });
    it('rejects invalid indexes and missing branch schemas at configuration time', () => {
      for (const index of [-1, 2, 0.5, NaN, Infinity, '1']) {
        assert.throws(() => api.fromTypeBoxVariant(Pet, index), /variant index/);
      }
      for (const source of [null, {}, { anyOf: 'not-an-array' }, { anyOf: new Array(2) }]) {
        assert.throws(() => api.fromTypeBoxVariant(source, 0), /variant index/);
      }
      for (const variant of [null, false, 'schema']) {
        assert.throws(() => api.fromTypeBoxVariant({ anyOf: [variant] }, 0), /variant schema/);
      }
    });
    it('rejects a valid but different variant in validation and encoding', () => {
      const adapter = api.typeBoxVariantAdapter(Pet, 1);
      assert.equal(adapter.source, Pet);
      assert.equal(adapter.variantSource, Dog);
      assert.equal(adapter.metadata.variant, 1);
      assert.equal(adapter.check({ kind: 'dog', bark: true }), true);
      assert.equal(adapter.check({ kind: 'cat', lives: 9 }), false);
      assert.ok(adapter.issues({ kind: 'cat', lives: 9 }).length > 0);
      assert.deepEqual(adapter.issues({ kind: 'dog', bark: true }), []);
      assert.throws(() => adapter.encode({ kind: 'cat', lives: 9 }), BuilderValidationError);
      assert.throws(() => adapter.decode({ kind: 'cat', lives: 9 }), BuilderValidationError);
      assert.throws(
        () => api.fromTypeBoxVariant(Pet, 1).replace({ kind: 'cat', lives: 9 }).buildValidated(),
        BuilderValidationError
      );
    });
    it('retains root codec semantics and executes decoding once', () => {
      let calls = 0;
      const rootCodec = name === 'modern' ? T.Codec(Pet) : T.Transform(Pet);
      const coded = rootCodec
        .Decode((value) => {
          calls++;
          return { pet: value };
        })
        .Encode((value) => value.pet);
      const dogs = api.fromTypeBoxVariant(coded, 1);
      assert.deepEqual(dogs.build(), { kind: 'dog', bark: true });
      assert.equal(calls, 0);
      assert.deepEqual(dogs.buildValidated(), { pet: { kind: 'dog', bark: true } });
      assert.equal(calls, 1);
      const adapter = api.typeBoxVariantAdapter(coded, 1);
      assert.deepEqual(adapter.decode({ kind: 'dog', bark: false }), {
        pet: { kind: 'dog', bark: false },
      });
      assert.equal(calls, 2);
      assert.deepEqual(adapter.encode({ pet: { kind: 'dog', bark: true } }), {
        kind: 'dog',
        bark: true,
      });
      assert.equal(calls, 2);
      assert.throws(
        () => adapter.encode({ pet: { kind: 'cat', lives: 9 } }),
        BuilderValidationError
      );
    });
    it('preserves native decoding failures without retrying the factory or another branch', () => {
      let calls = 0;
      const codec = name === 'modern' ? T.Codec(Pet) : T.Transform(Pet);
      const source = codec
        .Decode(() => {
          calls++;
          throw new Error('decode rejected');
        })
        .Encode(() => ({ kind: 'dog', bark: true }));
      assert.throws(() => api.fromTypeBoxVariant(source, 1).buildValidated(), /decode rejected/);
      assert.equal(calls, 1);
    });
    it('provides an explicit factory escape hatch when native creation cannot satisfy a variant', async () => {
      const Impossible = T.Union([T.Never(), Dog]);
      assert.throws(() => api.fromTypeBoxVariant(Impossible, 0).build(), BuilderGenerationError);
      const adapter = api.typeBoxVariantAdapter(Pet, 1);
      const custom = createSchemaBuilder(adapter.standard, async (bark) => ({ kind: 'dog', bark }));
      assert.deepEqual(await custom.buildValidatedAsync(false), { kind: 'dog', bark: false });
    });
    it('supports scalar and absent variants and carries list budgets through async chains', async () => {
      const source = T.Union([T.Null(), T.String()]);
      assert.equal(api.fromTypeBoxVariant(source, 0).buildValidated(), null);
      assert.equal(api.fromTypeBoxVariant(source, 1).with('named').buildValidated(), 'named');
      const dogs = api.fromTypeBoxVariant(Pet, 1, { maxListSize: 1 });
      assert.throws(() => dogs.buildList(2), RangeError);
      assert.deepEqual(await dogs.transformAsync(async (v) => v).buildValidatedListAsync(1), [
        { kind: 'dog', bark: true },
      ]);
    });
  });
}

describe('union container constraints and references', () => {
  it('does not discard modern union-level constraints during branch creation or validation', () => {
    const source = Type.Union(
      [Type.String({ default: 'short' }), Type.String({ default: 'long-enough' })],
      { minLength: 10 }
    );
    const first = modern.typeBoxVariantAdapter(source, 0);
    assert.equal(first.check('short'), false);
    assert.ok(first.issues('short').length > 0);
    assert.throws(() => first.create(), BuilderGenerationError);
    assert.throws(() => first.decode('short'), BuilderValidationError);
    assert.throws(
      () => createSchemaBuilder(first.standard, () => 'short').buildValidated(),
      BuilderValidationError
    );
    assert.equal(modern.fromTypeBoxVariant(source, 1).buildValidated(), 'long-enough');
  });
  it('preserves modern named reference contexts for the chosen branch', () => {
    const source = Type.Union([Type.Ref('Pet'), Type.Null()]);
    const context = { Pet: Type.Object({ id: Type.String({ default: 'one' }) }) };
    assert.deepEqual(modern.fromTypeBoxVariant(source, 0, { context }).buildValidated(), {
      id: 'one',
    });
  });
  it('preserves explicitly supplied legacy references and reference-array ownership', () => {
    const target = Legacy.Object({ id: Legacy.String({ default: 'one' }) }, { $id: 'Pet' });
    const source = Legacy.Union([Legacy.Ref(target), Legacy.Null()]);
    const references = Object.freeze([target, source]);
    assert.deepEqual(legacy.fromTypeBoxVariant(source, 0, { references }).buildValidated(), {
      id: 'one',
    });
    assert.deepEqual(references, [target, source]);
  });
});

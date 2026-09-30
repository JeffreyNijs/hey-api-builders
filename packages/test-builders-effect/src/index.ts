import * as Schema from 'effect/Schema';
import * as Arbitrary from 'effect/Arbitrary';
import * as FastCheck from 'effect/FastCheck';
import type * as AST from 'effect/SchemaAST';
import { createSchemaBuilder } from '@jeffreynijs/test-builders';
import type {
  GenerationSession,
  SchemaBuilder,
  AsyncSchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  StandardSchemaV1,
} from '@jeffreynijs/test-builders';

export interface EffectOptions extends SchemaBuilderConfig {
  /** Native parse options; default rejects excess object properties. */
  readonly parseOptions?: AST.ParseOptions;
}
function sample<A>(arbitrary: FastCheck.Arbitrary<A>, session: GenerationSession): A {
  if (Object.keys(FastCheck.readConfigureGlobal()).length !== 0) {
    throw new TypeError(
      'Deterministic Effect sampling requires unmodified native fast-check configuration'
    );
  }
  return FastCheck.sample(arbitrary, {
    seed: session.integer(-0x80000000, 0x7fffffff),
    numRuns: 1,
  })[0] as A;
}
/** Effect 3's native arbitrary/encoder path preserves declarations that JSON cannot represent. */
export function effectAdapter<A, I>(
  source: Schema.Schema<A, I, never>,
  options: EffectOptions = {}
) {
  const parseOptions = Object.freeze({
    onExcessProperty: 'error' as const,
    ...options.parseOptions,
  });
  // Publish the shared structural contract, not Effect's transitive CJS type intersection.
  const standard: StandardSchemaV1<I, A> = Schema.standardSchemaV1(source, parseOptions);
  const decode = Schema.decodeUnknownSync(source, parseOptions);
  const decodeAsync = Schema.decodeUnknownPromise(source, parseOptions);
  const encode = Schema.encodeSync(source, parseOptions);
  const encodeAsync = Schema.encodePromise(source, parseOptions);
  // Lazy preparation keeps arbitrary derivation optional for custom-factory consumers.
  let output: FastCheck.Arbitrary<A> | undefined;
  const outputArbitrary = () => (output ??= Arbitrary.make(source));
  return Object.freeze({
    source,
    standard,
    decode,
    decodeAsync,
    encode,
    encodeAsync,
    checkInput: Schema.is(Schema.encodedBoundSchema(source), parseOptions),
    checkOutput: Schema.is(Schema.typeSchema(source), parseOptions),
    outputArbitrary,
    /** Native fast-check 3 arbitrary: each shrink is re-encoded through the original schema. */
    inputArbitrary: () => outputArbitrary().map((value) => encode(value)),
    create: (session: GenerationSession) => encode(sample(outputArbitrary(), session)),
    createAsync: (session: GenerationSession) => encodeAsync(sample(outputArbitrary(), session)),
    metadata: Object.freeze({
      vendor: 'effect',
      version: '3.22.2',
      arbitraryVersion: FastCheck.__version,
      generation: 'native-output-then-encode',
      shrinking: 'native-fast-check-3',
    }),
  });
}
/** Deterministic native generation requires an explicit session; codecs must encode synchronously. */
export function fromEffect<A, I>(
  source: Schema.Schema<A, I, never>,
  options: EffectOptions = {}
): SchemaBuilder<I, A, [session: GenerationSession]> {
  const adapter = effectAdapter(source, options);
  return createSchemaBuilder(adapter.standard, adapter.create, options) as unknown as SchemaBuilder<
    I,
    A,
    [session: GenerationSession]
  >;
}
/** Native asynchronous encoding, followed by asynchronous-capable decoding only when requested. */
export function fromEffectAsync<A, I>(
  source: Schema.Schema<A, I, never>,
  options: EffectOptions = {}
): AsyncSchemaBuilder<I, A, [session: GenerationSession]> {
  const adapter = effectAdapter(source, options);
  return createSchemaBuilder(
    adapter.standard,
    adapter.createAsync,
    options
  ) as unknown as AsyncSchemaBuilder<I, A, [session: GenerationSession]>;
}
/** Escape hatch for one-way codecs, service-provided data or unsupported native arbitrary derivation. */
export function fromEffectFactory<
  A,
  I,
  F extends (...args: never[]) => NoInfer<I> | PromiseLike<NoInfer<I>>,
>(
  source: Schema.Schema<A, I, never>,
  factory: F,
  options: EffectOptions = {}
): SchemaBuilderFor<StandardSchemaV1<I, A>, F> {
  return createSchemaBuilder(effectAdapter(source, options).standard, factory, options);
}

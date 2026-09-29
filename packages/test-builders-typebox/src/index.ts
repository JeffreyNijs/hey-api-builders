import type { StaticDecode, StaticEncode, TProperties, TSchema } from 'typebox';
import * as Value from 'typebox/value';
import {
  BuilderGenerationError,
  BuilderValidationError,
  createSchemaBuilder,
} from '@jeffreynijs/test-builders';
import type {
  SchemaBuilderConfig,
  SchemaBuilderFor,
  StandardSchemaV1,
  ValidationIssue,
} from '@jeffreynijs/test-builders';

export interface TypeBoxOptions<
  Context extends TProperties = Record<never, never>,
> extends SchemaBuilderConfig {
  /** Native named reference context. No reference is fetched from the network. */
  readonly context?: Context;
}
function path(pointer: string): string[] {
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Preserve native codecs and references instead of reducing the schema to JSON. */
export function typeBoxAdapter<S extends TSchema, C extends TProperties = Record<never, never>>(
  source: S,
  options: TypeBoxOptions<C> = {}
) {
  type Input = StaticEncode<S, C>;
  type Output = StaticDecode<S, C>;
  const context: C = { ...options.context } as C;
  const check = (value: unknown): value is Input => Value.Check(context, source, value);
  const issues = (value: unknown): ValidationIssue[] =>
    Value.Errors(context, source, value).map((error) => ({
      message: error.message,
      path: path(error.instancePath),
    }));
  const decodeChecked = (value: Input): Output =>
    Value.DecodeUnsafe(context, source, Value.Clone(value)) as Output;
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/typebox',
      validate(value) {
        if (!check(value)) {
          return { issues: issues(value) };
        }
        // Deliberately bypass Decode's Default/Convert/Clean pipeline AFTER checking.
        return { value: decodeChecked(value) };
      },
    },
  };
  return Object.freeze({
    source,
    standard,
    metadata: Object.freeze({
      generation: 'native-defaults' as const,
      validation: 'native-strict' as const,
    }),
    check,
    decode(value: Input): Output {
      if (!check(value)) {
        throw new BuilderValidationError(issues(value));
      }
      return decodeChecked(value);
    },
    encode(value: Output): Input {
      const encoded = Value.EncodeUnsafe(context, source, Value.Clone(value));
      if (!check(encoded)) {
        throw new BuilderValidationError(issues(encoded));
      }
      return encoded;
    },
    create(): Input {
      try {
        const value: unknown = Value.Clone(Value.Create(context, source));
        if (!check(value)) {
          throw new BuilderValidationError(issues(value));
        }
        return value;
      } catch (cause) {
        throw new BuilderGenerationError(
          'TypeBox could not create a valid default fixture; supply fromTypeBoxFactory() for this schema',
          cause
        );
      }
    },
  });
}

/** Generate native TypeBox defaults. This is deterministic creation, not random sampling. */
export function fromTypeBox<S extends TSchema, C extends TProperties = Record<never, never>>(
  schema: S,
  options: TypeBoxOptions<C> = {}
): SchemaBuilderFor<
  StandardSchemaV1<StaticEncode<S, C>, StaticDecode<S, C>>,
  () => StaticEncode<S, C>
> {
  const adapter = typeBoxAdapter(schema, options);
  return createSchemaBuilder(adapter.standard, () => adapter.create(), options);
}

/** Use a custom sync/async factory without losing encoded/decoded types or arguments. */
export function fromTypeBoxFactory<
  S extends TSchema,
  C extends TProperties = Record<never, never>,
  F extends (
    ...args: never[]
  ) => NoInfer<StaticEncode<S, C>> | PromiseLike<NoInfer<StaticEncode<S, C>>> = () => StaticEncode<
    S,
    C
  >,
>(
  schema: S,
  factory: F,
  options: TypeBoxOptions<C> = {}
): SchemaBuilderFor<StandardSchemaV1<StaticEncode<S, C>, StaticDecode<S, C>>, F> {
  return createSchemaBuilder(typeBoxAdapter(schema, options).standard, factory, options);
}

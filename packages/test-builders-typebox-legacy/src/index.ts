import type { StaticDecode, StaticEncode, TSchema } from '@sinclair/typebox';
import * as Value from '@sinclair/typebox/value';
import {
  BuilderGenerationError,
  BuilderValidationError,
  createSchemaBuilder,
} from '@jeffreynijs/test-builders';
import type {
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  StandardSchemaV1,
  ValidationIssue,
} from '@jeffreynijs/test-builders';

export interface TypeBoxOptions extends SchemaBuilderConfig {
  /** Explicit native references. Remote fetching is never performed. */
  readonly references?: ReadonlyArray<TSchema>;
}
function path(pointer: string): string[] {
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** Native @sinclair/typebox adapter. Never translates Transform into a lossy JSON schema. */
export function typeBoxAdapter<S extends TSchema>(source: S, options: TypeBoxOptions = {}) {
  type Input = StaticEncode<S>;
  type Output = StaticDecode<S>;
  const references = [...(options.references ?? [])];
  const check = (value: unknown): value is Input => Value.Check(source, references, value);
  const issues = (value: unknown): ValidationIssue[] =>
    [...Value.Errors(source, references, value)].map((error) => ({
      message: error.message,
      path: path(error.path),
    }));
  const decodeChecked = (value: Input): Output =>
    Value.Decode(source, references, Value.Clone(value));
  const standard: StandardSchemaV1<Input, Output> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/typebox-legacy',
      validate(value) {
        if (!check(value)) {
          return { issues: issues(value) };
        }
        // Legacy Decode checks and executes Transform callbacks; it does not repair input.
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
      return Value.Encode(source, references, Value.Clone(value));
    },
    create(): Input {
      try {
        const value: unknown = Value.Clone(Value.Create(source, references));
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
export function fromTypeBox<S extends TSchema>(
  schema: S,
  options: TypeBoxOptions = {}
): SchemaBuilder<StaticEncode<S>, StaticDecode<S>> {
  const adapter = typeBoxAdapter(schema, options);
  return createSchemaBuilder(adapter.standard, () => adapter.create(), options);
}
export function fromTypeBoxFactory<
  S extends TSchema,
  F extends (...args: never[]) => NoInfer<StaticEncode<S>> | PromiseLike<NoInfer<StaticEncode<S>>>,
>(
  schema: S,
  factory: F,
  options: TypeBoxOptions = {}
): SchemaBuilderFor<StandardSchemaV1<StaticEncode<S>, StaticDecode<S>>, F> {
  return createSchemaBuilder(typeBoxAdapter(schema, options).standard, factory, options);
}

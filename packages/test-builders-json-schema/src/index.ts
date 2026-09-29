import { Ajv, type ErrorObject } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formatsModule from 'ajv-formats';
import { generateSync, type JsonSchema as ProviderSchema } from 'json-schema-faker';
import { createSchemaBuilder, createSession, SessionBudgetError } from '@jeffreynijs/test-builders';
import type {
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaInput,
  SchemaOutput,
  SessionKey,
  StandardJSONSchemaV1,
  StandardSchemaV1,
  ValidationIssue,
} from '@jeffreynijs/test-builders';
import {
  copyJson,
  draft7ValidationSchema,
  dialect,
  fingerprint,
  limits,
  prepare,
  SchemaGenerationError,
  SchemaPreparationError,
  unpointer,
  type JsonSchema,
  type SchemaDialect,
  type SchemaLimits,
} from './schema.js';
export { SchemaGenerationError, SchemaPreparationError } from './schema.js';
export type { JsonSchema, SchemaDialect, SchemaLimits } from './schema.js';
export interface SampleRandom {
  next(): number;
  int(minimum: number, maximum: number): number;
  bool(probability?: number): boolean;
  pick<T>(values: readonly T[]): T;
}
export type GenerationProfile = 'minimal' | 'defaults' | 'examples' | 'random';
export interface JsonSchemaOptions extends SchemaLimits, SchemaBuilderConfig {
  readonly dialect?: SchemaDialect;
  readonly profile?: GenerationProfile;
  /** Exact URI -> in-memory schema. No network or filesystem resolver is installed. */
  readonly references?: Readonly<Record<string, JsonSchema>>;
  /** Trusted synchronous callbacks. Validation and generation must agree on each format. */
  readonly formats?: Readonly<
    Record<
      string,
      {
        readonly validate: (value: string) => boolean;
        readonly generate: (random: SampleRandom) => string;
      }
    >
  >;
  /** Required when custom callbacks participate in replay identity. */
  readonly formatsIdentity?: string;
}
export interface JsonSchemaIssue extends ValidationIssue {
  readonly keyword: string;
  readonly schemaPath: string;
}
function issues(errors: ErrorObject[] | null | undefined): JsonSchemaIssue[] {
  return (errors ?? []).map((error) => ({
    message: error.message ?? 'JSON Schema validation failed',
    path: [
      ...unpointer(error.instancePath),
      ...(error.keyword === 'required'
        ? [String(error.params.missingProperty)]
        : error.keyword === 'additionalProperties'
          ? [String(error.params.additionalProperty)]
          : []),
    ],
    keyword: error.keyword,
    schemaPath: error.schemaPath,
  }));
}
/** Prepare once, generate many. Schemas are data snapshots; callbacks remain trusted code. */
export function jsonSchemaAdapter(schema: JsonSchema, options: JsonSchemaOptions = {}) {
  const maximum = limits(options);
  const source = copyJson(schema, maximum) as JsonSchema;
  const selected = dialect(source, options.dialect);
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'defaults', 'examples', 'random'].includes(profile)) {
    throw new TypeError('Unknown generation profile');
  }
  const references = copyJson(options.references ?? {}, maximum) as Record<string, JsonSchema>;
  const customFormats = { ...options.formats };
  if (
    Object.keys(customFormats).length > 0 &&
    (typeof options.formatsIdentity !== 'string' || !options.formatsIdentity)
  ) {
    throw new TypeError('Custom formats require an explicit formatsIdentity for reproducibility');
  }
  const validator = new (selected === 'draft-07' ? Ajv : Ajv2020)({
    allErrors: true,
    strict: true,
    strictSchema: false,
    strictTypes: false,
    strictRequired: false,
    strictTuples: false,
    allowUnionTypes: true,
    ownProperties: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    validateFormats: true,
    logger: false,
  });
  // ajv-formats is CommonJS; NodeNext represents its default through the module type.
  const addFormats = formatsModule as unknown as (instance: Ajv) => void;
  addFormats(validator);
  const generators: Record<string, (random: SampleRandom) => string> = {};
  for (const [name, format] of Object.entries(customFormats)) {
    if (!format || typeof format.validate !== 'function' || typeof format.generate !== 'function') {
      throw new TypeError('Formats require synchronous validate and generate functions');
    }
    const validate = format.validate;
    const generate = format.generate;
    validator.addFormat(name, {
      type: 'string',
      validate(value: string) {
        const result = validate(value);
        if (typeof result !== 'boolean') {
          throw new TypeError('Format validation must return a boolean synchronously');
        }
        return result;
      },
    });
    Object.defineProperty(generators, name, {
      enumerable: true,
      value: (random: SampleRandom) => {
        const result = generate(random);
        if (typeof result !== 'string') {
          throw new TypeError('Format generation must return a string synchronously');
        }
        return result;
      },
    });
  }
  const knownFormats = new Set(Object.keys(validator.formats));
  const sampling = prepare(source, selected, maximum, knownFormats);
  const normalizedReferences = new Map<string, JsonSchema>();
  for (const [uri, reference] of Object.entries(references)) {
    if (!uri || uri.includes('#')) {
      throw new SchemaPreparationError(
        'Reference keys must be nonempty document URIs without fragments',
        ''
      );
    }
    const document = prepare(reference, selected, maximum, knownFormats);
    normalizedReferences.set(uri, document);
    try {
      validator.addSchema(
        selected === 'draft-07' ? draft7ValidationSchema(reference) : reference,
        uri
      );
    } catch (cause) {
      throw new SchemaPreparationError('Invalid referenced schema', '', { cause });
    }
  }
  let validate;
  try {
    validate = validator.compile(selected === 'draft-07' ? draft7ValidationSchema(source) : source);
  } catch (cause) {
    throw new SchemaPreparationError('Schema compilation failed', '', { cause });
  }
  const compiled = validate;
  const identity = Object.freeze({
    fingerprint: fingerprint({ schema: source, references }),
    provider: 'json-schema-faker@0.6.3+ajv@8.20.0',
    configuration: fingerprint({
      profile,
      selected,
      maximum,
      formats: options.formatsIdentity ?? '',
    }),
  });
  const session = (seed: SessionKey = 1): GenerationSession => createSession({ ...identity, seed });
  const check = (value: unknown): boolean => {
    try {
      copyJson(value, maximum, false);
    } catch {
      return false;
    }
    return compiled(value) as boolean;
  };
  const inspectIssues = (value: unknown): JsonSchemaIssue[] => {
    try {
      copyJson(value, maximum, false);
    } catch {
      return [
        { message: 'Expected bounded JSON input', keyword: 'jsonData', schemaPath: '', path: [] },
      ];
    }
    compiled(value);
    return issues(compiled.errors);
  };
  const standard: StandardSchemaV1<unknown> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/json-schema',
      validate(value) {
        // Reject non-JSON values and oversized/cyclic data before the compiled validator.
        let candidate;
        try {
          candidate = copyJson(value, maximum, false);
        } catch {
          return { issues: [{ message: 'Expected bounded JSON input' }] };
        }
        return check(candidate) ? { value: candidate } : { issues: issues(compiled.errors) };
      },
    },
  };
  function create(execution: GenerationSession = session()): unknown {
    const stream = execution.scope(identity.provider, identity.fingerprint);
    let cause: unknown;
    for (let attempt = 0; attempt < maximum.maxAttempts; attempt += 1) {
      try {
        const candidate = generateSync(sampling as ProviderSchema, {
          seed: stream.integer(0, 0xffffffff),
          maxDepth: maximum.maxValueDepth,
          refDepthMax: maximum.maxValueDepth,
          maxDefaultItems: profile === 'random' ? 3 : 0,
          optionalsProbability: profile === 'random' ? 0.5 : 0,
          useDefaultValue: profile === 'defaults' && attempt === 0,
          useExamplesValue: profile === 'examples' && attempt === 0,
          failOnInvalidTypes: true,
          validateSchemaVersion: true,
          minDateTime: execution.referenceDate().toISOString(),
          maxDateTime: execution.referenceDate().toISOString(),
          formats: generators,
          outputTransform(value, node) {
            if (
              !node ||
              typeof node !== 'object' ||
              !node.propertyNames ||
              !value ||
              typeof value !== 'object' ||
              Array.isArray(value)
            ) {
              return value;
            }
            const output: Record<string, unknown> = {};
            const original = value as Record<string, unknown>;
            const fixed = new Set([
              ...(node.required ?? []),
              ...Object.keys(node.properties ?? {}),
            ]);
            for (const [key, item] of Object.entries(original)) {
              let name = key;
              if (!fixed.has(key)) {
                let selected = false;
                for (let attempt = 0; attempt < maximum.maxAttempts; attempt++) {
                  const candidate = generateSync(
                    {
                      allOf: [
                        { type: 'string', maxLength: maximum.maxStringLength },
                        node.propertyNames,
                      ],
                    },
                    {
                      seed: stream.integer(0, 0xffffffff),
                      maxDepth: maximum.maxValueDepth,
                      maxDefaultItems: 0,
                      formats: generators,
                    }
                  );
                  if (
                    typeof candidate === 'string' &&
                    candidate !== '__proto__' &&
                    !fixed.has(candidate) &&
                    !Object.hasOwn(output, candidate)
                  ) {
                    name = candidate;
                    selected = true;
                    break;
                  }
                }
                if (!selected) {
                  throw new SchemaGenerationError(
                    'Could not construct distinct property names',
                    maximum.maxAttempts
                  );
                }
              }
              Object.defineProperty(output, name, {
                value: item,
                enumerable: true,
                writable: true,
                configurable: true,
              });
            }
            return output;
          },
          refResolver(uri) {
            const result = normalizedReferences.get(uri);
            if (result === undefined) {
              throw new SchemaPreparationError('Reference was not supplied in memory', '');
            }
            return result as ProviderSchema;
          },
        });
        const value = copyJson(candidate, maximum, false);
        if (check(value)) {
          return value;
        }
        cause = issues(compiled.errors);
      } catch (error) {
        if (error instanceof SessionBudgetError) {
          throw error;
        }
        cause = error;
      }
    }
    throw new SchemaGenerationError(
      'No valid fixture was found within the generation budget; supply a custom factory or adjust the sampling profile',
      maximum.maxAttempts,
      { cause }
    );
  }
  return Object.freeze({
    source: copyJson(source, maximum) as JsonSchema,
    standard,
    identity,
    metadata: Object.freeze({
      dialect: selected,
      profile,
      generation: 'validated-sampling' as const,
      network: false as const,
    }),
    check,
    issues: inspectIssues,
    create,
    session,
  });
}
/** Raw runtime JSON carries no invented application type. */
export function fromJsonSchema(
  schema: JsonSchema,
  options: JsonSchemaOptions = {}
): SchemaBuilder<unknown, unknown, [session?: GenerationSession]> {
  const adapter = jsonSchemaAdapter(schema, options);
  return createSchemaBuilder(
    adapter.standard,
    (session?: GenerationSession) => adapter.create(session),
    options
  ) as unknown as SchemaBuilder<unknown, unknown, [session?: GenerationSession]>;
}
/** Generate encoded INPUT through Standard JSON Schema and parse once through the native validator. */
export function fromStandardJsonSchema<S extends StandardJSONSchemaV1 & StandardSchemaV1>(
  schema: S,
  options: JsonSchemaOptions = {}
): SchemaBuilder<SchemaInput<S>, SchemaOutput<S>, [session?: GenerationSession]> {
  const properties = schema?.['~standard'];
  if (
    properties?.version !== 1 ||
    typeof properties.validate !== 'function' ||
    typeof properties.jsonSchema?.input !== 'function'
  ) {
    throw new TypeError('Expected Standard Schema and Standard JSON Schema v1 capabilities');
  }
  const input = properties.jsonSchema.input({ target: options.dialect ?? 'draft-2020-12' });
  const adapter = jsonSchemaAdapter(input, options);
  // This cast binds a conversion advertised by the schema itself, not an unrelated user generic.
  return createSchemaBuilder(
    schema,
    (session?: GenerationSession) => adapter.create(session) as SchemaInput<S>,
    options
  ) as unknown as SchemaBuilder<SchemaInput<S>, SchemaOutput<S>, [session?: GenerationSession]>;
}

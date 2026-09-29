/**
 * Schema-independent test-data builders. Factories own data generation;
 * validators own validation. This module has no runtime dependencies.
 */
export type BuilderPatch<T> = T extends
  | ReadonlyArray<unknown>
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ArrayBuffer
  | ArrayBufferView
  | ((...args: never[]) => unknown)
  ? T
  : T extends object
    ? Partial<T>
    : T;

export type BuilderTransform<T> = (value: T) => T;
export type BuilderFactory<T, Args extends unknown[] = []> = (...args: Args) => T | PromiseLike<T>;

export interface Builder<T, Args extends unknown[] = []> {
  /** Shallow-merge plain records; replace arrays and other atomic values. */
  with(patch: BuilderPatch<T>): Builder<T, Args>;
  /** Replace the entire value, including a plain record. */
  replace(value: T): Builder<T, Args>;
  /** Run after all patches, in registration order. Transforms are synchronous. */
  transform(transformer: BuilderTransform<T>): Builder<T, Args>;
  build(...args: Args): T;
  buildAsync(...args: Args): Promise<T>;
  buildList(count: number, ...args: Args): Array<T>;
  /** Sequential execution preserves factory/RNG order. */
  buildListAsync(count: number, ...args: Args): Promise<Array<T>>;
}

/** Structural Standard Schema v1 contract: https://standardschema.dev/schema. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
    readonly validate: (
      value: unknown
    ) => ValidationResult<Output> | PromiseLike<ValidationResult<Output>>;
  };
}

export interface ValidationIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export type ValidationResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<ValidationIssue> };

export type SchemaInput<S extends StandardSchemaV1> = NonNullable<S['~standard']['types']>['input'];
export type SchemaOutput<S extends StandardSchemaV1> = NonNullable<
  S['~standard']['types']
>['output'];

export interface SchemaBuilder<Input, Output, Args extends unknown[] = []> extends Builder<
  Input,
  Args
> {
  with(patch: BuilderPatch<Input>): SchemaBuilder<Input, Output, Args>;
  replace(value: Input): SchemaBuilder<Input, Output, Args>;
  transform(transformer: BuilderTransform<Input>): SchemaBuilder<Input, Output, Args>;
  buildValidated(...args: Args): Output;
  buildValidatedAsync(...args: Args): Promise<Output>;
  buildValidatedList(count: number, ...args: Args): Array<Output>;
  buildValidatedListAsync(count: number, ...args: Args): Promise<Array<Output>>;
}

export class BuilderValidationError extends Error {
  readonly issues: ReadonlyArray<ValidationIssue>;

  constructor(issues: ReadonlyArray<ValidationIssue>) {
    super(issues.map((issue) => issue.message).join('; ') || 'Schema validation failed');
    this.name = 'BuilderValidationError';
    this.issues = issues;
  }
}

type Patch<T> =
  | { readonly kind: 'merge'; readonly value: BuilderPatch<T> }
  | { readonly kind: 'replace'; readonly value: T };

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function mergePatch<T>(value: T, patch: BuilderPatch<T>): T {
  if (isPlainRecord(value) && isPlainRecord(patch)) {
    // Object spread copies own data properties without invoking __proto__ setters.
    return { ...value, ...patch } as T;
  }
  if (!isPlainRecord(value) && value !== null && isPlainRecord(patch)) {
    throw new TypeError('Cannot merge a record into a non-record value; use replace()');
  }
  return patch as T;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

function synchronous<T>(value: T | PromiseLike<T>, asyncMethod: string): T {
  if (isPromiseLike(value)) {
    // Validation/factory work may already have started. Observe rejection even
    // when the caller chose the synchronous API, including cross-realm promises.
    void Promise.resolve(value).catch(() => {});
    throw new TypeError(`Received an asynchronous result; use ${asyncMethod} instead`);
  }
  return value;
}

function checkCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > 0xffffffff) {
    throw new RangeError('List count must be an integer between 0 and 4294967295');
  }
}

function makeBuilder<T, Args extends unknown[]>(
  factory: BuilderFactory<T, Args>,
  patches: ReadonlyArray<Patch<T>>,
  transforms: ReadonlyArray<BuilderTransform<T>>
): Builder<T, Args> {
  const apply = (initial: T): T => {
    let value = initial;
    for (const patch of patches) {
      value = patch.kind === 'replace' ? patch.value : mergePatch(value, patch.value);
    }
    for (const transform of transforms) {
      value = synchronous(transform(value), 'a synchronous transform');
    }
    return value;
  };

  const builder: Builder<T, Args> = {
    with(patch) {
      return makeBuilder(factory, [...patches, { kind: 'merge', value: patch }], transforms);
    },
    replace(value) {
      return makeBuilder(factory, [...patches, { kind: 'replace', value }], transforms);
    },
    transform(transformer) {
      return makeBuilder(factory, patches, [...transforms, transformer]);
    },
    build(...args) {
      return apply(synchronous(factory(...args), 'buildAsync()'));
    },
    async buildAsync(...args) {
      return apply(await factory(...args));
    },
    buildList(count, ...args) {
      checkCount(count);
      return Array.from({ length: count }, () => builder.build(...args));
    },
    async buildListAsync(count, ...args) {
      checkCount(count);
      const values: Array<T> = [];
      for (let index = 0; index < count; index += 1) {
        values.push(await builder.buildAsync(...args));
      }
      return values;
    },
  };
  return Object.freeze(builder);
}

/** Factory parameters, including required arguments, are preserved on builds. */
export function createBuilder<T, Args extends unknown[] = []>(
  factory: BuilderFactory<T, Args>
): Builder<T, Args> {
  if (typeof factory !== 'function') {
    throw new TypeError('A builder requires a factory function');
  }
  return makeBuilder(factory, [], []);
}

function unwrap<T>(result: ValidationResult<T>): T {
  // An empty issues array is still a failure under the Standard Schema contract.
  if (result.issues !== undefined) {
    throw new BuilderValidationError(result.issues);
  }
  return result.value;
}

/**
 * Generate and patch schema INPUT, then validate exactly once to obtain OUTPUT.
 * Unvalidated builds remain available for deliberately invalid test fixtures.
 */
export function createSchemaBuilder<S extends StandardSchemaV1, Args extends unknown[] = []>(
  schema: S,
  factory: BuilderFactory<NoInfer<SchemaInput<S>>, Args>
): SchemaBuilder<SchemaInput<S>, SchemaOutput<S>, Args> {
  const standard = schema['~standard'];
  if (standard.version !== 1 || typeof standard.validate !== 'function') {
    throw new TypeError('Expected a Standard Schema v1 validator');
  }

  type Input = SchemaInput<S>;
  type Output = SchemaOutput<S>;
  function validate(
    value: Input
  ): ValidationResult<Output> | PromiseLike<ValidationResult<Output>> {
    return standard.validate(value) as
      ValidationResult<Output> | PromiseLike<ValidationResult<Output>>;
  }

  const wrap = (base: Builder<Input, Args>): SchemaBuilder<Input, Output, Args> => {
    const builder: SchemaBuilder<Input, Output, Args> = {
      ...base,
      with(patch) {
        return wrap(base.with(patch));
      },
      replace(value) {
        return wrap(base.replace(value));
      },
      transform(transformer) {
        return wrap(base.transform(transformer));
      },
      buildValidated(...args) {
        return unwrap(synchronous(validate(base.build(...args)), 'buildValidatedAsync()'));
      },
      async buildValidatedAsync(...args) {
        return unwrap(await validate(await base.buildAsync(...args)));
      },
      buildValidatedList(count, ...args) {
        checkCount(count);
        return Array.from({ length: count }, () => builder.buildValidated(...args));
      },
      async buildValidatedListAsync(count, ...args) {
        checkCount(count);
        const values: Array<Output> = [];
        for (let index = 0; index < count; index += 1) {
          values.push(await builder.buildValidatedAsync(...args));
        }
        return values;
      },
    };
    return Object.freeze(builder);
  };
  return wrap(createBuilder(factory));
}

import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  BuilderConfig,
  BuilderDescription,
  SchemaBuilderConfig,
  ValidationIssue,
} from './types.js';

export class BuilderValidationError extends Error {
  readonly code = 'VALIDATION_FAILED';
  declare readonly issues: ReadonlyArray<ValidationIssue>;
  constructor(issues: ReadonlyArray<ValidationIssue>) {
    // Native issue messages and extension fields can contain the fixture itself.
    // Preserve the original issues for deliberate inspection, not default logging.
    super('Schema validation failed');
    this.name = 'BuilderValidationError';
    Object.defineProperty(this, 'issues', { value: issues, enumerable: false });
  }
}
export class BuilderGenerationError extends Error {
  readonly code = 'GENERATION_FAILED';
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'BuilderGenerationError';
  }
}

type Operation =
  | { readonly kind: 'merge' | 'replace'; readonly value: unknown }
  | {
      readonly kind: 'mergeFactory' | 'replaceFactory';
      readonly factory: (...args: unknown[]) => unknown;
    }
  | { readonly kind: 'omit'; readonly keys: ReadonlyArray<PropertyKey> };
type Transform = {
  readonly asynchronous: boolean;
  readonly run: (value: unknown, ...args: unknown[]) => unknown;
};
type State = {
  readonly cloneInput?: <T>(value: T) => T;
  readonly factory: (...args: unknown[]) => unknown;
  readonly operations: ReadonlyArray<Operation>;
  readonly transforms: ReadonlyArray<Transform>;
  readonly standard?: StandardSchemaV1['~standard'];
  readonly validationOptions?: StandardSchemaV1.Options;
  readonly maxListSize: number;
};

function plainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function merge(value: unknown, patch: unknown): unknown {
  if (plainRecord(value) && plainRecord(patch)) {
    return { ...value, ...patch };
  }
  // Partial structural types cannot safely cross either plain-record boundary.
  if (plainRecord(value) || plainRecord(patch)) {
    throw new TypeError('Cannot merge between record and non-record values; use replace()');
  }
  return patch;
}
function synchronous(value: unknown, asyncMethod: string): unknown {
  if (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new TypeError(`Received an asynchronous result; use ${asyncMethod} instead`);
  }
  return value;
}
function invoke(callback: (...args: unknown[]) => unknown, args: unknown[]): unknown {
  return Reflect.apply(callback, undefined, args);
}
function callable(value: unknown, name: string): asserts value is (...args: unknown[]) => unknown {
  if (typeof value !== 'function') {
    throw new TypeError(`${name} requires a factory function`);
  }
}
function checkCount(count: number, maximum: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
    throw new RangeError(`List count must be an integer between 0 and ${maximum}`);
  }
}
function applyOperations(state: State, initial: unknown, args: unknown[]): unknown {
  let value = initial;
  for (const operation of state.operations) {
    switch (operation.kind) {
      case 'merge':
        value = merge(value, operation.value);
        break;
      case 'replace':
        value = operation.value;
        break;
      case 'mergeFactory':
        value = merge(
          value,
          synchronous(invoke(operation.factory, args), 'a synchronous patch factory')
        );
        break;
      case 'replaceFactory':
        value = synchronous(invoke(operation.factory, args), 'a synchronous replacement factory');
        break;
      case 'omit': {
        if (!plainRecord(value)) {
          throw new TypeError('omit() requires a plain record');
        }
        const copy = { ...value };
        for (const key of operation.keys) {
          delete copy[key];
        }
        value = copy;
        break;
      }
    }
  }
  return value;
}
function unwrap(result: StandardSchemaV1.Result<unknown>): unknown {
  if (result.issues !== undefined) {
    throw new BuilderValidationError(result.issues);
  }
  return result.value;
}

/** Internal runtime. All public constructors and adapters share this execution path. */
export function makeRuntime(state: State) {
  const configure = (change: Partial<State>) => makeRuntime({ ...state, ...change });
  const operation = (next: Operation) => configure({ operations: [...state.operations, next] });
  const validate = (value: unknown) => {
    if (!state.standard) {
      throw new TypeError('This builder has no validator');
    }
    return state.standard.validate(value, state.validationOptions);
  };
  const prepare = (value: unknown) =>
    state.cloneInput
      ? synchronous(invoke(state.cloneInput, [value]), 'a synchronous input clone')
      : value;
  const build = (...args: unknown[]) => {
    if (state.transforms.some((transform) => transform.asynchronous)) {
      throw new TypeError('An asynchronous transform requires buildAsync()');
    }
    const initial = synchronous(invoke(state.factory, args), 'buildAsync()');
    let value = prepare(applyOperations(state, initial, args));
    for (const transform of state.transforms) {
      value = synchronous(invoke(transform.run, [value, ...args]), 'a synchronous transform');
    }
    return value;
  };
  const buildAsync = async (...args: unknown[]) => {
    let value = prepare(applyOperations(state, await invoke(state.factory, args), args));
    for (const transform of state.transforms) {
      const result = invoke(transform.run, [value, ...args]);
      value = transform.asynchronous
        ? await result
        : synchronous(result, 'a synchronous transform');
    }
    return value;
  };
  const buildValidated = (...args: unknown[]) =>
    unwrap(
      synchronous(
        validate(build(...args)),
        'buildValidatedAsync()'
      ) as StandardSchemaV1.Result<unknown>
    );
  const buildValidatedAsync = async (...args: unknown[]) =>
    unwrap(await validate(await buildAsync(...args)));
  const list = (factory: (...args: unknown[]) => unknown, count: number, args: unknown[]) => {
    checkCount(count, state.maxListSize);
    return Array.from({ length: count }, () => factory(...args));
  };
  const listAsync = async (
    factory: (...args: unknown[]) => Promise<unknown>,
    count: number,
    args: unknown[]
  ) => {
    checkCount(count, state.maxListSize);
    const values: unknown[] = [];
    for (let index = 0; index < count; index += 1) {
      values.push(await factory(...args));
    }
    return values;
  };
  return Object.freeze({
    with(patch: unknown) {
      return operation({ kind: 'merge', value: patch });
    },
    replace(value: unknown) {
      return operation({ kind: 'replace', value });
    },
    withFactory(factory: (...args: unknown[]) => unknown) {
      callable(factory, 'withFactory()');
      return operation({ kind: 'mergeFactory', factory });
    },
    replaceFactory(factory: (...args: unknown[]) => unknown) {
      callable(factory, 'replaceFactory()');
      return operation({ kind: 'replaceFactory', factory });
    },
    omit(...keys: PropertyKey[]) {
      return operation({ kind: 'omit', keys: [...keys] });
    },
    transform(run: (value: unknown, ...args: unknown[]) => unknown) {
      callable(run, 'transform()');
      return configure({ transforms: [...state.transforms, { asynchronous: false, run }] });
    },
    transformAsync(run: (value: unknown, ...args: unknown[]) => unknown) {
      callable(run, 'transformAsync()');
      return configure({ transforms: [...state.transforms, { asynchronous: true, run }] });
    },
    build,
    buildAsync,
    buildList(count: number, ...args: unknown[]) {
      return list(build, count, args);
    },
    buildListAsync(count: number, ...args: unknown[]) {
      return listAsync(buildAsync, count, args);
    },
    describe(): BuilderDescription {
      return Object.freeze({
        maxListSize: state.maxListSize,
        cloneInput: state.cloneInput !== undefined,
        validation: state.standard !== undefined,
        operations: Object.freeze([
          'factory',
          ...state.operations.map(({ kind }) => kind),
          ...state.transforms.map(({ asynchronous }) =>
            asynchronous ? 'transformAsync' : 'transform'
          ),
        ]),
      });
    },
    ...(state.standard
      ? {
          usingValidation(options: StandardSchemaV1.Options) {
            return configure({ validationOptions: Object.freeze({ ...options }) });
          },
          buildValidated,
          buildValidatedAsync,
          buildValidatedList(count: number, ...args: unknown[]) {
            return list(buildValidated, count, args);
          },
          buildValidatedListAsync(count: number, ...args: unknown[]) {
            return listAsync(buildValidatedAsync, count, args);
          },
        }
      : {}),
  });
}

export function initializeRuntime(
  factory: unknown,
  config: BuilderConfig | SchemaBuilderConfig = {},
  schema?: StandardSchemaV1
) {
  callable(factory, 'A builder');
  if (config.cloneInput !== undefined) {
    callable(config.cloneInput, 'cloneInput');
  }
  const maxListSize = config.maxListSize ?? 10_000;
  checkCount(maxListSize, 0xffffffff);
  const standard = schema?.['~standard'];
  if (
    schema !== undefined &&
    (!standard || standard.version !== 1 || typeof standard.validate !== 'function')
  ) {
    throw new TypeError('Expected a Standard Schema v1 validator');
  }
  const validationOptions = (config as SchemaBuilderConfig).validationOptions;
  return makeRuntime({
    factory,
    operations: [],
    transforms: [],
    maxListSize,
    ...(config.cloneInput ? { cloneInput: config.cloneInput } : {}),
    ...(standard ? { standard } : {}),
    ...(validationOptions ? { validationOptions: Object.freeze({ ...validationOptions }) } : {}),
  });
}

import { initializeRuntime } from './runtime.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type {
  AnyFactory,
  AsyncBuilder,
  AsyncSchemaBuilder,
  Builder,
  BuilderConfig,
  BuilderDescription,
  BuilderFor,
  BuilderPatch,
  BuilderTransform,
  DefaultSessionFor,
  OptionalKeys,
  SchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
} from './types.js';

/** Retarget fluent methods, including generated methods, after an async transition. */
export type AsyncFacade<T> = {
  [
    K in Exclude<keyof T, 'build' | 'buildList' | 'buildValidated' | 'buildValidatedList'>
  ]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R extends T ? AsyncFacade<T> : R
    : T[K];
};
export interface AsyncBuilderFacade<T, Args extends unknown[] = []> {
  with(patch: BuilderPatch<T>): this;
  replace(value: T): this;
  withFactory(factory: (...args: Args) => BuilderPatch<T>): this;
  replaceFactory(factory: (...args: Args) => T): this;
  omit(...keys: OptionalKeys<T>[]): this;
  transform(transformer: BuilderTransform<T, Args>): this;
  transformAsync(transformer: (value: T, ...args: Args) => T | PromiseLike<T>): AsyncFacade<this>;
  buildAsync(...args: Args): Promise<T>;
  buildListAsync(count: number, ...args: Args): Promise<T[]>;
  describe(): BuilderDescription;
}
export interface BuilderFacade<T, Args extends unknown[] = []> extends AsyncBuilderFacade<T, Args> {
  build(...args: Args): T;
  buildList(count: number, ...args: Args): T[];
}
export interface AsyncSchemaBuilderFacade<
  I,
  O,
  Args extends unknown[] = [],
> extends AsyncBuilderFacade<I, Args> {
  usingValidation(options: StandardSchemaV1.Options): this;
  buildValidatedAsync(...args: Args): Promise<O>;
  buildValidatedListAsync(count: number, ...args: Args): Promise<O[]>;
}
export interface SchemaBuilderFacade<
  I,
  O,
  Args extends unknown[] = [],
> extends AsyncSchemaBuilderFacade<I, O, Args> {
  build(...args: Args): I;
  buildList(count: number, ...args: Args): I[];
  buildValidated(...args: Args): O;
  buildValidatedList(count: number, ...args: Args): O[];
}
export type FacadeFor<B> =
  B extends SchemaBuilder<infer I, infer O, infer A>
    ? SchemaBuilderFacade<I, O, A>
    : B extends AsyncSchemaBuilder<infer I, infer O, infer A>
      ? AsyncSchemaBuilderFacade<I, O, A>
      : B extends Builder<infer T, infer A>
        ? BuilderFacade<T, A>
        : B extends AsyncBuilder<infer T, infer A>
          ? AsyncBuilderFacade<T, A>
          : never;
type InputOf<B> = B extends { buildAsync(...args: never[]): Promise<infer T> } ? T : never;
export type BuilderConstructor<B> = new (initial?: BuilderPatch<InputOf<B>>) => FacadeFor<B>;

const configurationMethods = new Set([
  'with',
  'replace',
  'withFactory',
  'replaceFactory',
  'omit',
  'transform',
  'transformAsync',
  'usingValidation',
]);
const methods = [
  ...configurationMethods,
  'build',
  'buildAsync',
  'buildList',
  'buildListAsync',
  'describe',
  'buildValidated',
  'buildValidatedAsync',
  'buildValidatedList',
  'buildValidatedListAsync',
];
type Runtime = Record<string, (...args: unknown[]) => unknown>;

/**
 * A class facade over a builder definition. Intended for generated classes and
 * method-only subclasses: fluent branches copy public own descriptors, not private fields.
 * The construction/validation implementation remains exclusively in the core runtime.
 */
export function builderClass<B extends { buildAsync: AnyFactory; describe(): BuilderDescription }>(
  definition: () => B
): BuilderConstructor<B> {
  if (typeof definition !== 'function') {
    throw new TypeError('Expected a builder definition');
  }
  const states = new WeakMap<object, Runtime>();
  const invoke = (base: Runtime, key: string, args: unknown[]): unknown => {
    const method = base[key];
    if (typeof method !== 'function') {
      throw new TypeError(`Builder capability ${key} is unavailable`);
    }
    return Reflect.apply(method, base, args);
  };
  class Facade {
    constructor(initial?: unknown) {
      const result: unknown = Reflect.apply(definition, undefined, []);
      if (!result || typeof result !== 'object' || typeof (result as B).buildAsync !== 'function') {
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(result).catch(() => {});
        }
        throw new TypeError('A definition must return a builder synchronously');
      }
      const base = result as Runtime;
      states.set(this, initial === undefined ? base : (invoke(base, 'with', [initial]) as Runtime));
    }
  }
  for (const key of methods) {
    Object.defineProperty(Facade.prototype, key, {
      configurable: true,
      value: function (this: object, ...args: unknown[]) {
        const base = states.get(this);
        if (!base) {
          throw new TypeError('Invalid builder facade receiver');
        }
        const result = invoke(base, key, args);
        if (!configurationMethods.has(key)) {
          return result;
        }
        const next: object = Object.create(
          Object.getPrototypeOf(this),
          Object.getOwnPropertyDescriptors(this)
        );
        states.set(next, result as Runtime);
        return next;
      },
    });
  }
  return Facade as unknown as BuilderConstructor<B>;
}

export function createBuilderClass<F extends AnyFactory>(
  factory: F,
  config?: BuilderConfig & DefaultSessionFor<F>
): BuilderConstructor<BuilderFor<F>> {
  return builderClass(() => initializeRuntime(factory, config)) as unknown as BuilderConstructor<
    BuilderFor<F>
  >;
}
export function createSchemaBuilderClass<
  S extends StandardSchemaV1,
  F extends (...args: never[]) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  config?: SchemaBuilderConfig & DefaultSessionFor<F>
): BuilderConstructor<SchemaBuilderFor<S, F>> {
  if (schema === undefined) {
    throw new TypeError('Expected a Standard Schema v1 validator');
  }
  return builderClass(() =>
    initializeRuntime(factory, config, schema)
  ) as unknown as BuilderConstructor<SchemaBuilderFor<S, F>>;
}

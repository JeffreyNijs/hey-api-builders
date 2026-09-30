import type { GenerationSession } from './session.js';

export interface ScenarioOptions {
  readonly name?: string;
  readonly maxNodes?: number;
  readonly maxListSize?: number;
}
export interface ScenarioDescription {
  readonly name: string;
  readonly nodes: ReadonlyArray<{
    readonly name: string;
    readonly dependencies: ReadonlyArray<string>;
    readonly origin: string;
  }>;
  readonly traits: ReadonlyArray<string>;
}
export class ScenarioError extends Error {
  constructor(
    readonly code: 'SCENARIO_DEFINITION' | 'SCENARIO_CONFLICT' | 'SCENARIO_EXECUTION',
    message: string,
    readonly node?: string,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'ScenarioError';
  }
}
type MayBeAsync<T> = unknown extends T
  ? true
  : [Extract<T, PromiseLike<unknown>>] extends [never]
    ? false
    : true;
type Either<A extends boolean, B extends boolean> = true extends A | B ? true : false;
type Names<T> = Extract<keyof T, string>;
type Add<T, N extends string, V> = {
  [K in keyof T | N]: K extends N ? V : K extends keyof T ? T[K] : never;
};
type Replacements<T> = {
  [K in keyof T]?: (session: GenerationSession) => T[K] | PromiseLike<T[K]>;
};
type ReplacementResult<P> = {
  [K in keyof P]: P[K] extends (...args: never[]) => infer R ? R : never;
}[keyof P];

interface ScenarioOperations<T extends object, Async extends boolean> {
  /** Dependencies must already exist, making cycles and forward references impossible. */
  node<
    N extends string,
    const D extends ReadonlyArray<Names<T>>,
    F extends (dependencies: Readonly<Pick<T, D[number]>>, session: GenerationSession) => unknown,
  >(
    name: N extends keyof T | 'then' ? never : N,
    dependencies: D,
    factory: F
  ): Scenario<Add<T, N, Awaited<ReturnType<F>>>, Either<Async, MayBeAsync<ReturnType<F>>>>;
  /** Replace at the node, before any dependent node runs. */
  override<
    K extends Names<T>,
    F extends (session: GenerationSession) => NoInfer<T[K]> | PromiseLike<NoInfer<T[K]>>,
  >(
    name: K,
    factory: F
  ): Scenario<T, Either<Async, MayBeAsync<ReturnType<F>>>>;
  /** Named presets reject conflicting node replacements unless explicitly authorized. */
  trait<P extends Replacements<T>>(
    name: string,
    replacements: P & Record<Exclude<keyof P, keyof T>, never>,
    options?: { readonly replaceConflicts?: boolean }
  ): Scenario<T, Either<Async, MayBeAsync<ReplacementResult<P>>>>;
  buildAsync(session: GenerationSession): Promise<T>;
  buildListAsync(count: number, session: GenerationSession): Promise<T[]>;
  describe(): ScenarioDescription;
}
export type Scenario<
  T extends object = Record<never, never>,
  Async extends boolean = false,
> = ScenarioOperations<T, Async> &
  (Async extends true
    ? Record<never, never>
    : {
        build(session: GenerationSession): T;
        buildList(count: number, session: GenerationSession): T[];
      });

type Factory = (
  dependencies: Readonly<Record<string, unknown>>,
  session: GenerationSession
) => unknown;
interface NodeDefinition {
  readonly name: string;
  readonly dependencies: ReadonlyArray<string>;
  readonly factory: Factory;
  readonly origin: string;
}
interface Definition {
  readonly name: string;
  readonly maxNodes: number;
  readonly maxListSize: number;
  readonly nodes: ReadonlyArray<NodeDefinition>;
  readonly traits: ReadonlyArray<string>;
}
function fail(message: string, node?: string): never {
  throw new ScenarioError('SCENARIO_DEFINITION', message, node);
}
function validName(name: string): void {
  if (typeof name !== 'string' || !name || name.length > 1024 || name === 'then') {
    fail('Scenario names must be nonempty strings of at most 1024 characters other than "then"');
  }
}
function callable(factory: unknown): asserts factory is (...args: unknown[]) => unknown {
  if (typeof factory !== 'function') {
    fail('Scenario factories must be functions');
  }
}
function checkedCount(count: number, maximum: number): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
    throw new RangeError(`Scenario count must be an integer between 0 and ${maximum}`);
  }
}
function install(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
function synchronous(value: unknown): unknown {
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new TypeError('Asynchronous scenario nodes require buildAsync()');
  }
  return value;
}
function makeScenario(definition: Definition) {
  const indexOf = (name: string) => {
    const index = definition.nodes.findIndex((node) => node.name === name);
    if (index < 0) {
      fail('Scenario dependency or replacement names an unknown node', name);
    }
    return index;
  };
  const execute = (
    node: NodeDefinition,
    values: Record<string, unknown>,
    session: GenerationSession
  ) => {
    const dependencies: Record<string, unknown> = {};
    for (const name of node.dependencies) {
      install(dependencies, name, values[name]);
    }
    return Reflect.apply(node.factory, undefined, [
      Object.freeze(dependencies),
      session.scope('scenario', definition.name, 'node', node.name),
    ]);
  };
  const build = (session: GenerationSession) => {
    const values: Record<string, unknown> = {};
    for (const node of definition.nodes) {
      try {
        install(values, node.name, synchronous(execute(node, values, session)));
      } catch (cause) {
        throw new ScenarioError('SCENARIO_EXECUTION', 'Scenario node failed', node.name, cause);
      }
    }
    return values;
  };
  const buildAsync = async (session: GenerationSession) => {
    const values: Record<string, unknown> = {};
    for (const node of definition.nodes) {
      try {
        install(values, node.name, await execute(node, values, session));
      } catch (cause) {
        throw new ScenarioError('SCENARIO_EXECUTION', 'Scenario node failed', node.name, cause);
      }
    }
    return values;
  };
  return Object.freeze({
    node(name: string, dependencies: ReadonlyArray<string>, factory: Factory) {
      validName(name);
      callable(factory);
      if (definition.nodes.some((node) => node.name === name)) {
        fail('Duplicate scenario node', name);
      }
      if (definition.nodes.length >= definition.maxNodes) {
        fail('Scenario exceeds the node budget', name);
      }
      if (!Array.isArray(dependencies) || new Set(dependencies).size !== dependencies.length) {
        fail('Dependencies must be a unique array of existing node names', name);
      }
      for (const dependency of dependencies) {
        indexOf(dependency);
      }
      return makeScenario({
        ...definition,
        nodes: [
          ...definition.nodes,
          { name, dependencies: [...dependencies], factory, origin: 'definition' },
        ],
      });
    },
    override(name: string, factory: (session: GenerationSession) => unknown) {
      callable(factory);
      const index = indexOf(name);
      return makeScenario({
        ...definition,
        nodes: definition.nodes.map((node, at) =>
          at === index
            ? {
                ...node,
                origin: 'override',
                factory: (_dependencies, session) => Reflect.apply(factory, undefined, [session]),
              }
            : node
        ),
      });
    },
    trait(
      name: string,
      replacements: Record<string, (session: GenerationSession) => unknown>,
      options: { readonly replaceConflicts?: boolean } = {}
    ) {
      validName(name);
      if (definition.traits.includes(name)) {
        throw new ScenarioError('SCENARIO_CONFLICT', 'A named trait cannot be applied twice');
      }
      if (
        !replacements ||
        (Object.getPrototypeOf(replacements) !== Object.prototype &&
          Object.getPrototypeOf(replacements) !== null)
      ) {
        fail('Trait replacements must be a plain record');
      }
      const factories = new Map<string, (session: GenerationSession) => unknown>();
      for (const key of Reflect.ownKeys(replacements)) {
        if (typeof key !== 'string') {
          fail('Trait keys must be string node names');
        }
        const descriptor = Object.getOwnPropertyDescriptor(replacements, key);
        if (!descriptor || !('value' in descriptor)) {
          fail('Trait replacements must be data properties');
        }
        callable(descriptor.value);
        indexOf(key);
        factories.set(key, descriptor.value);
      }
      const nodes = definition.nodes.map((node) => {
        const factory = factories.get(node.name);
        if (!factory) {
          return node;
        }
        if (node.origin !== 'definition' && !options.replaceConflicts) {
          throw new ScenarioError(
            'SCENARIO_CONFLICT',
            'Trait conflicts with an existing node override',
            node.name
          );
        }
        return {
          ...node,
          origin: `trait:${name}`,
          factory: (_dependencies: Readonly<Record<string, unknown>>, session: GenerationSession) =>
            Reflect.apply(factory, undefined, [session]),
        };
      });
      return makeScenario({ ...definition, nodes, traits: [...definition.traits, name] });
    },
    build,
    buildAsync,
    buildList(count: number, session: GenerationSession) {
      checkedCount(count, definition.maxListSize);
      return Array.from({ length: count }, () => build(session));
    },
    async buildListAsync(count: number, session: GenerationSession) {
      checkedCount(count, definition.maxListSize);
      const values = [];
      for (let index = 0; index < count; index += 1) {
        values.push(await buildAsync(session));
      }
      return values;
    },
    describe(): ScenarioDescription {
      return Object.freeze({
        name: definition.name,
        traits: Object.freeze([...definition.traits]),
        nodes: Object.freeze(
          definition.nodes.map(({ name, dependencies, origin }) =>
            Object.freeze({ name, dependencies: Object.freeze([...dependencies]), origin })
          )
        ),
      });
    },
  });
}
export function createScenario(options: ScenarioOptions = {}): Scenario {
  const name = options.name ?? 'default';
  validName(name);
  const maxNodes = options.maxNodes ?? 1000;
  const maxListSize = options.maxListSize ?? 1000;
  checkedCount(maxNodes, 100_000);
  checkedCount(maxListSize, 100_000);
  return makeScenario({
    name,
    maxNodes,
    maxListSize,
    nodes: [],
    traits: [],
  }) as unknown as Scenario;
}

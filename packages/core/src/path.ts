import type { OptionalKeys } from './types.js';

type Union<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;
type Leaf =
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ArrayBuffer
  | ArrayBufferView
  | ((...args: never[]) => unknown);
type Index<T extends readonly unknown[]> = number extends T['length']
  ? number
  : Exclude<keyof T, keyof (readonly unknown[])> extends infer K
    ? K extends `${infer N extends number}`
      ? N
      : never
    : never;
type Keys<T> =
  true extends Union<T>
    ? never
    : T extends Leaf
      ? never
      : T extends readonly unknown[]
        ? Index<T>
        : T extends object
          ? keyof T
          : never;
/** Paths stop at unions and native values; replace a complete variant rather than its discriminant. */
export type ValuePath<T, Depth extends readonly unknown[] = []> = Depth['length'] extends 8
  ? readonly []
  : | readonly []
    | {
        [K in Keys<T>]: K extends keyof T
          ? readonly [K, ...ValuePath<T[K], readonly [...Depth, 0]>]
          : never;
      }[Keys<T>];
export type PathValue<T, P> = P extends readonly []
  ? T
  : P extends readonly [infer K extends keyof T, ...infer R extends readonly PropertyKey[]]
    ? PathValue<T[K], R>
    : never;
export type OptionalPath<T, Depth extends readonly unknown[] = []> = Depth['length'] extends 8
  ? never
  : {
      [K in Keys<T>]: K extends keyof T
        ? | (K extends OptionalKeys<T> ? readonly [K] : never)
          | (OptionalPath<T[K], readonly [...Depth, 0]> extends infer P extends
              readonly PropertyKey[]
              ? readonly [K, ...P]
              : never)
        : never;
    }[Keys<T>];
export class BuilderPathError extends TypeError {
  readonly code = 'INVALID_BUILDER_PATH';
  constructor() {
    super('A path must traverse existing own data properties on plain records or arrays');
    this.name = 'BuilderPathError';
  }
}
function container(value: unknown): value is Record<PropertyKey, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return Array.isArray(value) || prototype === Object.prototype || prototype === null;
}
function update(
  value: unknown,
  path: readonly PropertyKey[],
  replacement: unknown,
  omit: boolean
): unknown {
  if (
    !Array.isArray(path) ||
    path.length > 8 ||
    path.some((key) => !['string', 'number', 'symbol'].includes(typeof key))
  ) {
    throw new BuilderPathError();
  }
  const visit = (current: unknown, offset: number): unknown => {
    if (offset === path.length) {
      return replacement;
    }
    if (!container(current)) {
      throw new BuilderPathError();
    }
    const key = path[offset] as PropertyKey;
    const array = Array.isArray(current);
    if (
      array &&
      (typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0 || key >= current.length)
    ) {
      throw new BuilderPathError();
    }
    const property = Object.getOwnPropertyDescriptor(current, key);
    if ((property && !('value' in property)) || (!property && offset + 1 !== path.length)) {
      throw new BuilderPathError();
    }
    const copy: Record<PropertyKey, unknown> = array
      ? []
      : Object.create(Object.getPrototypeOf(current));
    for (const name of Reflect.ownKeys(current)) {
      if (array && name === 'length') {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (!descriptor || !('value' in descriptor)) {
        throw new BuilderPathError();
      }
      Object.defineProperty(copy, name, { ...descriptor, configurable: true, writable: true });
    }
    if (array) {
      copy.length = current.length;
    }
    if (omit && offset + 1 === path.length) {
      if (array) {
        throw new BuilderPathError();
      }
      delete copy[key];
    } else {
      Object.defineProperty(copy, key, {
        value: visit(property?.value, offset + 1),
        enumerable: property?.enumerable ?? true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  };
  if (omit && path.length === 0) {
    throw new BuilderPathError();
  }
  return visit(value, 0);
}
type CheckedPath<
  T,
  P extends readonly PropertyKey[],
  Omit extends boolean = false,
  Depth extends readonly unknown[] = [],
> = P extends readonly []
  ? Omit extends true
    ? never
    : P
  : Depth['length'] extends 8
    ? never
    : P extends readonly [infer K, ...infer R extends readonly PropertyKey[]]
      ? K extends Keys<T> & keyof T
        ? Omit extends true
          ? R extends readonly []
            ? K extends OptionalKeys<T>
              ? P
              : never
            : readonly [K, ...CheckedPath<T[K], R, true, readonly [...Depth, 0]>]
          : readonly [K, ...CheckedPath<T[K], R, false, readonly [...Depth, 0]>]
        : never
      : never;
/** Immutable explicit leaf replacement; an absent intermediate must be replaced as a whole. */
export function setPath<T, const P extends readonly PropertyKey[]>(
  value: T,
  path: P & CheckedPath<NoInfer<T>, P>,
  replacement: NoInfer<PathValue<T, P>>
): T {
  return update(value, path, replacement, false) as T;
}
/** Remove an optional own property, without changing undefined/null or shifting arrays. */
export function omitPath<T, const P extends readonly PropertyKey[]>(
  value: T,
  path: P & CheckedPath<NoInfer<T>, P, true>
): T {
  return update(value, path, undefined, true) as T;
}

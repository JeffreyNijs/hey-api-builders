import { builderClass } from './facade.js';
import type { FacadeFor } from './facade.js';
import type { AnyFactory, BuilderDescription, BuilderPatch } from './types.js';

type Source = { buildAsync: AnyFactory; describe(): BuilderDescription };
type Input<B extends Source> = Awaited<ReturnType<B['buildAsync']>>;
type PatchKey<I> = [I] extends [object]
  ? string extends keyof I
    ? never
    : number extends keyof I
      ? never
      : symbol extends keyof I
        ? never
        : [Partial<I>] extends [BuilderPatch<I>]
          ? Extract<keyof I, string>
          : never
  : never;
type Selection<I> = readonly PatchKey<I>[] | Readonly<Record<string, PatchKey<I>>>;
type IsUnion<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;
type Single<T> = true extends IsUnion<T> ? never : string extends T ? never : T;
type Letter =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';
type AlphaNumeric =
  Letter | Uppercase<Letter> | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type Pascal<
  S extends string,
  Word extends string = '',
  Result extends string = '',
  Depth extends 0[] = [],
> = S extends ''
  ? `${Result}${Capitalize<Word>}`
  : Depth['length'] extends 64
    ? never
    : S extends `${infer Head}${infer Tail}`
      ? Head extends AlphaNumeric
        ? Pascal<Tail, `${Word}${Head}`, Result, [...Depth, 0]>
        : Pascal<Tail, '', `${Result}${Capitalize<Word>}`, [...Depth, 0]>
      : never;
type Method<K extends string> = `with${Pascal<K> extends '' ? 'Value' : Pascal<K>}`;
type FieldMap<S> = S extends readonly string[] ? { [K in S[number] as Method<K>]: K } : S;
type LiteralSelection<S> = S extends readonly string[]
  ? number extends S['length']
    ? never
    : {
        readonly [K in keyof S]: S[K] extends string
          ? Method<S[K]> extends never
            ? never
            : Single<S[K]>
          : never;
      }
  : string extends keyof S
    ? never
    : { readonly [K in keyof S]: Single<S[K]> };

/** Named input setters over the same immutable runtime and native validation contract. */
export type FluentBuilder<B extends Source, S extends Selection<Input<B>>> = FacadeFor<B> & {
  [M in keyof FieldMap<S>]: (
    value: Input<B>[FieldMap<S>[M] & keyof Input<B>]
  ) => FluentBuilder<B, S>;
};

function entries(selection: unknown): [string, string][] {
  if (!selection || typeof selection !== 'object') {
    throw new TypeError('Expected a field tuple or a method-to-field map');
  }
  const array = Array.isArray(selection);
  const prototype = Object.getPrototypeOf(selection);
  if (
    array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
  ) {
    throw new TypeError('Field selection must be a plain data structure');
  }
  const keys = Reflect.ownKeys(selection);
  const count = array ? selection.length : keys.length;
  if (count < 1 || count > 1000 || (array && keys.length !== count + 1)) {
    throw new TypeError('Expected between 1 and 1000 explicit fields');
  }
  return Array.from({ length: count }, (_, index) => {
    const key = array ? String(index) : keys[index];
    if (typeof key !== 'string') {
      throw new TypeError('Field selection cannot contain symbols, accessors or hidden entries');
    }
    const descriptor = Object.getOwnPropertyDescriptor(selection, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError('Field selection cannot contain symbols, accessors or hidden entries');
    }
    const property: unknown = descriptor.value;
    if (typeof property !== 'string' || property.length > (array ? 64 : 1024)) {
      throw new TypeError(
        'Expected a bounded string field name; use explicit method names for long fields'
      );
    }
    const suffix =
      property
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('') || 'Value';
    const method = array ? `with${suffix}` : key;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(method)) {
      throw new TypeError('Expected a JavaScript method name of at most 128 characters');
    }
    return [method, property];
  });
}

/**
 * Opt into named methods without executing a factory or inspecting a native schema.
 * Use a literal field tuple, or a map such as { withUserName: 'user_name' }.
 * Ambiguous/default collisions require explicit aliases; core methods are never replaced.
 */
export function fluent<B extends Source, const S extends Selection<Input<B>>>(
  builder: B,
  selection: S & LiteralSelection<S>
): FluentBuilder<B, S> {
  const fields = entries(selection);
  const Base = builderClass(() => builder);
  const used = new Set<string>();
  for (const [method, property] of fields) {
    if (
      method in Base.prototype ||
      method === 'then' ||
      method === 'toJSON' ||
      used.has(property)
    ) {
      throw new TypeError(
        'Fluent methods must be unique and cannot replace builder capabilities; choose an explicit alias'
      );
    }
    used.add(property);
    Object.defineProperty(Base.prototype, method, {
      value(this: object, value: unknown) {
        return Reflect.apply(Base.prototype.with, this, [{ [property]: value }]);
      },
    });
  }
  return new Base() as FluentBuilder<B, S>;
}

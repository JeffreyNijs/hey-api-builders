import avro from 'avsc';
import type { Type } from 'avsc';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createSchemaBuilder, createSession } from '@jeffreynijs/test-builders';
import type {
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderConfig,
  SessionKey,
  StandardSchemaV1,
  ValidationIssue,
} from '@jeffreynijs/test-builders';

export type AvroSchema = string | readonly AvroSchema[] | Readonly<Record<string, unknown>>;
export interface AvroFixtureOptions extends SchemaBuilderConfig {
  readonly profile?: 'minimal' | 'random' | 'boundary' | 'defaults';
  readonly listLength?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
  readonly maxSchemaCharacters?: number;
}
export class AvroFixtureError extends Error {
  readonly code = 'AVRO_FIXTURE_FAILED';
  constructor(
    message: string,
    readonly path: readonly (string | number)[] = [],
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'AvroFixtureError';
  }
}
const fail = (message: string, path: readonly (string | number)[] = []): never => {
  throw new AvroFixtureError(message, path);
};
const minimumLong = -(1n << 63n);
const maximumLong = (1n << 63n) - 1n;
const long = avro.types.LongType.__with({
  fromBuffer: (bytes: Buffer) => bytes.readBigInt64LE(),
  toBuffer(value: bigint) {
    const bytes = Buffer.alloc(8);
    bytes.writeBigInt64LE(value);
    return bytes;
  },
  fromJSON(value: unknown) {
    if (
      typeof value === 'number'
        ? !Number.isSafeInteger(value)
        : typeof value !== 'string' || !/^-?\d+$/.test(value)
    ) {
      return fail('Long defaults require losslessly represented integers');
    }
    const result = BigInt(value as number | string);
    if (result < minimumLong || result > maximumLong) {
      return fail('Long is outside its signed 64-bit range');
    }
    return result;
  },
  toJSON: (value: bigint) => value.toString(),
  isValid: (value: unknown) =>
    typeof value === 'bigint' && value >= minimumLong && value <= maximumLong,
  compare: (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0),
});
function bound(value: number | undefined, fallback: number, maximum: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 0 || n > maximum) {
    return fail('Invalid Avro resource budget');
  }
  return n;
}
function record(type: Type): type is avro.types.RecordType {
  return type.typeName === 'record' || type.typeName === 'error';
}
function union(type: Type): type is avro.types.WrappedUnionType {
  return type.typeName === 'union:wrapped';
}
/** Native wire representations: bigint longs, byte arrays, and explicitly wrapped union branches. */
export function avroAdapter(schema: AvroSchema, supplied: AvroFixtureOptions = {}) {
  const options = Object.freeze({ ...supplied });
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'random', 'boundary', 'defaults'].includes(profile)) {
    return fail('Unknown Avro profile');
  }
  const maxDepth = bound(options.maxDepth, 24, 64);
  const maxNodes = bound(options.maxNodes, 10_000, 100_000);
  const maxBytes = bound(options.maxBytes, 1_000_000, 10_000_000);
  const maxSchemaCharacters = bound(options.maxSchemaCharacters, 1_000_000, 10_000_000);
  const listLength = bound(options.listLength, 2, 1000);
  // Accessors are rejected before evaluation. Caller-owned instances and schema callbacks are not accepted.
  const copy = (input: unknown, mode: 'schema' | 'input' | 'native'): unknown => {
    let nodes = 0;
    let bytes = 0;
    const active = new Set<object>();
    const visit = (value: unknown, depth: number, path: (string | number)[]): unknown => {
      if (++nodes > maxNodes || depth > maxDepth) {
        return fail('Avro data depth/node budget exhausted', path);
      }
      const charge = (amount: number) => {
        bytes += amount;
        if (bytes > (mode === 'schema' ? maxSchemaCharacters : maxBytes)) {
          return fail('Avro data size budget exhausted', path);
        }
      };
      if (typeof value === 'string') {
        charge(Buffer.byteLength(value));
        if (Buffer.from(value).toString('utf8') !== value) {
          return fail('Avro strings require valid Unicode', path);
        }
        return value;
      }
      if (value === null || typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'number') {
        if (
          mode === 'schema' &&
          (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
        ) {
          return fail('Schema numbers must be finite and lossless', path);
        }
        return value;
      }
      if (mode !== 'schema' && typeof value === 'bigint') {
        return value;
      }
      if (mode !== 'schema' && value instanceof Uint8Array) {
        charge(value.byteLength);
        return Buffer.from(value);
      }
      if (!value || typeof value !== 'object' || active.has(value)) {
        return fail('Expected acyclic Avro data', path);
      }
      if (
        !Array.isArray(value) &&
        mode !== 'native' &&
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      ) {
        return fail('Expected plain Avro data, not a class instance', path);
      }
      active.add(value);
      const output: unknown[] | Record<string, unknown> = Array.isArray(value) ? [] : {};
      if (Array.isArray(value) && value.length > maxNodes - nodes) {
        return fail('Avro array budget exhausted', path);
      }
      const keys = Reflect.ownKeys(value).filter(
        (key) => !(Array.isArray(value) && key === 'length')
      );
      if (Array.isArray(value) && keys.length !== value.length) {
        return fail('Arrays must be dense without extra properties', path);
      }
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor)) {
          return fail('Only enumerable data properties are accepted', path);
        }
        if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
          return fail('Invalid array property', path);
        }
        if (mode === 'schema' && ['__proto__', 'prototype', 'constructor'].includes(key)) {
          return fail('Unsafe schema map key', [...path, key]);
        }
        if (
          mode === 'schema' &&
          key === 'name' &&
          typeof descriptor.value === 'string' &&
          descriptor.value
            .split('.')
            .some((part: string) => ['__proto__', 'prototype', 'constructor'].includes(part))
        ) {
          return fail('Unsafe native schema name', [...path, key]);
        }
        charge(Buffer.byteLength(key));
        Object.defineProperty(output, key, {
          value: visit(descriptor.value, depth + 1, [...path, key]),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      active.delete(value);
      return output;
    };
    return visit(input, 0, []);
  };
  const source = copy(schema, 'schema');
  let type: Type;
  try {
    type = avro.Type.forSchema(source as avro.Schema, {
      wrapUnions: 'always',
      omitRecordMethods: true,
      typeHook: (node) =>
        node === 'long' ||
        (typeof node === 'object' &&
          !Array.isArray(node) &&
          node !== null &&
          'type' in node &&
          node.type === 'long')
          ? long
          : undefined,
    });
  } catch (cause) {
    throw new AvroFixtureError('Avro schema compilation failed', [], { cause });
  }
  const identity = Object.freeze({
    fingerprint: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
    provider: 'avsc@5.7.9/bigint-wrapped-v1',
    configuration: JSON.stringify({
      profile,
      listLength,
      maxDepth,
      maxNodes,
      maxBytes,
      maxSchemaCharacters,
    }),
  });
  const session = (seed: SessionKey = 1) => createSession({ ...identity, seed });
  const required = (value: unknown, current: Type, path: (string | number)[] = []): void => {
    if (record(current)) {
      const data = value as Record<string, unknown>;
      for (const field of current.fields) {
        if (!Object.hasOwn(data, field.name)) {
          return fail('Record field is required even when it has a default', [...path, field.name]);
        }
        required(data[field.name], field.type, [...path, field.name]);
      }
    } else if (union(current) && value !== null) {
      const [name] = Object.keys(value as object);
      const branch = current.types.find((branch) => branch.branchName === name)!;
      required((value as Record<string, unknown>)[name!], branch, [...path, name!]);
    } else if (current.typeName === 'array') {
      (value as unknown[]).forEach((item, i) =>
        required(item, (current as avro.types.ArrayType).itemsType, [...path, i])
      );
    } else if (current.typeName === 'map') {
      for (const [name, item] of Object.entries(value as object)) {
        if (name === '__proto__') {
          return fail('Native Avro cannot safely round-trip this map key', [...path, name]);
        }
        required(item, (current as avro.types.MapType).valuesType as Type, [...path, name]);
      }
    } else if (current.typeName === 'float' && !Object.is(Math.fround(value as number), value)) {
      return fail('Float must be representable without silent 32-bit rounding', path);
    }
  };
  const checked = (input: unknown, native = false): unknown => {
    const value = copy(input, native ? 'native' : 'input');
    const errors: ValidationIssue[] = [];
    if (
      !type.isValid(value, {
        noUndeclaredFields: true,
        errorHook: (path, _value, type) =>
          errors.push({ message: `Expected Avro ${type.typeName}`, path: [...path] }),
      })
    ) {
      return fail(
        errors[0]?.message ?? 'Avro validation failed',
        (errors[0]?.path as string[]) ?? []
      );
    }
    required(value, type);
    return value;
  };
  const issues = (value: unknown): ValidationIssue[] => {
    try {
      checked(value);
      return [];
    } catch (cause) {
      return [
        {
          message: cause instanceof AvroFixtureError ? cause.message : 'Avro validation failed',
          path: cause instanceof AvroFixtureError ? cause.path : [],
        },
      ];
    }
  };
  const standard: StandardSchemaV1<unknown> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/avro',
      validate(value) {
        const found = issues(value);
        return found.length ? { issues: found } : { value: checked(value) };
      },
    },
  };
  // Determine a terminating branch, rather than repeatedly choosing an infinite required recursion.
  const height = (current: Type, active = new Set<Type>()): number => {
    if (active.has(current)) {
      return Infinity;
    }
    const next = new Set(active).add(current);
    if (record(current)) {
      return current.fields.length
        ? 1 + Math.max(...current.fields.map((field) => height(field.type, next)))
        : 0;
    }
    if (union(current)) {
      return Math.min(
        ...current.types.map(
          (branch) => (branch.typeName === 'null' ? 0 : 1) + height(branch, next)
        )
      );
    }
    return 0;
  };
  const create = (execution: GenerationSession = session()): unknown => {
    let nodes = 0;
    const make = (current: Type, stream: GenerationSession, depth: number): unknown => {
      if (++nodes > maxNodes || depth > maxDepth) {
        return fail('Avro generation budget exhausted');
      }
      if (record(current)) {
        return Object.fromEntries(
          current.fields.map((field) => {
            const fallback: unknown = profile === 'defaults' ? field.defaultValue() : undefined;
            return [
              field.name,
              fallback === undefined
                ? make(field.type, stream.scope(field.name), depth + 1)
                : copy(fallback, 'native'),
            ];
          })
        );
      }
      if (union(current)) {
        const candidates = current.types.filter(
          (branch) => height(branch) + depth + (branch.typeName === 'null' ? 0 : 1) <= maxDepth
        );
        if (!candidates.length) {
          return fail('No terminating union branch fits the depth budget');
        }
        const branch =
          profile === 'random' || profile === 'boundary'
            ? stream.pick(candidates)
            : candidates.reduce((a, b) => (height(a) <= height(b) ? a : b));
        return branch.typeName === 'null'
          ? null
          : Object.fromEntries([
              [branch.branchName!, make(branch, stream.scope(branch.branchName!), depth + 1)],
            ]);
      }
      const size = profile === 'minimal' || depth >= maxDepth ? 0 : listLength;
      switch (current.typeName) {
        case 'null':
          return null;
        case 'boolean':
          return profile === 'random' || profile === 'boundary' ? stream.boolean() : false;
        case 'int':
          return profile === 'boundary'
            ? stream.pick([-0x80000000, 0, 0x7fffffff])
            : profile === 'random'
              ? stream.integer(-1000, 1000)
              : 0;
        case 'abstract:long':
          return profile === 'boundary'
            ? stream.pick([minimumLong, 0n, maximumLong])
            : profile === 'random'
              ? BigInt(stream.integer(-1000, 1000))
              : 0n;
        case 'float':
          return profile === 'boundary'
            ? stream.pick([-Infinity, -0, NaN, Infinity])
            : profile === 'random'
              ? Math.fround(stream.random())
              : 0;
        case 'double':
          return profile === 'boundary'
            ? stream.pick([-Number.MAX_VALUE, -0, NaN, Number.MAX_VALUE, Infinity])
            : profile === 'random'
              ? stream.random()
              : 0;
        case 'string':
          return profile === 'random' ? `value-${stream.integer(0, 0x7fffffff)}` : '';
        case 'bytes':
          return Buffer.alloc(size, profile === 'random' ? stream.integer(0, 255) : 0);
        case 'fixed': {
          const length = (current as avro.types.FixedType).size;
          if (length > maxBytes) {
            return fail('Fixed byte size exceeds the output budget');
          }
          return Buffer.alloc(length, profile === 'random' ? stream.integer(0, 255) : 0);
        }
        case 'enum': {
          const values = (current as avro.types.EnumType).symbols;
          return profile === 'random' || profile === 'boundary' ? stream.pick(values) : values[0];
        }
        case 'array':
          return Array.from({ length: size }, (_, i) =>
            make((current as avro.types.ArrayType).itemsType, stream.scope(i), depth + 1)
          );
        case 'map':
          return Object.fromEntries(
            Array.from({ length: size }, (_, i) => [
              `key${i}`,
              make((current as avro.types.MapType).valuesType as Type, stream.scope(i), depth + 1),
            ])
          );
        default:
          return fail('Unsupported native Avro type');
      }
    };
    return checked(make(type, execution.scope(identity.fingerprint), 0), true);
  };
  const encode = (value: unknown): Uint8Array => {
    const bytes = type.toBuffer(checked(value));
    if (bytes.length > maxBytes) {
      return fail('Encoded Avro exceeds the byte budget');
    }
    return new Uint8Array(bytes);
  };
  // Bound logical expansion BEFORE native decoding (a tiny array-of-null payload can claim billions of entries).
  const preflight = (bytes: Buffer): void => {
    let position = 0;
    let nodes = 0;
    const take = (size: number): void => {
      if (!Number.isSafeInteger(size) || size < 0 || size > bytes.length - position) {
        return fail('Truncated or invalid Avro payload');
      }
      position += size;
    };
    const readLong = (): bigint => {
      let word = 0n;
      for (let shift = 0n; shift < 70n; shift += 7n) {
        const byte = bytes[position];
        take(1);
        if (shift === 63n && byte! > 1) {
          return fail('Invalid Avro varint');
        }
        word |= BigInt(byte! & 0x7f) << shift;
        if (!(byte! & 0x80)) {
          return (word >> 1n) ^ -(word & 1n);
        }
      }
      return fail('Invalid Avro varint');
    };
    const size = (): number => {
      const n = readLong();
      if (n < 0n || n > BigInt(maxBytes)) {
        return fail('Invalid Avro byte length');
      }
      return Number(n);
    };
    const string = () => {
      const n = size();
      const start = position;
      take(n);
      const part = bytes.subarray(start, position);
      if (!Buffer.from(part.toString('utf8')).equals(part)) {
        return fail('Invalid Avro UTF-8');
      }
      return part.toString('utf8');
    };
    const visit = (current: Type, depth: number): void => {
      if (++nodes > maxNodes || depth > maxDepth) {
        return fail('Avro binary depth/node budget exhausted');
      }
      if (record(current)) {
        for (const field of current.fields) {
          visit(field.type, depth + 1);
        }
        return;
      }
      if (union(current)) {
        const index = readLong();
        if (index < 0n || index >= BigInt(current.types.length)) {
          return fail('Invalid Avro union index');
        }
        const branch = current.types[Number(index)]!;
        visit(branch, depth + (branch.typeName === 'null' ? 0 : 1));
        return;
      }
      switch (current.typeName) {
        case 'null':
          return;
        case 'boolean': {
          const v = bytes[position];
          take(1);
          if (v !== 0 && v !== 1) {
            return fail('Invalid Avro boolean');
          }
          return;
        }
        case 'int': {
          const v = readLong();
          if (v < -0x80000000n || v > 0x7fffffffn) {
            return fail('Invalid Avro int');
          }
          return;
        }
        case 'abstract:long':
          readLong();
          return;
        case 'float':
          take(4);
          return;
        case 'double':
          take(8);
          return;
        case 'string':
          string();
          return;
        case 'bytes':
          take(size());
          return;
        case 'fixed':
          take((current as avro.types.FixedType).size);
          return;
        case 'enum': {
          const v = readLong();
          if (v < 0 || v >= (current as avro.types.EnumType).symbols.length) {
            return fail('Invalid Avro enum index');
          }
          return;
        }
        case 'array':
        case 'map': {
          const seen = new Set<string>();
          for (;;) {
            let count = readLong();
            if (count === 0n) {
              return;
            }
            let end: number | undefined;
            if (count < 0n) {
              count = -count;
              const blockBytes = size();
              end = position + blockBytes;
            }
            if (count > BigInt(maxNodes - nodes)) {
              return fail('Avro binary collection budget exhausted');
            }
            for (let i = 0; i < Number(count); i++) {
              if (current.typeName === 'map') {
                const name = string();
                if (name === '__proto__' || seen.has(name)) {
                  return fail('Unsafe or duplicate Avro map key');
                }
                seen.add(name);
              }
              visit(
                current.typeName === 'map'
                  ? ((current as avro.types.MapType).valuesType as Type)
                  : (current as avro.types.ArrayType).itemsType,
                depth + 1
              );
            }
            if (end !== undefined && position !== end) {
              return fail('Avro block size mismatch');
            }
          }
        }
        default:
          return fail('Unsupported binary Avro type');
      }
    };
    visit(type, 0);
    if (position !== bytes.length) {
      return fail('Trailing bytes after Avro datum');
    }
  };
  const decode = (input: Uint8Array): unknown => {
    if (!(input instanceof Uint8Array) || input.byteLength > maxBytes) {
      return fail('Expected bounded Avro bytes');
    }
    const bytes = Buffer.from(input);
    preflight(bytes);
    return checked(type.fromBuffer(bytes), true);
  };
  return Object.freeze({
    identity,
    session,
    standard,
    create,
    encode,
    decode,
    issues,
    check: (value: unknown) => issues(value).length === 0,
    clone: (value: unknown) => checked(value),
    builder: (): SchemaBuilder<unknown, unknown, [session?: GenerationSession]> =>
      createSchemaBuilder(standard, create, options) as unknown as SchemaBuilder<
        unknown,
        unknown,
        [session?: GenerationSession]
      >,
    metadata: Object.freeze({
      vendor: 'avsc',
      version: '5.7.9',
      name: type.name,
      type: type.typeName,
      unionRepresentation: 'wrapped',
      longs: 'bigint',
      logicalTypes: 'underlying-wire-representation',
      binary: 'raw-datum',
      network: false,
      fields: Object.freeze(
        record(type)
          ? type.fields.map((field) =>
              Object.freeze({ name: field.name, type: field.type.typeName })
            )
          : []
      ),
    }),
  });
}
export function fromAvro(
  schema: AvroSchema,
  options: AvroFixtureOptions = {}
): SchemaBuilder<unknown, unknown, [session?: GenerationSession]> {
  return avroAdapter(schema, options).builder();
}

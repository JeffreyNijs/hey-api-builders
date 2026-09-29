import protobuf from 'protobufjs';
import type { Field, Namespace, Root, Type } from 'protobufjs';
import { createSchemaBuilder, createSession } from '@jeffreynijs/test-builders';
import type {
  GenerationSession,
  SchemaBuilder,
  SchemaBuilderConfig,
  StandardSchemaV1,
  ValidationIssue,
} from '@jeffreynijs/test-builders';

export interface ProtobufFixtureOptions extends SchemaBuilderConfig {
  readonly profile?: 'minimal' | 'random' | 'boundary' | 'defaults';
  readonly filename?: string;
  /** Virtual .proto files, resolved in memory. Filesystem/network imports are never attempted. */
  readonly imports?: Readonly<Record<string, string>>;
  readonly keepCase?: boolean;
  readonly listLength?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
  readonly maxSchemaCharacters?: number;
}
export class ProtobufFixtureError extends Error {
  readonly code = 'PROTOBUF_FIXTURE_FAILED';
  constructor(
    message: string,
    readonly path: readonly (string | number)[] = [],
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ProtobufFixtureError';
  }
}
const fail = (message: string, path: readonly (string | number)[] = []): never => {
  throw new ProtobufFixtureError(message, path);
};
const own = (value: unknown): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return fail('Expected a plain Protobuf data object');
  }
  return value as Record<string, unknown>;
};
function bound(value: number | undefined, fallback: number, maximum: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 0 || n > maximum) {
    return fail('Invalid Protobuf resource budget');
  }
  return n;
}
function virtualPath(path: string, from = ''): string {
  if (typeof path !== 'string' || !path || /[\\:\0?#]/.test(path) || path.startsWith('/')) {
    return fail('Imports require relative virtual paths');
  }
  const result = from.split('/').slice(0, -1);
  for (const part of path.split('/')) {
    if (part === '.' || part === '') {
      continue;
    }
    if (part === '..') {
      if (!result.length) {
        return fail('Import escapes its virtual root');
      }
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join('/');
}
const ranges: Readonly<Record<string, readonly [bigint, bigint]>> = {
  int32: [-(2n ** 31n), 2n ** 31n - 1n],
  sint32: [-(2n ** 31n), 2n ** 31n - 1n],
  sfixed32: [-(2n ** 31n), 2n ** 31n - 1n],
  uint32: [0n, 2n ** 32n - 1n],
  fixed32: [0n, 2n ** 32n - 1n],
  int64: [-(2n ** 63n), 2n ** 63n - 1n],
  sint64: [-(2n ** 63n), 2n ** 63n - 1n],
  sfixed64: [-(2n ** 63n), 2n ** 63n - 1n],
  uint64: [0n, 2n ** 64n - 1n],
  fixed64: [0n, 2n ** 64n - 1n],
};
function integer(value: unknown, type: string, path: readonly (string | number)[]): bigint {
  const range = ranges[type]!;
  if (
    type.endsWith('64')
      ? typeof value !== 'bigint'
      : typeof value !== 'number' || !Number.isSafeInteger(value)
  ) {
    return fail('Expected a lossless integer representation', path);
  }
  const n = BigInt(value as number | bigint);
  if (n < range[0] || n > range[1]) {
    return fail('Integer is outside its Protobuf range', path);
  }
  return n;
}
/** Runtime values use bigint for 64-bit integers, numeric enums and Uint8Array bytes. */
export function protobufAdapter(
  source: string | Readonly<Record<string, unknown>>,
  messageName: string,
  supplied: ProtobufFixtureOptions = {}
) {
  const options = Object.freeze({ ...supplied });
  const maxDepth = bound(options.maxDepth, 16, 64);
  const maxNodes = bound(options.maxNodes, 10_000, 100_000);
  const maxBytes = bound(options.maxBytes, 1_000_000, 10_000_000);
  const maxSchemaCharacters = bound(options.maxSchemaCharacters, 1_000_000, 10_000_000);
  const listLength = bound(options.listLength, 2, 1000);
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'random', 'boundary', 'defaults'].includes(profile)) {
    return fail('Unknown Protobuf profile');
  }
  if (
    typeof messageName !== 'string' ||
    !/^\.?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(messageName)
  ) {
    return fail('A qualified message name is required');
  }
  if (options.keepCase !== undefined && typeof options.keepCase !== 'boolean') {
    return fail('keepCase must be a boolean');
  }
  const imports = { ...options.imports };
  const filename = virtualPath(options.filename ?? 'schema.proto');
  let characters = 0;
  const checkedText = (text: string): string => {
    if (typeof text !== 'string' || (characters += text.length) > maxSchemaCharacters) {
      return fail('Protobuf schema character budget exhausted');
    }
    return text;
  };
  const root = new protobuf.Root();
  try {
    if (typeof source === 'string') {
      const seen = new Set<string>();
      const load = (name: string, text: string, depth: number): void => {
        if (seen.has(name)) {
          return;
        }
        if (depth > maxDepth || seen.size >= maxNodes) {
          return fail('Import budget exhausted');
        }
        seen.add(name);
        const parsed = protobuf.parse(checkedText(text), root, {
          keepCase: options.keepCase ?? true,
        });
        for (const imported of [...(parsed.imports ?? []), ...(parsed.weakImports ?? [])]) {
          const target = virtualPath(imported, name);
          if (!Object.hasOwn(imports, target)) {
            return fail('Imported schema was not supplied in memory');
          }
          load(target, imports[target]!, depth + 1);
        }
      };
      load(filename, source, 0);
    } else {
      if (Object.keys(imports).length) {
        return fail('Reflection JSON must contain its own referenced definitions');
      }
      let nodes = 0;
      const active = new Set<object>();
      const json = (value: unknown, depth: number): unknown => {
        if (++nodes > maxNodes || depth > Math.max(maxDepth, 1)) {
          return fail('Reflection schema budget exhausted');
        }
        if (typeof value === 'string') {
          return checkedText(value);
        }
        if (
          value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))
        ) {
          return value;
        }
        if (!value || typeof value !== 'object' || active.has(value)) {
          return fail('Reflection schemas must be acyclic JSON');
        }
        if (!Array.isArray(value)) {
          own(value);
        }
        active.add(value);
        const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
        for (const key of Reflect.ownKeys(value)) {
          if (Array.isArray(value) && key === 'length') {
            continue;
          }
          const entry = Object.getOwnPropertyDescriptor(value, key)!;
          if (typeof key !== 'string' || !entry.enumerable || !('value' in entry)) {
            return fail('Reflection schemas require JSON data properties');
          }
          checkedText(key);
          Object.defineProperty(output, key, {
            value: json(entry.value, depth + 1),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        active.delete(value);
        return output;
      };
      protobuf.Root.fromJSON(own(json(source, 0)), root);
    }
    root.resolveAll();
  } catch (cause) {
    if (cause instanceof ProtobufFixtureError) {
      throw cause;
    }
    throw new ProtobufFixtureError('Protobuf schema preparation failed', [], { cause });
  }
  let type: Type;
  try {
    type = root.lookupType(messageName);
  } catch (cause) {
    throw new ProtobufFixtureError('Message type does not exist', [], { cause });
  }
  const shape = root.toJSON();
  const identity = Object.freeze({
    fingerprint: JSON.stringify({ shape, message: type.fullName }),
    provider: 'test-builders/protobufjs@8.8.0/v1',
    configuration: JSON.stringify({ profile, listLength, maxDepth, maxNodes, maxBytes }),
  });
  const session = (seed: string | number = 1) => createSession({ ...identity, seed });
  const checked = (input: unknown): Record<string, unknown> => {
    let nodes = 0;
    let bytes = 0;
    const active = new Set<object>();
    const budget = (depth: number, path: readonly (string | number)[]): void => {
      if (++nodes > maxNodes || depth > maxDepth || bytes > maxBytes) {
        fail('Protobuf value budget exhausted', path);
      }
    };
    const scalar = (
      value: unknown,
      field: Field,
      depth: number,
      path: readonly (string | number)[]
    ): unknown => {
      budget(depth, path);
      if (field.resolvedType instanceof protobuf.Type) {
        return message(value, field.resolvedType, depth, path);
      }
      if (field.resolvedType instanceof protobuf.Enum) {
        integer(value, 'int32', path);
        return value;
      }
      if (ranges[field.type]) {
        integer(value, field.type, path);
        return value;
      }
      switch (field.type) {
        case 'bool':
          if (typeof value !== 'boolean') {
            return fail('Expected a boolean', path);
          }
          return value;
        case 'string': {
          if (typeof value !== 'string') {
            return fail('Expected a string', path);
          }
          try {
            encodeURIComponent(value);
          } catch {
            return fail('String contains invalid Unicode', path);
          }
          bytes += value.length * 3;
          budget(depth, path);
          return value;
        }
        case 'bytes':
          if (!(value instanceof Uint8Array)) {
            return fail('Expected Uint8Array bytes', path);
          }
          bytes += value.byteLength;
          budget(depth, path);
          return new Uint8Array(value);
        case 'float':
        case 'double': {
          if (typeof value !== 'number') {
            return fail('Expected a floating-point number', path);
          }
          if (
            field.type === 'float' &&
            Number.isFinite(value) &&
            !Number.isFinite(Math.fround(value))
          ) {
            return fail('Float32 overflow would lose data', path);
          }
          return field.type === 'float' ? Math.fround(value) : value;
        }
        default:
          return fail('Unsupported Protobuf field type', path);
      }
    };
    const properties = (value: unknown, path: readonly (string | number)[]) => {
      const record = own(value);
      for (const name of Reflect.ownKeys(record)) {
        const entry = Object.getOwnPropertyDescriptor(record, name)!;
        if (typeof name !== 'string' || !entry.enumerable || !('value' in entry)) {
          return fail('Message fields require enumerable data properties', path);
        }
      }
      return record;
    };
    const message = (
      value: unknown,
      type: Type,
      depth: number,
      path: readonly (string | number)[]
    ): Record<string, unknown> => {
      budget(depth, path);
      const data = properties(value, path);
      if (active.has(data)) {
        return fail('Protobuf values cannot contain cycles', path);
      }
      active.add(data);
      const output: Record<string, unknown> = {};
      for (const name of Object.keys(data)) {
        if (!Object.hasOwn(type.fields, name)) {
          return fail('Unknown Protobuf field', [...path, name]);
        }
      }
      for (const oneof of type.oneofsArray) {
        if (oneof.oneof.filter((name) => Object.hasOwn(data, name)).length > 1) {
          return fail('A oneof can contain at most one selected field', [...path, oneof.name]);
        }
      }
      for (const field of type.fieldsArray) {
        const fieldPath = [...path, field.name];
        if (!Object.hasOwn(data, field.name)) {
          if (field.required) {
            return fail('Required Protobuf field is absent', fieldPath);
          }
          continue;
        }
        const item = data[field.name];
        let result: unknown;
        if (field instanceof protobuf.MapField) {
          const values = properties(item, fieldPath);
          if (Object.keys(values).length > maxNodes) {
            return fail('Map budget exhausted', fieldPath);
          }
          result = Object.fromEntries(
            Object.entries(values).map(([key, value]) => {
              bytes += key.length * 3;
              const keyType = field.keyType;
              if (keyType === 'bool') {
                if (key !== 'true' && key !== 'false') {
                  return fail('Boolean map keys must be true or false', fieldPath);
                }
              } else if (keyType !== 'string') {
                if (!/^(0|-?[1-9][0-9]*)$/.test(key)) {
                  return fail('Map keys must be canonical decimal integers', fieldPath);
                }
                integer(keyType.endsWith('64') ? BigInt(key) : Number(key), keyType, fieldPath);
              }
              return [key, scalar(value, field, depth + 1, [...fieldPath, key])];
            })
          );
        } else if (field.repeated) {
          if (!Array.isArray(item) || item.length > maxNodes) {
            return fail('Expected a bounded repeated field', fieldPath);
          }
          if (Reflect.ownKeys(item).length !== item.length + 1) {
            return fail('Repeated fields cannot be sparse or have custom properties', fieldPath);
          }
          result = Array.from({ length: item.length }, (_, index) => {
            const entry = Object.getOwnPropertyDescriptor(item, String(index));
            if (!entry || !('value' in entry) || !entry.enumerable) {
              return fail('Repeated values cannot be accessors or holes', fieldPath);
            }
            return scalar(entry.value, field, depth + 1, [...fieldPath, index]);
          });
        } else {
          result = scalar(item, field, depth + 1, fieldPath);
        }
        Object.defineProperty(output, field.name, {
          value: result,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      active.delete(data);
      return output;
    };
    const result = message(input, type, 0, []);
    // Native fromObject silently drops unknown CLOSED enum values. Verify before
    // conversion, replacing only bigint with an exact verifier-compatible bit pair.
    const verification = (value: unknown): unknown => {
      if (typeof value === 'bigint') {
        return {
          low: Number(BigInt.asIntN(32, value)),
          high: Number(BigInt.asIntN(32, value >> 32n)),
        };
      }
      if (value instanceof Uint8Array || value === null || typeof value !== 'object') {
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(verification);
      }
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, verification(item)])
      );
    };
    if (type.verify(verification(result) as Record<string, unknown>)) {
      return fail('Native Protobuf verification failed');
    }
    return result;
  };
  const normalize = (value: unknown): Record<string, unknown> => {
    const input = checked(value);
    const native = type.fromObject(input);
    // Preserve presence; do not populate absent scalar defaults or virtual oneof fields.
    const output = type.toObject(native, {
      longs: BigInt,
      bytes: Uint8Array,
      enums: Number,
      defaults: false,
      arrays: false,
      objects: false,
      oneofs: false,
    });
    return checked(output);
  };
  const issues = (value: unknown): ValidationIssue[] => {
    try {
      checked(value);
      return [];
    } catch (cause) {
      return [
        {
          message:
            cause instanceof ProtobufFixtureError ? cause.message : 'Protobuf validation failed',
          path: cause instanceof ProtobufFixtureError ? cause.path : [],
        },
      ];
    }
  };
  const standard: StandardSchemaV1<Record<string, unknown>> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/protobuf',
      validate(value) {
        const found = issues(value);
        return found.length ? { issues: found } : { value: normalize(value) };
      },
    },
  };
  const create = (execution: GenerationSession = session()): Record<string, unknown> => {
    let nodes = 0;
    const make = (
      type: Type,
      stream: GenerationSession,
      depth: number
    ): Record<string, unknown> => {
      if (depth > maxDepth || ++nodes > maxNodes) {
        return fail('Protobuf generation budget exhausted');
      }
      const result: Record<string, unknown> = {};
      const choice = new Set(
        type.oneofsArray.map((group) =>
          profile === 'minimal' ? '' : stream.scope('oneof', group.name).pick(group.oneof)
        )
      );
      const value = (field: Field, stream: GenerationSession): unknown => {
        if (++nodes > maxNodes) {
          return fail('Protobuf generation budget exhausted');
        }
        if (field.resolvedType instanceof protobuf.Type) {
          return make(field.resolvedType, stream, depth + 1);
        }
        if (field.resolvedType instanceof protobuf.Enum) {
          const values = Object.values(field.resolvedType.values);
          return profile === 'random' || profile === 'boundary' ? stream.pick(values) : values[0];
        }
        if (ranges[field.type]) {
          const [min, max] = ranges[field.type]!;
          const n =
            profile === 'boundary'
              ? stream.pick([min, 0n, max])
              : profile === 'random'
                ? BigInt(stream.integer(Number(min < 0 ? -1000 : 0), 1000))
                : 0n;
          return field.type.endsWith('64') ? n : Number(n);
        }
        switch (field.type) {
          case 'bool':
            return profile === 'random' ? stream.boolean() : false;
          case 'string':
            return profile === 'random' ? `value-${stream.sequence('string')}` : '';
          case 'bytes':
            return profile === 'minimal'
              ? new Uint8Array()
              : Uint8Array.from([stream.integer(0, 255)]);
          case 'float':
            return profile === 'boundary'
              ? stream.pick([-3.4028234663852886e38, -0, 3.4028234663852886e38])
              : Math.fround(stream.random());
          case 'double':
            return profile === 'boundary'
              ? stream.pick([-Number.MAX_VALUE, -0, Number.MAX_VALUE])
              : stream.random();
          default:
            return fail('Unsupported Protobuf generation type');
        }
      };
      for (const field of type.fieldsArray) {
        if (field.partOf && !choice.has(field.name)) {
          continue;
        }
        if (
          !field.required &&
          (profile === 'minimal' ||
            depth >= maxDepth ||
            (field.resolvedType instanceof protobuf.Type && depth + 1 >= maxDepth))
        ) {
          continue;
        }
        const child = stream.scope(field.name);
        let generated: unknown;
        if (field instanceof protobuf.MapField) {
          const keyType = field.keyType;
          generated = Object.fromEntries(
            Array.from(
              { length: Math.min(listLength, keyType === 'bool' ? 2 : listLength) },
              (_, i) => [
                keyType === 'string' ? `key${i}` : keyType === 'bool' ? String(i === 1) : String(i),
                value(field, child.scope(i)),
              ]
            )
          );
        } else if (field.repeated) {
          generated = Array.from({ length: listLength }, (_, i) => value(field, child.scope(i)));
        } else if (profile === 'defaults' && field.options?.default !== undefined) {
          const converted = type.toObject(type.create({ [field.name]: field.defaultValue }), {
            longs: BigInt,
            bytes: Uint8Array,
            enums: Number,
          });
          generated = Object.hasOwn(converted, field.name)
            ? converted[field.name]
            : value(field, child);
        } else {
          generated = value(field, child);
        }
        Object.defineProperty(result, field.name, {
          value: generated,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return result;
    };
    return normalize(make(type, execution.scope(type.fullName), 0));
  };
  const encode = (value: unknown): Uint8Array => {
    const output = type.encode(type.fromObject(checked(value))).finish();
    if (output.byteLength > maxBytes) {
      return fail('Encoded message exceeds the byte budget');
    }
    return new Uint8Array(output);
  };
  const decode = (bytes: Uint8Array): Record<string, unknown> => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxBytes) {
      return fail('Expected bounded Protobuf bytes');
    }
    try {
      const reader = protobuf.Reader.create(new Uint8Array(bytes));
      reader.discardUnknown = true;
      const value = type.decode(reader);
      return checked(
        type.toObject(value, {
          longs: BigInt,
          bytes: Uint8Array,
          enums: Number,
          defaults: false,
          oneofs: false,
        })
      );
    } catch (cause) {
      if (cause instanceof ProtobufFixtureError) {
        throw cause;
      }
      throw new ProtobufFixtureError('Protobuf decoding failed', [], { cause });
    }
  };
  const services: Array<{
    name: string;
    methods: Array<{
      name: string;
      request: string;
      response: string;
      requestStream: boolean;
      responseStream: boolean;
    }>;
  }> = [];
  const inspect = (namespace: Namespace | Root): void => {
    for (const member of namespace.nestedArray) {
      if (member instanceof protobuf.Service) {
        services.push({
          name: member.fullName,
          methods: member.methodsArray.map((method) => ({
            name: method.name,
            request: method.resolvedRequestType!.fullName,
            response: method.resolvedResponseType!.fullName,
            requestStream: Boolean(method.requestStream),
            responseStream: Boolean(method.responseStream),
          })),
        });
      } else if (member instanceof protobuf.Namespace) {
        inspect(member);
      }
    }
  };
  inspect(root);
  return Object.freeze({
    identity,
    session,
    standard,
    create,
    normalize,
    encode,
    decode,
    clone: (value: unknown) => checked(value),
    check: (value: unknown) => issues(value).length === 0,
    issues,
    builder: () => createSchemaBuilder(standard, create, options),
    metadata: Object.freeze({
      message: type.fullName,
      nativeVersion: '8.8.0',
      network: false,
      integers64: 'bigint',
      unknownWireFields: 'discarded',
      fields: type.fieldsArray.map((field) =>
        Object.freeze({
          name: field.name,
          number: field.id,
          type: field.resolvedType?.fullName ?? field.type,
          required: field.required,
          repeated: field.repeated,
          map: field.map,
          presence: Boolean(field.hasPresence),
          oneof: field.partOf?.name,
        })
      ),
      services,
    }),
  });
}
export function fromProtobuf(
  source: string | Readonly<Record<string, unknown>>,
  message: string,
  options: ProtobufFixtureOptions = {}
): SchemaBuilder<Record<string, unknown>, Record<string, unknown>, [session?: GenerationSession]> {
  return protobufAdapter(source, message, options).builder();
}

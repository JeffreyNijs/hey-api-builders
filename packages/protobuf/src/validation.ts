import type { Field, Type } from 'protobufjs';
import protobuf from 'protobufjs';
import { fail, integer, own, ranges } from './values.js';

/** Internal validation operations; prepared once for each native adapter. */
export function createProtobufValidation({
  type,
  maxNodes,
  maxDepth,
  maxBytes,
}: {
  type: Type;
  maxNodes: number;
  maxDepth: number;
  maxBytes: number;
}) {
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
  return { checked, normalize };
}

import { Buffer } from 'node:buffer';
import { fail } from './values.js';

/** Internal data operations; prepared once for each native adapter. */
export function createAvroCopy({
  maxNodes,
  maxDepth,
  maxSchemaCharacters,
  maxBytes,
}: {
  maxNodes: number;
  maxDepth: number;
  maxSchemaCharacters: number;
  maxBytes: number;
}) {
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
  return copy;
}

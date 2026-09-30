import type { Type } from 'avsc';
import type avro from 'avsc';
import { Buffer } from 'node:buffer';
import { fail, record, union } from './values.js';

/** Internal codecs operations; prepared once for each native adapter. */
export function createAvroCodecs({
  type,
  checked,
  maxBytes,
  maxNodes,
  maxDepth,
}: {
  type: Type;
  checked: (input: unknown, native?: boolean) => unknown;
  maxBytes: number;
  maxNodes: number;
  maxDepth: number;
}) {
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
  return { encode, decode };
}

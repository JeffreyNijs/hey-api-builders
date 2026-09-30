import type { GenerationSession } from 'mimlet';
import type { Type } from 'avsc';
import type avro from 'avsc';
import { Buffer } from 'node:buffer';
import type { AvroFixtureOptions } from './types.js';
import { fail, maximumLong, minimumLong, record, union } from './values.js';

/** Internal generation operations; prepared once for each native adapter. */
export function createAvroGenerator({
  type,
  session,
  maxNodes,
  maxDepth,
  profile,
  copy,
  listLength,
  maxBytes,
  checked,
  identity,
}: {
  type: Type;
  session: (seed?: string | number) => GenerationSession;
  maxNodes: number;
  maxDepth: number;
  profile: NonNullable<AvroFixtureOptions['profile']>;
  copy: (input: unknown, mode: 'schema' | 'input' | 'native') => unknown;
  listLength: number;
  maxBytes: number;
  checked: (input: unknown, native?: boolean) => unknown;
  identity: { fingerprint: string; provider: string; configuration: string };
}) {
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
  return create;
}

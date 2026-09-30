import type { GenerationSession } from '@mimlet/core';
import type { Field, Type } from 'protobufjs';
import protobuf from 'protobufjs';
import type { ProtobufFixtureOptions } from './types.js';
import { fail, ranges } from './values.js';

/** Internal generation operations; prepared once for each native adapter. */
export function createProtobufGenerator({
  type,
  session,
  maxDepth,
  maxNodes,
  profile,
  listLength,
  normalize,
}: {
  type: Type;
  session: (seed?: string | number) => GenerationSession;
  maxDepth: number;
  maxNodes: number;
  profile: NonNullable<ProtobufFixtureOptions['profile']>;
  listLength: number;
  normalize: (value: unknown) => Record<string, unknown>;
}) {
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
  return create;
}

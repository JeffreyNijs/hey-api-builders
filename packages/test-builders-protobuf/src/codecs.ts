import type { Type } from 'protobufjs';
import protobuf from 'protobufjs';
import { ProtobufFixtureError, fail } from './values.js';

/** Internal codecs operations; prepared once for each native adapter. */
export function createProtobufCodecs({
  type,
  checked,
  maxBytes,
}: {
  type: Type;
  checked: (value: unknown) => Record<string, unknown>;
  maxBytes: number;
}) {
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
  return { encode, decode };
}

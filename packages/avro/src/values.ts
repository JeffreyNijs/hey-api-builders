import type { Type } from 'avsc';
import avro from 'avsc';
import { Buffer } from 'node:buffer';
export { AvroFixtureError } from './errors.js';
import { AvroFixtureError } from './errors.js';
export const fail = (message: string, path: readonly (string | number)[] = []): never => {
  throw new AvroFixtureError(message, path);
};
export const minimumLong = -(1n << 63n);
export const maximumLong = (1n << 63n) - 1n;
export const long = avro.types.LongType.__with({
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
export function bound(value: number | undefined, fallback: number, maximum: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 0 || n > maximum) {
    return fail('Invalid Avro resource budget');
  }
  return n;
}
export function record(type: Type): type is avro.types.RecordType {
  return type.typeName === 'record' || type.typeName === 'error';
}
export function union(type: Type): type is avro.types.WrappedUnionType {
  return type.typeName === 'union:wrapped';
}

export { ProtobufFixtureError } from './errors.js';
import { ProtobufFixtureError } from './errors.js';
export const fail = (message: string, path: readonly (string | number)[] = []): never => {
  throw new ProtobufFixtureError(message, path);
};
export const own = (value: unknown): Record<string, unknown> => {
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
export function bound(value: number | undefined, fallback: number, maximum: number): number {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 0 || n > maximum) {
    return fail('Invalid Protobuf resource budget');
  }
  return n;
}
export function virtualPath(path: string, from = ''): string {
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
export const ranges: Readonly<Record<string, readonly [bigint, bigint]>> = {
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
export function integer(value: unknown, type: string, path: readonly (string | number)[]): bigint {
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

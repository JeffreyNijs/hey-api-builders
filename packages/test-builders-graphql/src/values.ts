import { cloneFixture } from '@jeffreynijs/test-builders';
import type { GraphQLError } from 'graphql';
import type { GraphQLFixtureIssue } from './types.js';
export { GraphQLFixtureError } from './errors.js';
import { GraphQLFixtureError } from './errors.js';
export function bounded(value: number | undefined, fallback: number, maximum: number): number {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 0 || selected > maximum) {
    throw new GraphQLFixtureError('Invalid GraphQL resource budget');
  }
  return selected;
}
export function immediate(value: unknown): unknown {
  if (
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new GraphQLFixtureError('GraphQL fixture callbacks must be synchronous');
  }
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new GraphQLFixtureError('Expected a variable or response object');
  }
  return value as Record<string, unknown>;
}
export function same(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (
    !left ||
    !right ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
    )
  );
}
export function redact(errors: readonly GraphQLError[]): GraphQLFixtureIssue[] {
  return errors.map((error) => ({
    message: 'GraphQL validation or execution failed',
    ...(error.path ? { path: [...error.path] } : {}),
    ...(error.locations ? { locations: error.locations.map((location) => ({ ...location })) } : {}),
  }));
}

/** Internal values operations; prepared once for each native adapter. */
export function createGraphQLWireValues({
  maxNodes,
  maxDepth,
  maxCharacters,
}: {
  maxNodes: number;
  maxDepth: number;
  maxCharacters: number;
}) {
  const clone = (value: unknown) =>
    cloneFixture(value, {
      maxNodes,
      maxDepth: Math.max(1, maxDepth + 4),
      maxEntries: maxNodes,
      maxCharacters,
      maxBufferBytes: maxCharacters,
    });
  const wire = (value: unknown): unknown => {
    const copied = clone(value);
    const active = new Set<object>();
    const check = (value: unknown): void => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        return;
      }
      if (typeof value !== 'object' || active.has(value)) {
        throw new GraphQLFixtureError('GraphQL wire data must be acyclic JSON');
      }
      if (!Array.isArray(value)) {
        record(value);
      }
      active.add(value);
      for (const key of Reflect.ownKeys(value)) {
        if (Array.isArray(value) && key === 'length') {
          continue;
        }
        const entry = Object.getOwnPropertyDescriptor(value, key)!;
        if (typeof key !== 'string' || !entry.enumerable || !('value' in entry)) {
          throw new GraphQLFixtureError('GraphQL wire data must contain enumerable JSON fields');
        }
        check(entry.value);
      }
      if (Array.isArray(value) && Object.keys(value).length !== value.length) {
        throw new GraphQLFixtureError('Sparse arrays are not GraphQL wire data');
      }
      active.delete(value);
    };
    check(copied);
    return copied;
  };
  return { clone, wire };
}

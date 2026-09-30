import type { ValidationIssue } from '@mimlet/core';
import type { Type } from 'avsc';
import type avro from 'avsc';
import { AvroFixtureError, fail, record, union } from './values.js';

/** Internal validation operations; prepared once for each native adapter. */
export function createAvroValidation({
  type,
  copy,
}: {
  type: Type;
  copy: (input: unknown, mode: 'schema' | 'input' | 'native') => unknown;
}) {
  const required = (value: unknown, current: Type, path: (string | number)[] = []): void => {
    if (record(current)) {
      const data = value as Record<string, unknown>;
      for (const field of current.fields) {
        if (!Object.hasOwn(data, field.name)) {
          return fail('Record field is required even when it has a default', [...path, field.name]);
        }
        required(data[field.name], field.type, [...path, field.name]);
      }
    } else if (union(current) && value !== null) {
      const [name] = Object.keys(value as object);
      const branch = current.types.find((branch) => branch.branchName === name)!;
      required((value as Record<string, unknown>)[name!], branch, [...path, name!]);
    } else if (current.typeName === 'array') {
      (value as unknown[]).forEach((item, i) =>
        required(item, (current as avro.types.ArrayType).itemsType, [...path, i])
      );
    } else if (current.typeName === 'map') {
      for (const [name, item] of Object.entries(value as object)) {
        if (name === '__proto__') {
          return fail('Native Avro cannot safely round-trip this map key', [...path, name]);
        }
        required(item, (current as avro.types.MapType).valuesType as Type, [...path, name]);
      }
    } else if (current.typeName === 'float' && !Object.is(Math.fround(value as number), value)) {
      return fail('Float must be representable without silent 32-bit rounding', path);
    }
  };
  const checked = (input: unknown, native = false): unknown => {
    const value = copy(input, native ? 'native' : 'input');
    const errors: ValidationIssue[] = [];
    if (
      !type.isValid(value, {
        noUndeclaredFields: true,
        errorHook: (path, _value, type) =>
          errors.push({ message: `Expected Avro ${type.typeName}`, path: [...path] }),
      })
    ) {
      return fail(
        errors[0]?.message ?? 'Avro validation failed',
        (errors[0]?.path as string[]) ?? []
      );
    }
    required(value, type);
    return value;
  };
  const issues = (value: unknown): ValidationIssue[] => {
    try {
      checked(value);
      return [];
    } catch (cause) {
      return [
        {
          message: cause instanceof AvroFixtureError ? cause.message : 'Avro validation failed',
          path: cause instanceof AvroFixtureError ? cause.path : [],
        },
      ];
    }
  };
  return { checked, issues };
}

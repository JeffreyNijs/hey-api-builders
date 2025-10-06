import { describe, it, expect } from 'vitest';
import type { IR } from '@hey-api/openapi-ts';
import { isEnum, isJsonValue, isObjectType } from './schema-validators';

describe('Schema Validators', () => {
  describe('isEnum', () => {
    it('returns true for schema with enum property', () => {
      const schema = {
        enum: ['value1', 'value2', 'value3'],
      } as unknown as IR.SchemaObject;
      expect(isEnum(schema)).toBe(true);
    });

    it('returns true for schema with type enum', () => {
      const schema = {
        type: 'enum',
        items: [{ const: 'value1' }, { const: 'value2' }],
      } as unknown as IR.SchemaObject;
      expect(isEnum(schema)).toBe(true);
    });

    it('returns true for schema with items array of const values', () => {
      const schema = {
        items: [{ const: 'value1' }, { const: 'value2' }],
      } as unknown as IR.SchemaObject;
      expect(isEnum(schema)).toBe(true);
    });

    it('returns false for non-enum schema', () => {
      const schema: IR.SchemaObject = {
        type: 'string',
      };
      expect(isEnum(schema)).toBe(false);
    });

    it('returns false for null or undefined', () => {
      expect(isEnum(null as unknown as IR.SchemaObject)).toBe(false);
      expect(isEnum(undefined as unknown as IR.SchemaObject)).toBe(false);
    });
  });

  describe('isJsonValue', () => {
    it('returns true for null', () => {
      expect(isJsonValue(null)).toBe(true);
    });

    it('returns true for primitives', () => {
      expect(isJsonValue('string')).toBe(true);
      expect(isJsonValue(123)).toBe(true);
      expect(isJsonValue(true)).toBe(true);
      expect(isJsonValue(false)).toBe(true);
    });

    it('returns true for arrays of JSON values', () => {
      expect(isJsonValue([1, 2, 3])).toBe(true);
      expect(isJsonValue(['a', 'b', 'c'])).toBe(true);
      expect(isJsonValue([true, false])).toBe(true);
    });

    it('returns true for objects with JSON values', () => {
      expect(isJsonValue({ a: 1, b: 'test' })).toBe(true);
      expect(isJsonValue({ nested: { value: 123 } })).toBe(true);
    });

    it('returns false for functions', () => {
      expect(isJsonValue(() => {})).toBe(false);
    });

    it('returns false for symbols', () => {
      expect(isJsonValue(Symbol('test'))).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isJsonValue(undefined)).toBe(false);
    });
  });

  describe('isObjectType', () => {
    it('returns true for "object" type', () => {
      expect(isObjectType('object')).toBe(true);
    });

    it('returns true for array containing "object"', () => {
      expect(isObjectType(['object', 'null'])).toBe(true);
      expect(isObjectType(['string', 'object'])).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isObjectType('string')).toBe(false);
      expect(isObjectType('number')).toBe(false);
      expect(isObjectType(['string', 'number'])).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isObjectType(undefined)).toBe(false);
    });
  });
});

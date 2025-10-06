import { describe, it, expect } from 'vitest';
import { generateZodSchema } from './zod-schema-generator';
import type { Schema } from 'json-schema-faker';

describe('Zod Schema Generator', () => {
  describe('generateZodSchema', () => {
    it('generates z.string() for string type', () => {
      const schema: Schema = { type: 'string' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string()');
    });

    it('generates z.number() for number type', () => {
      const schema: Schema = { type: 'number' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.number()');
    });

    it('generates z.number().int() for integer type', () => {
      const schema: Schema = { type: 'integer' };
      const result = generateZodSchema(schema);
      expect(result).toContain('z.number().int()');
    });

    it('generates z.boolean() for boolean type', () => {
      const schema: Schema = { type: 'boolean' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.boolean()');
    });

    it('generates z.null() for null type', () => {
      const schema: Schema = { type: 'null' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.null()');
    });

    it('handles string with uuid format', () => {
      const schema: Schema = { type: 'string', format: 'uuid' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string().uuid()');
    });

    it('handles string with email format', () => {
      const schema: Schema = { type: 'string', format: 'email' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string().email()');
    });

    it('handles string with url format', () => {
      const schema: Schema = { type: 'string', format: 'url' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string().url()');
    });

    it('handles string with date format', () => {
      const schema: Schema = { type: 'string', format: 'date' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string().date()');
    });

    it('handles string with date-time format', () => {
      const schema: Schema = { type: 'string', format: 'date-time' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string().datetime()');
    });

    it('handles string with phone format', () => {
      const schema: Schema = { type: 'string', format: 'phone' };
      const result = generateZodSchema(schema);
      expect(result).toContain('z.string().regex');
      expect(result).toContain('\\+?[1-9]\\d{1,14}');
    });

    it('handles string with minLength', () => {
      const schema: Schema = { type: 'string', minLength: 5 };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string().min(5)');
    });

    it('handles string with maxLength', () => {
      const schema: Schema = { type: 'string', maxLength: 100 };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.string().max(100)');
    });

    it('handles string with min and max length', () => {
      const schema: Schema = { type: 'string', minLength: 5, maxLength: 100 };
      const result = generateZodSchema(schema);
      expect(result).toContain('.min(5)');
      expect(result).toContain('.max(100)');
    });

    it('handles string with pattern', () => {
      const schema: Schema = { type: 'string', pattern: '^[A-Z]+$' };
      const result = generateZodSchema(schema);
      expect(result).toContain('.regex(/^[A-Z]+$/)');
    });

    it('handles number with minimum', () => {
      const schema: Schema = { type: 'number', minimum: 0 };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.number().min(0)');
    });

    it('handles number with maximum', () => {
      const schema: Schema = { type: 'number', maximum: 100 };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.number().max(100)');
    });

    it('handles number with exclusive minimum', () => {
      const schema: Schema = { type: 'number', exclusiveMinimum: 0 };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.number().gt(0)');
    });

    it('handles number with exclusive maximum', () => {
      const schema: Schema = { type: 'number', exclusiveMaximum: 100 };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.number().lt(100)');
    });

    it('handles enum values', () => {
      const schema: Schema = { enum: ['active', 'inactive', 'pending'] };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.enum(["active", "inactive", "pending"])');
    });

    it('handles anyOf with enum-like structure', () => {
      const schema: Schema = {
        anyOf: [{ const: 'value1' }, { const: 'value2' }],
      };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.enum(["value1", "value2"])');
    });

    it('handles array type', () => {
      const schema: Schema = {
        type: 'array',
        items: { type: 'string' },
      };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.array(z.string())');
    });

    it('handles array with minItems', () => {
      const schema: Schema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('.min(1)');
    });

    it('handles array with maxItems', () => {
      const schema: Schema = {
        type: 'array',
        items: { type: 'string' },
        maxItems: 10,
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('.max(10)');
    });

    it('handles tuple (array with multiple item types)', () => {
      const schema: Schema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('z.tuple');
      expect(result).toContain('z.string()');
      expect(result).toContain('z.number()');
    });

    it('handles object with properties', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      const result = generateZodSchema(schema);

      expect(result).toContain('z.object({');
      expect(result).toContain('name: z.string()');
      expect(result).toContain('age: z.number().optional()');
    });

    it('handles object with additionalProperties false', () => {
      const schema: Schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('.strict()');
    });

    it('handles object with additionalProperties schema', () => {
      const schema: Schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: { type: 'string' },
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('.catchall(z.string())');
    });

    it('handles nullable types', () => {
      const schema: Schema = {
        type: ['string', 'null'],
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('z.string().nullable()');
    });

    it('handles union types', () => {
      const schema: Schema = {
        type: ['string', 'number'],
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('z.string()');
    });

    it('handles empty object', () => {
      const schema: Schema = { type: 'object' };
      const result = generateZodSchema(schema);
      expect(result).toBe('z.object({})');
    });

    it('handles properties with special characters', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          'user-name': { type: 'string' },
          'my.email': { type: 'string' },
        },
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('"user-name"');
      expect(result).toContain('"my.email"');
    });

    it('returns z.unknown() for unsupported schema', () => {
      const schema: Schema = {};
      const result = generateZodSchema(schema);
      expect(result).toBe('z.unknown()');
    });

    it('handles nested objects', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
      };
      const result = generateZodSchema(schema);
      expect(result).toContain('user: z.object');
      expect(result).toContain('name: z.string()');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { ZodSchemaGenerator } from './zod-schema-generator';
import type { Schema } from '../types';

describe('Zod Schema Generator', () => {
  describe('ZodSchemaGenerator', () => {
    it('generates z.string() for string type', () => {
      const schema: Schema = { type: 'string' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string()');
    });

    it('generates z.number() for number type', () => {
      const schema: Schema = { type: 'number' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.number()');
    });

    it('generates z.number().int() for integer type', () => {
      const schema: Schema = { type: 'integer' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.number().int()');
    });

    it('generates z.boolean() for boolean type', () => {
      const schema: Schema = { type: 'boolean' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.boolean()');
    });

    it('generates z.null() for null type', () => {
      const schema: Schema = { type: 'null' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.null()');
    });

    it('handles string with uuid format', () => {
      const schema: Schema = { type: 'string', format: 'uuid' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string().uuid()');
    });

    it('handles string with email format', () => {
      const schema: Schema = { type: 'string', format: 'email' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string().email()');
    });

    it('handles string with url format', () => {
      const schema: Schema = { type: 'string', format: 'url' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string().url()');
    });

    it('handles string with date format', () => {
      const schema: Schema = { type: 'string', format: 'date' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string().date()');
    });

    it('handles string with date-time format', () => {
      const schema: Schema = { type: 'string', format: 'date-time' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string().datetime()');
    });

    it('handles string with phone format', () => {
      const schema: Schema = { type: 'string', format: 'phone' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('z.string().regex');
    });

    it('handles string with minLength', () => {
      const schema: Schema = { type: 'string', minLength: 5 };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string().min(5)');
    });

    it('handles string with maxLength', () => {
      const schema: Schema = { type: 'string', maxLength: 100 };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.string().max(100)');
    });

    it('handles string with min and max length', () => {
      const schema: Schema = { type: 'string', minLength: 5, maxLength: 100 };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('.min(5)');
      expect(generator.getGeneratedSchemas()).toContain('.max(100)');
    });

    it('handles string with pattern', () => {
      const schema: Schema = { type: 'string', pattern: '^[A-Z]+$' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('.regex(/^[A-Z]+$/)');
    });

    it('handles number with minimum', () => {
      const schema: Schema = { type: 'number', minimum: 0 };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.number().min(0)');
    });

    it('handles number with maximum', () => {
      const schema: Schema = { type: 'number', maximum: 100 };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.number().max(100)');
    });

    it('handles number with exclusive minimum', () => {
      const schema: Schema = { type: 'number', exclusiveMinimum: 0 };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.number().gt(0)');
    });

    it('handles number with exclusive maximum', () => {
      const schema: Schema = { type: 'number', exclusiveMaximum: 100 };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.number().lt(100)');
    });

    it('handles enum values', () => {
      const schema: Schema = { enum: ['active', 'inactive', 'pending'] };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.enum(["active", "inactive", "pending"])');
    });

    it('handles anyOf with enum-like structure', () => {
      const schema: Schema = {
        anyOf: [{ const: 'value1' }, { const: 'value2' }],
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.enum(["value1", "value2"])');
    });

    it('handles array type', () => {
      const schema: Schema = {
        type: 'array',
        items: { type: 'string' },
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('export const testSchema = z.array(z.string())');
    });

    it('handles array with minItems', () => {
      const schema: Schema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('.min(1)');
    });

    it('handles array with maxItems', () => {
      const schema: Schema = {
        type: 'array',
        items: { type: 'string' },
        maxItems: 10,
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('.max(10)');
    });

    it('handles tuple (array with multiple item types)', () => {
      const schema: Schema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('z.tuple');
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
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('z.object({');
      expect(generator.getGeneratedSchemas()).toContain('name: z.string()');
      expect(generator.getGeneratedSchemas()).toContain('age: z.number().optional()');
    });

    it('handles object with additionalProperties false', () => {
      const schema: Schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('.strict()');
    });

    it('handles object with additionalProperties schema', () => {
      const schema: Schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
        additionalProperties: { type: 'string' },
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('.catchall(z.string())');
    });

    it('handles nullable types', () => {
      const schema: Schema = {
        type: ['string', 'null'],
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('z.string().nullable()');
    });

    it('handles union types', () => {
      const schema: Schema = {
        type: ['string', 'number'],
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('z.string()');
    });

    it('handles empty object', () => {
      const schema: Schema = { type: 'object' };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('z.object({})');
    });

    it('handles properties with special characters', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          'user-name': { type: 'string' },
          'my.email': { type: 'string' },
        },
      };
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('"user-name"');
      expect(generator.getGeneratedSchemas()).toContain('"my.email"');
    });

    it('returns z.unknown() for unsupported schema', () => {
      const schema: Schema = {};
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('z.unknown()');
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
      const generator = new ZodSchemaGenerator();
      const result = generator.generate(schema, 'test');
      expect(result).toBe('testSchema');
      expect(generator.getGeneratedSchemas()).toContain('user: z.object');
    });
  });
});

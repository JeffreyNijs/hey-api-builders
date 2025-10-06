import { describe, it, expect } from 'vitest';
import { generateMock } from './mock-runtime';

describe('Custom Mock Runtime', () => {
  describe('generateMock', () => {
    it('generates mock from simple string schema', () => {
      const schema = { type: 'string' };
      const result = generateMock(schema);

      expect(typeof result).toBe('string');
    });

    it('generates mock from number schema', () => {
      const schema = { type: 'number' };
      const result = generateMock(schema);

      expect(typeof result).toBe('number');
    });

    it('generates mock from boolean schema', () => {
      const schema = { type: 'boolean' };
      const result = generateMock(schema);

      expect(typeof result).toBe('boolean');
    });

    it('generates mock from object schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      const result = generateMock<{ name: string; age?: number }>(schema);

      expect(result).toHaveProperty('name');
      expect(typeof result.name).toBe('string');
    });

    it('generates mock from array schema', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
      };
      const result = generateMock<string[]>(schema);

      expect(Array.isArray(result)).toBe(true);
    });

    it('respects enum values', () => {
      const schema = {
        type: 'string',
        enum: ['active', 'inactive'],
      };
      const result = generateMock<string>(schema);

      expect(['active', 'inactive']).toContain(result);
    });

    it('uses default value when useDefault is true', () => {
      const schema = {
        type: 'string',
        default: 'default-value',
      };
      const result = generateMock<string>(schema, { useDefault: true });

      expect(result).toBe('default-value');
    });

    it('uses example value when useExamples is true', () => {
      const schema = {
        type: 'string',
        examples: ['example-value'],
      };
      const result = generateMock<string>(schema, { useExamples: true });

      expect(result).toBe('example-value');
    });

    it('respects minLength for strings', () => {
      const schema = {
        type: 'string',
        minLength: 10,
      };
      const result = generateMock<string>(schema);

      expect(result.length).toBeGreaterThanOrEqual(10);
    });

    it('respects maxLength for strings', () => {
      const schema = {
        type: 'string',
        maxLength: 5,
      };
      const result = generateMock<string>(schema);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('respects minimum for numbers', () => {
      const schema = {
        type: 'number',
        minimum: 10,
      };
      const result = generateMock<number>(schema);

      expect(result).toBeGreaterThanOrEqual(10);
    });

    it('respects maximum for numbers', () => {
      const schema = {
        type: 'number',
        maximum: 100,
      };
      const result = generateMock<number>(schema);

      expect(result).toBeLessThanOrEqual(100);
    });

    it('handles requiredOnly option', () => {
      const schema = {
        type: 'object',
        properties: {
          required1: { type: 'string' },
          optional1: { type: 'string' },
        },
        required: ['required1'],
      };
      const result = generateMock<Record<string, unknown>>(schema, { requiredOnly: true });

      expect(result).toHaveProperty('required1');
    });

    it('generates consistent types for schemas', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          count: { type: 'integer' },
        },
        required: ['id', 'email', 'count'],
      };
      const result = generateMock<{ id: string; email: string; count: number }>(schema);

      expect(typeof result.id).toBe('string');
      expect(typeof result.email).toBe('string');
      expect(typeof result.count).toBe('number');
    });

    it('handles nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };
      const result = generateMock<{ user: { name: string } }>(schema);

      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('name');
    });

    it('handles arrays of objects', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
        minItems: 1,
      };
      const result = generateMock<Array<{ name: string }>>(schema);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toHaveProperty('name');
    });
  });
});

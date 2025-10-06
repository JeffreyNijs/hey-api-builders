import { describe, it, expect } from 'vitest';
import { generateStaticMockCode } from './static-mock-generator';
import type { Schema } from '../types';

describe('Static Mock Generator', () => {
  describe('generateStaticMockCode', () => {
    it('generates correct mock for string with email format', () => {
      const schema: Schema = {
        type: 'string',
        format: 'email',
      };
      const result = generateStaticMockCode(schema, 'Email');
      expect(result).toBe('"user@example.com"');
    });

    it('generates correct mock for string with uuid format', () => {
      const schema: Schema = {
        type: 'string',
        format: 'uuid',
      };
      const result = generateStaticMockCode(schema, 'UUID');
      expect(result).toBe('"550e8400-e29b-41d4-a716-446655440000"');
    });

    it('generates correct mock for string with url format', () => {
      const schema: Schema = {
        type: 'string',
        format: 'url',
      };
      const result = generateStaticMockCode(schema, 'URL');
      expect(result).toBe('"https://example.com"');
    });

    it('generates correct mock for string with date format', () => {
      const schema: Schema = {
        type: 'string',
        format: 'date',
      };
      const result = generateStaticMockCode(schema, 'Date');
      expect(result).toBe('"2024-01-01"');
    });

    it('generates correct mock for string with date-time format', () => {
      const schema: Schema = {
        type: 'string',
        format: 'date-time',
      };
      const result = generateStaticMockCode(schema, 'DateTime');
      expect(result).toBe('"2024-01-01T00:00:00.000Z"');
    });

    it('generates correct mock for plain string', () => {
      const schema: Schema = {
        type: 'string',
      };
      const result = generateStaticMockCode(schema, 'String');
      expect(result).toBe('"aaaaa"');
    });

    it('respects minLength for strings', () => {
      const schema: Schema = {
        type: 'string',
        minLength: 10,
      };
      const result = generateStaticMockCode(schema, 'String');
      expect(result).toBe('"aaaaaaaaaa"');
    });

    it('generates correct mock for number', () => {
      const schema: Schema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
      };
      const result = generateStaticMockCode(schema, 'Number');
      expect(result).toBe('50');
    });

    it('generates correct mock for integer', () => {
      const schema: Schema = {
        type: 'integer',
        minimum: 0,
        maximum: 10,
      };
      const result = generateStaticMockCode(schema, 'Integer');
      expect(result).toBe('5');
    });

    it('generates correct mock for boolean', () => {
      const schema: Schema = {
        type: 'boolean',
      };
      const result = generateStaticMockCode(schema, 'Boolean');
      expect(result).toBe('true');
    });

    it('generates correct mock for enum', () => {
      const schema: Schema = {
        enum: ['active', 'inactive', 'pending'],
      };
      const result = generateStaticMockCode(schema, 'Status');
      expect(result).toBe('"active"');
    });

    it('generates correct mock for array', () => {
      const schema: Schema = {
        type: 'array',
        items: {
          type: 'string',
        },
      };
      const result = generateStaticMockCode(schema, 'StringArray');
      expect(result).toBe('["aaaaa"]');
    });

    it('generates correct mock for simple object', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      };
      const result = generateStaticMockCode(schema, 'User');
      expect(result).toContain('id: "550e8400-e29b-41d4-a716-446655440000"');
      expect(result).toContain('name: "aaaaa"');
    });

    it('only includes required properties in objects', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          optional: { type: 'string' },
        },
        required: ['id', 'name'],
      };
      const result = generateStaticMockCode(schema, 'User');
      expect(result).toContain('id:');
      expect(result).toContain('name:');
      expect(result).not.toContain('optional:');
    });

    it('handles nested objects', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['id'],
          },
        },
        required: ['user'],
      };
      const result = generateStaticMockCode(schema, 'Wrapper');
      expect(result).toContain('user:');
      expect(result).toContain('id:');
    });

    it('uses default value if provided', () => {
      const schema: Schema = {
        type: 'string',
        default: 'default-value',
      };
      const result = generateStaticMockCode(schema, 'String');
      expect(result).toBe('"default-value"');
    });

    it('uses example value if provided', () => {
      const schema: Schema = {
        type: 'number',
        examples: [42],
      };
      const result = generateStaticMockCode(schema, 'Number');
      expect(result).toBe('42');
    });
  });
});

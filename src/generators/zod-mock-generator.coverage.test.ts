import { describe, it, expect } from 'vitest';
import { generateZodSchema } from './zod-mock-generator';
import type { Schema } from '../types';

describe('zod-mock-generator coverage', () => {
  it('should generate tuple zod schema', () => {
    // Covers generateZodArray with tuple items
    const schema: Schema = {
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
    };

    const code = generateZodSchema(schema);
    expect(code).toBe('z.tuple([z.string(), z.number()])');
  });

  it('should generate union type for array of types', () => {
    // Covers generateZodSchemaInternal with Array.isArray(schema.type) length > 1
    const schema: Schema = {
      type: ['string', 'number'],
    };

    const code = generateZodSchema(schema);
    expect(code).toBe('z.union([z.string(), z.number()])');
  });

  it('should handle nullable union types', () => {
    const schema: Schema = {
      type: ['string', 'number', 'null'],
    };
    const code = generateZodSchema(schema);
    expect(code).toBe('z.union([z.string(), z.number()]).nullable()');
  });

  it('should handle nullable single type', () => {
    const schema: Schema = {
      type: ['string', 'null'],
    };
    const code = generateZodSchema(schema);
    expect(code).toBe('z.string().nullable()');
  });
});

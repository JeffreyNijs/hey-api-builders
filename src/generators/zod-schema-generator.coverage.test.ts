import { describe, it, expect } from 'vitest';
import { generateZodSchema } from './zod-schema-generator';
import type { Schema } from '../types';

describe('zod-schema-generator coverage', () => {
  it('should generate tuple zod schema', () => {
    // Covers generateZodArray with tuple items
    const schema: Schema = {
      type: 'array',
      items: [{ type: 'string' }, { type: 'number' }],
    };

    const code = generateZodSchema(schema);
    expect(code).toBe('z.tuple([z.string(), z.number()])');
  });
});

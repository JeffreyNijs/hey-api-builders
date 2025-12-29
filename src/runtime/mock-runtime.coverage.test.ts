import { describe, it, expect } from 'vitest';
import { generateMock } from './mock-runtime';
import type { Schema } from '../types';

describe('mock-runtime coverage', () => {
  it('should not include optionals when optionalsProbability is false', () => {
    // Covers line 261-262: if (this.options.optionalsProbability === false) return false;
    const schema: Schema = {
      type: 'object',
      properties: {
        req: { type: 'string' },
        opt: { type: 'string' },
      },
      required: ['req'],
    };

    // run multiple times to be sure
    for (let i = 0; i < 20; i++) {
      const result = generateMock<Record<string, unknown>>(schema, { optionalsProbability: false });
      expect(result.opt).toBeUndefined();
      expect(result.req).toBeDefined();
    }
  });

  it('should include nulls probabilistically when omitNulls is false (default)', () => {
    // Covers line 268-269: return !this.options.omitNulls && Math.random() < 0.1;
    const originalRandom = Math.random;
    Math.random = () => 0.05;

    try {
      const schema: Schema = {
        type: 'string',
        nullable: true,
      };

      const result = generateMock(schema, { omitNulls: false });
      expect(result).toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should NOT include nulls when omitNulls is true', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.05; // Would normally cause null

    try {
      const schema: Schema = {
        type: 'string',
        nullable: true,
      };

      const result = generateMock(schema, { omitNulls: true });
      expect(result).not.toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('should omit null properties in object when omitNulls is true', () => {
    // Covers generateObject -> omitNulls check
    // We need to force generateValue to return null even if omitNulls is true.
    // This happens if the schema forces null (e.g. type: 'null').

    const schema: Schema = {
      type: 'object',
      properties: {
        a: { type: 'null' }, // Forces null
        b: { type: 'string' }, // non-nullable
      },
      required: ['a', 'b'],
    };

    const result = generateMock<Record<string, unknown>>(schema, { omitNulls: true });

    // 'a' should be skipped because it is null and omitNulls is true
    expect(result.a).toBeUndefined();
    expect(result.b).toBeDefined();
  });

  it('should handle number generation edge cases', () => {
    // Case 1: multipleOf causing value adjust
    const schema: Schema = {
      type: 'integer',
      minimum: 0,
      maximum: 10,
      multipleOf: 3,
    };

    const res = generateMock<number>(schema);
    expect(res % 3).toBe(0);

    // Case 2: exclusiveMinimum
    const schemaExMin: Schema = {
      type: 'integer',
      exclusiveMinimum: 5,
      maximum: 10,
    };
    const resExMin = generateMock<number>(schemaExMin);
    expect(resExMin).toBeGreaterThan(5);

    // Case 3: exclusiveMaximum
    const schemaExMax: Schema = {
      type: 'integer',
      minimum: 0,
      exclusiveMaximum: 5,
    };
    const resExMax = generateMock<number>(schemaExMax);
    expect(resExMax).toBeLessThan(5);
  });

  it('should handle generateValue with seenRefs to avoid infinite recursion', () => {
    const schemaWithRef: Schema = {
      type: 'object',
      properties: {
        a: { $ref: 'ref1', type: 'string' },
        b: { $ref: 'ref1', type: 'string' },
      },
    };

    const res = generateMock<Record<string, unknown>>(schemaWithRef);
    expect(res.a).toBeDefined();
    expect(res.b).toBeNull();
  });

  it('should generate merged object for allOf', () => {
    // Covers generateAllOf
    const schema: Schema = {
      allOf: [
        { type: 'object', properties: { a: { type: 'string' } } },
        { type: 'object', properties: { b: { type: 'number' } } },
      ],
    };

    const res = generateMock<Record<string, unknown>>(schema);
    expect(res.a).toBeDefined();
    expect(res.b).toBeDefined();
  });
});

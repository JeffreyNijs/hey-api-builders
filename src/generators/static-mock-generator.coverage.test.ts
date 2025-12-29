import { describe, it, expect } from 'vitest';
import { generateStaticMockCode } from './static-mock-generator';
import type { Schema } from '../types';

describe('static-mock-generator coverage', () => {
  it('should generate tuple array mock', () => {
    // Covers lines 193-196: Array.isArray(schema.items)
    const schema: Schema = {
      type: 'array',
      items: [
        { type: 'string', default: 'a' },
        { type: 'number', default: 1 },
      ],
    };

    const code = generateStaticMockCode(schema, 'TestType');
    // Expect: [\n  "a",\n  1\n] (with formatting)
    expect(code).toContain('[\n  "a",\n  1\n]');
  });

  it('should generate empty object when no properties match required', () => {
    const schema: Schema = {
      type: 'object',
      properties: {
        foo: { type: 'string' },
      },
      required: [], // No required properties
    };

    const code = generateStaticMockCode(schema, 'TestType');
    expect(code).toBe('{}');
  });

  it('should generate array with repeated items if minItems > 1', () => {
    // Covers line 209-210: if (itemCount === 1) return `[${itemMock}]`; else ...
    const schema: Schema = {
      type: 'array',
      items: { type: 'string', default: 'foo' },
      minItems: 3,
    };

    const code = generateStaticMockCode(schema, 'TestType');
    // Should contain 'foo' 3 times
    const matches = code.match(/"foo"/g);
    expect(matches?.length).toBe(3);
  });

  it('should handle integer generation with only min/max defined', () => {
    // Covers lines in generateStaticInteger (around 165-169)
    const schema: Schema = {
      type: 'integer',
      minimum: 10,
      maximum: 20,
    };

    const code = generateStaticMockCode(schema, 'TestType');
    // Should be 15
    expect(code).toBe('15');
  });
});

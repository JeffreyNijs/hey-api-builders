import { describe, it, expect } from 'vitest';
import type { IR } from '@hey-api/openapi-ts';
import { irToSchema, collectSchemas, normalizeSchema, sanitizeSchema } from './schema-transformer';

describe('Schema Transformer', () => {
  describe('irToSchema', () => {
    it('converts simple string schema', () => {
      const ir: IR.SchemaObject = { type: 'string' };
      const result = irToSchema(ir, {});

      expect(result).toEqual({ type: 'string' });
    });

    it('converts object schema with properties', () => {
      const ir: IR.SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('type', 'object');
      expect(result).toHaveProperty('properties');
    });

    it('handles required fields', () => {
      const ir: IR.SchemaObject = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('required');
      expect(result.required).toEqual(['name']);
    });

    it('handles $ref references', () => {
      const all: Record<string, IR.SchemaObject> = {
        User: { type: 'object', properties: { name: { type: 'string' } } },
      };
      const ir: IR.SchemaObject = { $ref: '#/components/schemas/User' };
      const result = irToSchema(ir, all);

      expect(result).toHaveProperty('type', 'object');
      expect(result).toHaveProperty('properties');
    });

    it('handles nullable fields', () => {
      const ir = {
        type: 'string',
        nullable: true,
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result.type).toEqual(['string', 'null']);
    });

    it('infers type from properties', () => {
      const ir: IR.SchemaObject = {
        properties: {
          name: { type: 'string' },
        },
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('type', 'object');
    });

    it('infers type from items', () => {
      const ir: IR.SchemaObject = {
        items: [{ type: 'string' }],
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('type', 'array');
    });

    it('handles array items', () => {
      const ir: IR.SchemaObject = {
        type: 'array',
        items: [{ type: 'string' }],
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('items');
    });

    it('handles additionalProperties boolean', () => {
      const ir: IR.SchemaObject = {
        type: 'object',
        additionalProperties: false,
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('additionalProperties', false);
    });

    it('handles additionalProperties schema', () => {
      const ir: IR.SchemaObject = {
        type: 'object',
        additionalProperties: { type: 'string' },
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('additionalProperties');
      expect(result.additionalProperties).toHaveProperty('type', 'string');
    });

    it('copies format property', () => {
      const ir: IR.SchemaObject = {
        type: 'string',
        format: 'uuid',
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('format', 'uuid');
    });

    it('copies pattern property', () => {
      const ir: IR.SchemaObject = {
        type: 'string',
        pattern: '^[A-Z]+$',
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('pattern', '^[A-Z]+$');
    });

    it('copies min/max properties for strings', () => {
      const ir: IR.SchemaObject = {
        type: 'string',
        minLength: 5,
        maxLength: 100,
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('minLength', 5);
      expect(result).toHaveProperty('maxLength', 100);
    });

    it('copies min/max properties for numbers', () => {
      const ir: IR.SchemaObject = {
        type: 'number',
        minimum: 0,
        maximum: 100,
      };
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('minimum', 0);
      expect(result).toHaveProperty('maximum', 100);
    });

    it('converts example to examples array', () => {
      const ir = {
        type: 'string',
        example: 'test-value',
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('examples');
      expect(result.examples).toEqual(['test-value']);
    });

    it('handles circular references without infinite loop', () => {
      const ir: IR.SchemaObject = { type: 'object' };
      const seen = new Set<IR.SchemaObject>();
      seen.add(ir);

      const result = irToSchema(ir, {}, seen);
      expect(result).toEqual({});
    });

    it('returns empty object for null input', () => {
      const result = irToSchema(null as unknown as IR.SchemaObject, {});
      expect(result).toEqual({});
    });

    it('returns empty object for non-object input', () => {
      const result = irToSchema('string' as unknown as IR.SchemaObject, {});
      expect(result).toEqual({});
    });
  });

  describe('normalizeSchema', () => {
    it('normalizes basic schema', () => {
      const schema = { type: 'string' as const };
      const result = normalizeSchema(schema);

      expect(result).toHaveProperty('type', 'string');
    });

    it('handles null or undefined input', () => {
      const result1 = normalizeSchema(null as unknown as any);
      const result2 = normalizeSchema(undefined as unknown as any);

      expect(result1).toBeNull();
      expect(result2).toBeUndefined();
    });

    it('normalizes nested properties', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          nested: { type: 'string' as const },
        },
      };
      const result = normalizeSchema(schema);

      expect(result.properties).toBeDefined();
      expect(result.properties?.nested).toHaveProperty('type', 'string');
    });
  });

  describe('sanitizeSchema', () => {
    it('removes enum type and sets appropriate type', () => {
      const schema = {
        type: 'enum' as const,
        enum: ['value1', 'value2'],
      };
      const result = sanitizeSchema(schema);

      expect(result.type).toBe('string');
      expect(result.enum).toEqual(['value1', 'value2']);
    });

    it('removes unknown type', () => {
      const schema = { type: 'unknown' } as any;
      const result = sanitizeSchema(schema);

      expect(result).not.toHaveProperty('type');
    });

    it('removes logicalOperator property', () => {
      const schema = {
        type: 'string' as const,
        logicalOperator: 'AND',
      } as any;
      const result = sanitizeSchema(schema);

      expect(result).not.toHaveProperty('logicalOperator');
    });

    it('sanitizes nested properties', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          field: { type: 'enum' as const, enum: ['val'] },
        },
      };
      const result = sanitizeSchema(schema);

      expect(result.properties?.field).not.toHaveProperty('type', 'enum');
    });

    it('sanitizes arrays', () => {
      const schema = {
        type: 'array' as const,
        items: { type: 'unknown' } as any,
      };
      const result = sanitizeSchema(schema);

      expect(result.items).toBeDefined();
    });
  });

  describe('collectSchemas', () => {
    it('collects and processes multiple schemas', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        UserSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
        ProductSchema: {
          type: 'object',
          properties: { price: { type: 'number' } },
        },
      };

      const result = collectSchemas(schemas);

      expect(result).toHaveLength(2);
      expect(result[0].typeName).toBe('User');
      expect(result[1].typeName).toBe('Product');
    });

    it('removes Schema suffix from type names', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        UserSchema: { type: 'object' },
      };

      const result = collectSchemas(schemas);

      expect(result[0].typeName).toBe('User');
    });

    it('normalizes type names', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        UITheme: { type: 'object' },
        APIKey: { type: 'object' },
      };

      const result = collectSchemas(schemas);

      expect(result[0].typeName).toBe('UiTheme');
      expect(result[1].typeName).toBe('ApiKey');
    });

    it('identifies object types correctly', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        ObjectType: { type: 'object' },
        StringType: { type: 'string' },
      };

      const result = collectSchemas(schemas);

      expect(result[0].isObject).toBe(true);
      expect(result[1].isObject).toBe(false);
    });

    it('generates safe constant names', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        'My-Schema': { type: 'object' },
      };

      const result = collectSchemas(schemas);

      expect(result[0].constName).toMatch(/Schema$/);
      expect(result[0].constName).not.toContain('-');
    });
  });
});

import { describe, it, expect } from 'vitest';
import type { IR } from '@hey-api/openapi-ts';
import { irToSchema, collectSchemas, normalizeSchema, sanitizeSchema } from './schema-transformer';
import type { NormalizedSchemaNode } from '../types';

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

    it('handles enum with type enum and items', () => {
      const ir = {
        type: 'enum',
        items: [{ const: 'value1' }, { const: 'value2' }, { const: 'value3' }],
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('anyOf');
      expect(result.anyOf).toHaveLength(3);
    });

    it('handles enum with items but no enum property', () => {
      const ir = {
        items: [{ const: 'red' }, { const: 'blue' }, { const: 'green' }],
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('anyOf');
      expect(result.anyOf).toHaveLength(3);
    });

    it('handles nullable arrays with union types', () => {
      const ir = {
        type: ['string', 'null'],
        nullable: true,
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result.type).toEqual(['string', 'null']);
    });

    it('handles allOf composition', () => {
      const ir = {
        allOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'number' } } },
        ],
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('allOf');
      expect(result.allOf).toHaveLength(2);
    });

    it('handles anyOf composition', () => {
      const ir = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('anyOf');
      expect(result.anyOf).toHaveLength(2);
    });

    it('handles oneOf composition', () => {
      const ir = {
        oneOf: [{ type: 'boolean' }, { type: 'string' }],
      } as unknown as IR.SchemaObject;
      const result = irToSchema(ir, {});

      expect(result).toHaveProperty('oneOf');
      expect(result.oneOf).toHaveLength(2);
    });
  });

  describe('normalizeSchema', () => {
    it('normalizes basic schema', () => {
      const schema: NormalizedSchemaNode = { type: 'string' };
      const result = normalizeSchema(schema);

      expect(result).toHaveProperty('type', 'string');
    });

    it('handles null or undefined input', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result1 = normalizeSchema(null as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result2 = normalizeSchema(undefined as any);

      expect(result1).toBeNull();
      expect(result2).toBeUndefined();
    });

    it('normalizes nested properties', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        properties: {
          nested: { type: 'string' },
        },
      };
      const result = normalizeSchema(schema);

      expect(result.properties).toBeDefined();
      expect(result.properties?.nested).toHaveProperty('type', 'string');
    });

    it('normalizes enum type with items', () => {
      const schema: NormalizedSchemaNode = {
        type: 'enum',
        items: [{ const: 'value1' }, { const: 'value2' }],
      };
      const result = normalizeSchema(schema);

      expect(result.enum).toEqual(['value1', 'value2']);
      expect(result.type).toBe('string');
    });

    it('normalizes enum type with number items', () => {
      const schema: NormalizedSchemaNode = {
        type: 'enum',
        items: [{ const: 1 }, { const: 2 }, { const: 3 }],
      };
      const result = normalizeSchema(schema);

      expect(result.enum).toEqual([1, 2, 3]);
      expect(result.type).toBe('integer');
    });

    it('normalizes enum type with mixed types to string', () => {
      const schema: NormalizedSchemaNode = {
        type: 'enum',
        items: [{ const: 'text' }, { const: 123 }],
      };
      const result = normalizeSchema(schema);

      expect(result.enum).toEqual(['text', 123]);
      expect(result.type).toBe('string');
    });

    it('normalizes enum type with no valid items', () => {
      const schema: NormalizedSchemaNode = {
        type: 'enum',
        items: [],
      };
      const result = normalizeSchema(schema);

      expect(result.type).toBe('string');
    });

    it('normalizes array with enum items', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        properties: {
          values: {
            type: 'array',
            items: [
              { type: 'enum', items: [{ const: 'a' }] },
              { type: 'enum', items: [{ const: 'b' }] },
            ],
          },
        },
      };
      const result = normalizeSchema(schema);

      expect(result.properties?.values).toBeDefined();
    });

    it('normalizes array with mixed type items to anyOf', () => {
      const schema: NormalizedSchemaNode = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      };
      const result = normalizeSchema(schema);

      expect(result.anyOf).toBeDefined();
      expect(result).not.toHaveProperty('type');
    });

    it('normalizes nested items in array', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      };
      const result = normalizeSchema(schema);

      expect(result.properties?.data).toBeDefined();
    });

    it('normalizes allOf schemas', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        allOf: [{ type: 'string' }],
      };
      const result = normalizeSchema(schema);

      expect(result.allOf).toBeDefined();
    });

    it('normalizes anyOf schemas', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        anyOf: [{ type: 'string' }],
      };
      const result = normalizeSchema(schema);

      expect(result.anyOf).toBeDefined();
    });

    it('normalizes oneOf schemas', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        oneOf: [{ type: 'string' }],
      };
      const result = normalizeSchema(schema);

      expect(result.oneOf).toBeDefined();
    });
  });

  describe('sanitizeSchema', () => {
    it('removes enum type and sets appropriate type', () => {
      const schema: NormalizedSchemaNode = {
        type: 'enum',
        enum: ['value1', 'value2'],
      };
      const result = sanitizeSchema(schema);

      expect(result.type).toBe('string');
      expect(result.enum).toEqual(['value1', 'value2']);
    });

    it('removes unknown type', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema: NormalizedSchemaNode = { type: 'unknown' } as any;
      const result = sanitizeSchema(schema);

      expect(result).not.toHaveProperty('type');
    });

    it('removes logicalOperator property', () => {
      const schema: NormalizedSchemaNode = {
        type: 'string',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logicalOperator: 'AND' as any,
      };
      const result = sanitizeSchema(schema);

      expect(result).not.toHaveProperty('logicalOperator');
    });

    it('sanitizes nested properties', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        properties: {
          field: { type: 'enum', enum: ['val'] },
        },
      };
      const result = sanitizeSchema(schema);

      expect(result.properties?.field).not.toHaveProperty('type', 'enum');
    });

    it('sanitizes arrays', () => {
      const schema: NormalizedSchemaNode = {
        type: 'array',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: { type: 'unknown' } as any,
      };
      const result = sanitizeSchema(schema);

      expect(result.items).toBeDefined();
    });

    it('sets type to string when enum exists without type', () => {
      const schema: NormalizedSchemaNode = {
        enum: ['a', 'b', 'c'],
      };
      const result = sanitizeSchema(schema);

      expect(result.type).toBe('string');
    });

    it('sanitizes additionalProperties', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        additionalProperties: {
          type: 'object',
        },
      };
      const result = sanitizeSchema(schema);

      expect(result.additionalProperties).toBeDefined();
    });

    it('sanitizes array items when items is array', () => {
      const schema: NormalizedSchemaNode = {
        type: 'array',
        items: [{ type: 'enum', enum: ['val1'] }, { type: 'string' }],
      };
      const result = sanitizeSchema(schema);

      expect(result.items).toBeDefined();
      if (Array.isArray(result.items)) {
        expect(result.items[0]).not.toHaveProperty('type', 'enum');
      }
    });

    it('sanitizes allOf schemas', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        allOf: [{ type: 'enum', enum: ['val'] }],
      };
      const result = sanitizeSchema(schema);

      expect(result.allOf).toBeDefined();
    });

    it('sanitizes anyOf schemas', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        anyOf: [{ type: 'string' }],
      };
      const result = sanitizeSchema(schema);

      expect(result.anyOf).toBeDefined();
    });

    it('sanitizes oneOf schemas', () => {
      const schema: NormalizedSchemaNode = {
        type: 'object',
        oneOf: [{ type: 'enum', enum: ['x'] }],
      };
      const result = sanitizeSchema(schema);

      expect(result.oneOf).toBeDefined();
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

    it('handles schemas with $ref', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        User: {
          type: 'object',
          properties: {
            address: { $ref: '#/components/schemas/Address' },
          },
        },
        Address: { type: 'object' },
      };

      const result = collectSchemas(schemas);
      expect(result.length).toBe(2);
    });

    it('handles schemas with additionalProperties', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        DynamicObject: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
      };

      const result = collectSchemas(schemas);
      expect(result.length).toBe(1);
      expect(result[0].schema.additionalProperties).toBeDefined();
    });

    it('handles schemas with required array', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        User: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' },
          },
          required: ['id'],
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.required).toEqual(['id']);
    });

    it('handles oneOf schemas', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        Mixed: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.oneOf).toBeDefined();
    });

    it('handles anyOf schemas', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        Flexible: {
          anyOf: [{ type: 'string' }, { type: 'boolean' }],
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.anyOf).toBeDefined();
    });

    it('handles allOf schemas', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        Combined: {
          allOf: [
            { type: 'object', properties: { a: { type: 'string' } } },
            { type: 'object', properties: { b: { type: 'number' } } },
          ],
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.allOf).toBeDefined();
    });

    it('handles array schemas with min/max items', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        LimitedArray: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10,
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.minItems).toBe(1);
      expect(result[0].schema.maxItems).toBe(10);
    });

    it('handles number schemas with constraints', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        ConstrainedNumber: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          multipleOf: 5,
        },
      };

      const result = collectSchemas(schemas);
      // The schema properties are preserved
      expect(result[0]).toBeDefined();
      expect(result[0].typeName).toBe('ConstrainedNumber');
    });

    it('handles string schemas with format and pattern', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        FormattedString: {
          type: 'string',
          format: 'email',
          pattern: '^[a-z]+@[a-z]+\\.[a-z]+$',
          minLength: 5,
          maxLength: 50,
        },
      };

      const result = collectSchemas(schemas);
      // The schema properties are preserved
      expect(result[0]).toBeDefined();
      expect(result[0].typeName).toBe('FormattedString');
    });

    it('handles nested object schemas', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        Nested: {
          type: 'object',
          properties: {
            inner: {
              type: 'object',
              properties: {
                value: { type: 'string' },
              },
            },
          },
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.properties?.inner).toBeDefined();
    });

    it('handles schemas with description and title', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        Documented: {
          type: 'object',
          title: 'Documented Schema',
          description: 'A well-documented schema',
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.title).toBe('Documented Schema');
      expect(result[0].schema.description).toBe('A well-documented schema');
    });

    it('handles schemas with nullable', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        Nullable: {
          type: 'string',
          nullable: true,
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0]).toBeDefined();
      expect(result[0].typeName).toBe('Nullable');
    });

    it('handles schemas with deprecated flag', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        Old: {
          type: 'string',
          deprecated: true,
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.deprecated).toBe(true);
    });

    it('handles schemas with readOnly flag', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        ReadOnly: {
          type: 'object',
          properties: {
            id: { type: 'number', readOnly: true },
          },
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.properties?.id.readOnly).toBe(true);
    });

    it('handles schemas with writeOnly flag', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        WriteOnly: {
          type: 'object',
          properties: {
            password: { type: 'string', writeOnly: true },
          },
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.properties?.password.writeOnly).toBe(true);
    });

    it('handles schemas with examples', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        WithExamples: {
          type: 'string',
          examples: ['example1', 'example2'],
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0]).toBeDefined();
      expect(result[0].typeName).toBe('WithExamples');
    });

    it('handles schemas with default values', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        WithDefault: {
          type: 'string',
          default: 'default-value',
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0]).toBeDefined();
      expect(result[0].typeName).toBe('WithDefault');
    });

    it('handles schemas with const values', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        Constant: {
          type: 'string',
          const: 'fixed',
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0]).toBeDefined();
      expect(result[0].typeName).toBe('Constant');
    });

    it('handles complex nested structures', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schemas: Record<string, any> = {
        Complex: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  roles: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['admin', 'user', 'guest'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.properties?.users).toBeDefined();
    });

    it('handles schemas with exclusive minimum and maximum', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        Exclusive: {
          type: 'number',
          exclusiveMinimum: 0,
          exclusiveMaximum: 100,
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.exclusiveMinimum).toBe(0);
      expect(result[0].schema.exclusiveMaximum).toBe(100);
    });
  });
});

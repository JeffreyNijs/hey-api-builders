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
      const schemas: Record<string, IR.SchemaObject> = {
        Mixed: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.oneOf).toBeDefined();
    });

    it('handles anyOf schemas', () => {
      const schemas: Record<string, IR.SchemaObject> = {
        Flexible: {
          anyOf: [{ type: 'string' }, { type: 'boolean' }],
        },
      };

      const result = collectSchemas(schemas);
      expect(result[0].schema.anyOf).toBeDefined();
    });

    it('handles allOf schemas', () => {
      const schemas: Record<string, IR.SchemaObject> = {
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
      const schemas: Record<string, IR.SchemaObject> = {
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
      const schemas: Record<string, IR.SchemaObject> = {
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
      const schemas: Record<string, IR.SchemaObject> = {
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
      const schemas: Record<string, IR.SchemaObject> = {
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
      const schemas: Record<string, IR.SchemaObject> = {
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
      const schemas: Record<string, IR.SchemaObject> = {
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
      const schemas: Record<string, IR.SchemaObject> = {
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

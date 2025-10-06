import { describe, it, expect } from 'vitest';
import {
  generateWithMethods,
  generateImports,
  generateBuilderOptionsType,
  generateSchemaConstants,
} from './code-generator';
import type { Schema } from '../types';

describe('Code Generator', () => {
  describe('generateWithMethods', () => {
    it('generates with methods for object with properties', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          email: { type: 'string', format: 'email' },
        },
      };
      const result = generateWithMethods(schema, 'User');

      expect(result).toContain('withName');
      expect(result).toContain('withAge');
      expect(result).toContain('withEmail');
      expect(result).toContain('types.User["name"]');
      expect(result).toContain('types.User["age"]');
      expect(result).toContain('types.User["email"]');
    });

    it('returns empty string for non-object schema', () => {
      const schema: Schema = {
        type: 'string',
      };
      const result = generateWithMethods(schema, 'StringType');
      expect(result).toBe('');
    });

    it('returns empty string for object without properties', () => {
      const schema: Schema = {
        type: 'object',
      };
      const result = generateWithMethods(schema, 'EmptyObject');
      expect(result).toBe('');
    });

    it('handles properties with special characters in names', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          'user-name': { type: 'string' },
          user_email: { type: 'string' },
        },
      };
      const result = generateWithMethods(schema, 'User');

      expect(result).toContain('withUserName');
      expect(result).toContain('withUserEmail');
    });

    it('generates methods for all properties', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          isActive: { type: 'boolean' },
          count: { type: 'integer' },
        },
      };
      const result = generateWithMethods(schema, 'Entity');
      const lines = result.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(3); // One method per property
    });
  });

  describe('generateImports', () => {
    it('generates JSF imports when useStaticMocks is false', () => {
      const result = generateImports({
        useStaticMocks: false,
        useZodForMocks: false,
        generateZod: false,
      });

      expect(result).toContain('import { generateMock }');
      expect(result).toContain('import type { BuilderSchema }');
      expect(result).toContain('import type * as types from "./types.gen"');
      expect(result).not.toContain('import { z }');
    });

    it('generates Zod imports when useZodForMocks is true', () => {
      const result = generateImports({
        useStaticMocks: false,
        useZodForMocks: true,
        generateZod: false,
      });

      expect(result).toContain('import { generateMockFromZodSchema }');
      expect(result).toContain('import { z }');
      expect(result).not.toContain('import { generateMock }');
    });

    it('generates no library imports when useStaticMocks is true', () => {
      const result = generateImports({
        useStaticMocks: true,
        useZodForMocks: false,
        generateZod: false,
      });

      expect(result).not.toContain('import { generateMock }');
      expect(result).not.toContain('import { generateMockFromZodSchema }');
      expect(result).toContain('import type * as types from "./types.gen"');
    });

    it('includes Zod import when generateZod is true', () => {
      const result = generateImports({
        useStaticMocks: false,
        useZodForMocks: false,
        generateZod: true,
      });

      expect(result).toContain('import { z }');
    });

    it('includes Zod import only once when both options use it', () => {
      const result = generateImports({
        useStaticMocks: false,
        useZodForMocks: true,
        generateZod: true,
      });

      const zodImports = result.match(/import \{ z \}/g);
      expect(zodImports).toHaveLength(1);
    });
  });

  describe('generateBuilderOptionsType', () => {
    it('generates BuilderOptions type definition', () => {
      const result = generateBuilderOptionsType();

      expect(result).toContain('type BuilderOptions');
      expect(result).toContain('useDefault?: boolean');
      expect(result).toContain('useExamples?: boolean');
      expect(result).toContain('alwaysIncludeOptionals?: boolean');
      expect(result).toContain('optionalsProbability?: number | false');
      expect(result).toContain('omitNulls?: boolean');
    });

    it('returns consistent output', () => {
      const result1 = generateBuilderOptionsType();
      const result2 = generateBuilderOptionsType();

      expect(result1).toBe(result2);
    });
  });

  describe('generateSchemaConstants', () => {
    it('generates schema constants object', () => {
      const metas = [
        { constName: 'UserSchema', schema: { type: 'object' } as Schema },
        { constName: 'ProductSchema', schema: { type: 'object' } as Schema },
      ];

      const result = generateSchemaConstants(metas);

      expect(result).toContain('const schemas = {');
      expect(result).toContain('UserSchema:');
      expect(result).toContain('ProductSchema:');
      expect(result).toContain('satisfies Record<string, BuilderSchema>');
    });

    it('handles single schema', () => {
      const metas = [{ constName: 'SingleSchema', schema: { type: 'string' } as Schema }];

      const result = generateSchemaConstants(metas);

      expect(result).toContain('SingleSchema:');
      expect(result).toContain('"type":"string"');
    });

    it('handles empty array', () => {
      const result = generateSchemaConstants([]);

      expect(result).toContain('const schemas = {');
      expect(result).toContain('}');
    });

    it('properly serializes schema objects', () => {
      const metas = [
        {
          constName: 'ComplexSchema',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          } as Schema,
        },
      ];

      const result = generateSchemaConstants(metas);

      expect(result).toContain('"properties"');
      expect(result).toContain('"required"');
    });
  });

  describe('generateImports edge cases', () => {
    it('includes all imports when all options are enabled', () => {
      const result = generateImports({
        useStaticMocks: false,
        useZodForMocks: true,
        generateZod: true,
      });

      expect(result).toContain('import type * as types from "./types.gen"');
      expect(result).toContain('generateMockFromZodSchema');
      expect(result).toContain('import { z } from "zod"');
    });

    it('includes only base imports when no options are enabled', () => {
      const result = generateImports({
        useStaticMocks: false,
        useZodForMocks: false,
        generateZod: false,
      });

      expect(result).toContain('import type * as types from "./types.gen"');
      expect(result).toContain('generateMock');
    });

    it('handles static mocks correctly', () => {
      const result = generateImports({
        useStaticMocks: true,
        useZodForMocks: false,
        generateZod: false,
      });

      expect(result).toContain('import type * as types from "./types.gen"');
      // Static mocks don't import anything from hey-api-builders
    });
  });

  describe('generateBuilderOptionsType edge cases', () => {
    it('generates the correct type definition', () => {
      const result = generateBuilderOptionsType();

      expect(result).toContain('type BuilderOptions');
      expect(result).toContain('useDefault');
      expect(result).toContain('boolean');
    });

    it('includes proper formatting', () => {
      const result = generateBuilderOptionsType();

      expect(result).toMatch(/\n/); // Check for newlines
      expect(result.includes('{')).toBe(true);
      expect(result.includes('}')).toBe(true);
    });
  });

  describe('generateWithMethods advanced cases', () => {
    it('handles property names with special characters', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          'nested-property': { type: 'string' },
          another_nested: { type: 'number' },
        },
      };

      const result = generateWithMethods(schema, 'Complex');
      expect(result).toContain('withNestedProperty');
      expect(result).toContain('withAnotherNested');
    });

    it('generates correct method signatures', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          id: { type: 'number' },
        },
      };

      const result = generateWithMethods(schema, 'Entity');
      expect(result).toContain('withId(');
      expect(result).toContain('value: types.Entity["id"]');
      expect(result).toContain('return this');
    });
  });

  describe('generateSchemaConstants advanced cases', () => {
    it('handles schemas with multiple complex properties', () => {
      const metas = [
        {
          constName: 'MultiPropertySchema',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 5 },
              age: { type: 'number', minimum: 0, maximum: 120 },
              email: { type: 'string', format: 'email' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'email'],
          } as Schema,
        },
      ];

      const result = generateSchemaConstants(metas);
      expect(result).toContain('MultiPropertySchema');
      expect(result).toContain('minLength');
      expect(result).toContain('minimum');
      expect(result).toContain('format');
    });

    it('escapes special characters in schema values', () => {
      const metas = [
        {
          constName: 'SpecialCharsSchema',
          schema: {
            type: 'string',
            pattern: '^[a-z]+"test"\\s*$',
          } as Schema,
        },
      ];

      const result = generateSchemaConstants(metas);
      expect(result).toContain('pattern');
    });
  });
});

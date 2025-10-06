import { describe, it, expect } from 'vitest';
import {
  generateWithMethods,
  generateImports,
  generateBuilderOptionsType,
  generateSchemaConstants,
  generateProperty,
  generateMethod,
  indent,
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

      expect(lines.length).toBe(3);
    });
  });

  describe('generateImports', () => {
    it('generates runtime imports when mockStrategy is runtime', () => {
      const result = generateImports({
        mockStrategy: 'runtime',
        generateZod: false,
      });

      expect(result).toContain('import { generateMock }');
      expect(result).toContain('import type { BuilderSchema }');
      expect(result).toContain('import type * as types from "./types.gen"');
      expect(result).not.toContain('import { z }');
    });

    it('generates Zod imports when mockStrategy is zod', () => {
      const result = generateImports({
        mockStrategy: 'zod',
        generateZod: false,
      });

      expect(result).toContain('import { generateMockFromZodSchema }');
      expect(result).toContain('import { z }');
      expect(result).not.toContain('import { generateMock }');
    });

    it('generates no library imports when mockStrategy is static', () => {
      const result = generateImports({
        mockStrategy: 'static',
        generateZod: false,
      });

      expect(result).not.toContain('import { generateMock }');
      expect(result).not.toContain('import { generateMockFromZodSchema }');
      expect(result).toContain('import type * as types from "./types.gen"');
    });

    it('includes Zod import when generateZod is true', () => {
      const result = generateImports({
        mockStrategy: 'runtime',
        generateZod: true,
      });

      expect(result).toContain('import { z }');
    });

    it('includes Zod import only once when both options use it', () => {
      const result = generateImports({
        mockStrategy: 'zod',
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
        mockStrategy: 'zod',
        generateZod: true,
      });

      expect(result).toContain('import type * as types from "./types.gen"');
      expect(result).toContain('generateMockFromZodSchema');
      expect(result).toContain('import { z } from "zod"');
    });

    it('includes only base imports when no options are enabled', () => {
      const result = generateImports({
        mockStrategy: 'runtime',
        generateZod: false,
      });

      expect(result).toContain('import type * as types from "./types.gen"');
      expect(result).toContain('generateMock');
    });

    it('handles static mocks correctly', () => {
      const result = generateImports({
        mockStrategy: 'static',
        generateZod: false,
      });

      expect(result).toContain('import type * as types from "./types.gen"');
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

      expect(result).toMatch(/\n/);
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

  describe('generateProperty', () => {
    it('generates a private property declaration', () => {
      const result = generateProperty('overrides', 'Partial<User>', '{}');
      expect(result).toBe('  private overrides: Partial<User> = {}\n');
    });

    it('generates property with different types', () => {
      const result = generateProperty('options', 'BuilderOptions', '{}');
      expect(result).toContain('private options');
      expect(result).toContain('BuilderOptions');
    });
  });

  describe('generateMethod', () => {
    it('generates a method declaration', () => {
      const body = '    return this.value;\n';
      const result = generateMethod('getValue', 'string', body);

      expect(result).toContain('getValue()');
      expect(result).toContain(': string {');
      expect(result).toContain('return this.value');
    });

    it('generates method with complex body', () => {
      const body = '    const result = doSomething();\n    return result;\n';
      const result = generateMethod('build', 'User', body);

      expect(result).toContain('build()');
      expect(result).toContain(': User {');
    });
  });

  describe('indent', () => {
    it('indents single line code', () => {
      const code = 'const x = 1;';
      const result = indent(code, 2);
      expect(result).toBe('  const x = 1;');
    });

    it('indents multi-line code', () => {
      const code = 'const x = 1;\nconst y = 2;';
      const result = indent(code, 4);
      expect(result).toBe('    const x = 1;\n    const y = 2;');
    });

    it('preserves empty lines', () => {
      const code = 'const x = 1;\n\nconst y = 2;';
      const result = indent(code, 2);
      expect(result).toBe('  const x = 1;\n\n  const y = 2;');
    });

    it('handles code with existing indentation', () => {
      const code = '  const x = 1;\n  const y = 2;';
      const result = indent(code, 2);

      expect(result).toContain('    const x = 1;');
      expect(result).toContain('    const y = 2;');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { generateEnumBuilder, generateObjectBuilder } from './builder-generator';
import type { GeneratedSchemaMeta } from '../types';
import type { Schema } from '../types';

describe('Builder Generator', () => {
  describe('generateEnumBuilder', () => {
    const enumMeta: GeneratedSchemaMeta = {
      typeName: 'Status',
      constName: 'StatusSchema',
      isEnum: true,
      schema: { enum: ['active', 'inactive'] } as Schema,
      isObject: false,
    };

    it('generates basic enum builder structure', () => {
      const result = generateEnumBuilder(enumMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('export class StatusBuilder');
      expect(result).toContain('private options: BuilderOptions');
      expect(result).toContain('setOptions(o: BuilderOptions)');
      expect(result).toContain('build(): types.Status');
    });

    it('generates custom runtime build method by default', () => {
      const result = generateEnumBuilder(enumMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('generateMock');
      expect(result).toContain('schemas.StatusSchema');
      expect(result).toContain('useDefault');
      expect(result).toContain('useExamples');
    });

    it('generates static mock build method when mockStrategy is static', () => {
      const result = generateEnumBuilder(enumMeta, {
        mockStrategy: 'static',
        builderIdentifier: '',
      });

      expect(result).not.toContain('generateMock');
      expect(result).toContain('return');
      expect(result).toContain('as types.Status');
    });

    it('generates Zod build method when mockStrategy is zod', () => {
      const result = generateEnumBuilder(enumMeta, {
        mockStrategy: 'zod',
        builderIdentifier: '',
      });

      expect(result).toContain('generateMockFromZodSchema');
      expect(result).toContain('zodSchemaString');
      expect(result).toContain('useDefault');
      expect(result).toContain('alwaysIncludeOptionals');
    });

    it('includes all builder option properties', () => {
      const result = generateEnumBuilder(enumMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('useDefault');
      expect(result).toContain('useExamples');
      expect(result).toContain('alwaysIncludeOptionals');
      expect(result).toContain('optionalsProbability');
      expect(result).toContain('omitNulls');
    });

    it('generates builder with custom identifier', () => {
      const result = generateEnumBuilder(enumMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: 'Static',
      });

      expect(result).toContain('export class StatusStaticBuilder');
      expect(result).not.toContain('export class StatusBuilder {');
    });
  });

  describe('generateObjectBuilder', () => {
    const objectMeta: GeneratedSchemaMeta = {
      typeName: 'User',
      constName: 'UserSchema',
      isEnum: false,
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          age: { type: 'number' },
        },
        required: ['name', 'email'],
      } as Schema,
      isObject: true,
    };

    it('generates basic object builder structure', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('export class UserBuilder');
      expect(result).toContain('private overrides: Partial<types.User>');
      expect(result).toContain('private options: BuilderOptions');
      expect(result).toContain('build(): types.User');
    });

    it('generates with methods for properties', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('withName');
      expect(result).toContain('withEmail');
      expect(result).toContain('withAge');
    });

    it('generates runtime build method with override merging', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('const mock = generateMock');
      expect(result).toContain('for (const k in this.overrides)');
      expect(result).toContain('Object.prototype.hasOwnProperty.call');
      expect(result).toContain('return mock');
    });

    it('generates static mock build method when mockStrategy is static', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'static',
        builderIdentifier: '',
      });

      expect(result).toContain('const baseMock =');
      expect(result).toContain('{ ...baseMock, ...this.overrides }');
      expect(result).not.toContain('generateMock');
    });

    it('generates Zod build method when mockStrategy is zod', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'zod',
        builderIdentifier: '',
      });

      expect(result).toContain('generateMockFromZodSchema');
      expect(result).toContain('this.overrides');
      expect(result).not.toContain('for (const k in this.overrides)');
    });

    it('handles objects without properties', () => {
      const emptyMeta: GeneratedSchemaMeta = {
        typeName: 'Empty',
        constName: 'EmptySchema',
        isEnum: false,
        schema: { type: 'object' } as Schema,
        isObject: true,
      };

      const result = generateObjectBuilder(emptyMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('export class EmptyBuilder');
      expect(result).toContain('build(): types.Empty');
    });

    it('preserves type safety in generated code', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('types.User');
      expect(result).toContain('Partial<types.User>');
      expect(result).toContain('types.User["name"]');
    });

    it('includes setOptions method', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('setOptions(o: BuilderOptions): this');
      expect(result).toContain('this.options = o || {}');
      expect(result).toContain('return this');
    });

    it('uses correct schema reference in runtime mode', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('schemas.UserSchema');
    });

    it('generates type-safe override assignment', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      expect(result).toContain('const typedMock = mock as Record<string, unknown>');
      expect(result).toContain('const typedOverrides = this.overrides as Record<string, unknown>');
      expect(result).toContain('typedMock[k] = typedOverrides[k]');
    });

    it('generates builder with custom identifier', () => {
      const result = generateObjectBuilder(objectMeta, {
        mockStrategy: 'runtime',
        builderIdentifier: 'Mock',
      });

      expect(result).toContain('export class UserMockBuilder');
      expect(result).not.toContain('export class UserBuilder {');
    });
  });

  describe('Builder Options', () => {
    it('generates consistent builder options across all modes', () => {
      const meta: GeneratedSchemaMeta = {
        typeName: 'Test',
        constName: 'TestSchema',
        isEnum: false,
        schema: { type: 'object' } as Schema,
        isObject: true,
      };

      const runtimeResult = generateObjectBuilder(meta, {
        mockStrategy: 'runtime',
        builderIdentifier: '',
      });

      const zodResult = generateObjectBuilder(meta, {
        mockStrategy: 'zod',
        builderIdentifier: '',
      });

      const options = [
        'useDefault',
        'useExamples',
        'alwaysIncludeOptionals',
        'optionalsProbability',
        'omitNulls',
      ];

      options.forEach((option) => {
        expect(runtimeResult).toContain(option);
        expect(zodResult).toContain(option);
      });
    });
  });
});

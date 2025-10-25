import type { GeneratedSchemaMeta, MockStrategy } from '../types';
import type { Schema } from '../types';
import { generateZodSchema } from './zod-schema-generator';
import { generateStaticMockCode } from './static-mock-generator';
import { generateWithMethods } from '../core/code-generator';

/**
 * Represents the options for the builder generator.
 */
export interface BuilderGeneratorOptions {
  mockStrategy: MockStrategy;
}

/**
 * Generates a builder class for an enum schema.
 * @param meta - The metadata for the schema.
 * @param options - The options for the generator.
 * @returns The generated builder class as a string.
 */
export function generateEnumBuilder(
  meta: GeneratedSchemaMeta,
  options: BuilderGeneratorOptions
): string {
  const { typeName, schema } = meta;
  const { mockStrategy } = options;

  let code = `export class ${typeName}Builder extends BaseBuilder<types.${typeName}> {\n`;

  if (mockStrategy === 'static') {
    code += generateStaticEnumBuild(typeName, schema);
  } else if (mockStrategy === 'zod') {
    code += generateZodEnumBuild(typeName, schema);
  } else {
    code += generateCustomEnumBuild(typeName, meta.constName);
  }

  code += `}\n\n`;
  return code;
}

/**
 * Generates a builder class for an object schema.
 * @param meta - The metadata for the schema.
 * @param options - The options for the generator.
 * @returns The generated builder class as a string.
 */
export function generateObjectBuilder(
  meta: GeneratedSchemaMeta,
  options: BuilderGeneratorOptions
): string {
  const { typeName, schema, constName } = meta;
  const { mockStrategy } = options;

  let code = `export class ${typeName}Builder extends BaseBuilder<types.${typeName}> {\n`;

  const withMethods = generateWithMethods(schema, typeName);
  if (withMethods) {
    code += withMethods + '\n';
  }

  code += '\n';

  if (mockStrategy === 'static') {
    code += generateStaticObjectBuild(typeName, schema);
  } else if (mockStrategy === 'zod') {
    code += generateZodObjectBuild(typeName, schema);
  } else {
    code += generateCustomObjectBuild(typeName, constName);
  }

  code += `}\n\n`;
  return code;
}

/**
 * Generates the build method for a static enum mock.
 * @param typeName - The name of the type.
 * @param schema - The schema for the type.
 * @returns The generated build method as a string.
 */
function generateStaticEnumBuild(typeName: string, schema: Schema): string {
  const staticMock = generateStaticMockCode(schema, typeName);
  return `  build(): types.${typeName} {\n    return ${staticMock} as types.${typeName};\n  }\n`;
}

/**
 * Generates the build method for a Zod enum mock.
 * @param typeName - The name of the type.
 * @param schema - The schema for the type.
 * @returns The generated build method as a string.
 */
function generateZodEnumBuild(typeName: string, schema: Schema): string {
  const zodSchemaString = generateZodSchema(schema);
  return (
    `  build(): types.${typeName} {\n` +
    `    const zodSchemaString = \`${zodSchemaString}\`;\n` +
    `    return generateMockFromZodSchema(zodSchemaString, {}, {\n` +
    `      useDefault: this.options.useDefault,\n` +
    `      useExamples: this.options.useExamples,\n` +
    `      alwaysIncludeOptionals: this.options.alwaysIncludeOptionals,\n` +
    `      optionalsProbability: this.options.optionalsProbability,\n` +
    `      omitNulls: this.options.omitNulls\n` +
    `    }) as types.${typeName};\n` +
    `  }\n`
  );
}

/**
 * Generates the build method for a custom enum mock.
 * @param typeName - The name of the type.
 * @param constName - The name of the constant for the schema.
 * @returns The generated build method as a string.
 */
function generateCustomEnumBuild(typeName: string, constName: string): string {
  return (
    `  build(): types.${typeName} {\n` +
    `    return generateMock<types.${typeName}>(schemas.${constName}, {\n` +
    `      useDefault: this.options.useDefault,\n` +
    `      useExamples: this.options.useExamples,\n` +
    `      alwaysIncludeOptionals: this.options.alwaysIncludeOptionals,\n` +
    `      optionalsProbability: this.options.optionalsProbability,\n` +
    `      omitNulls: this.options.omitNulls\n` +
    `    })\n` +
    `  }\n`
  );
}

/**
 * Generates the build method for a static object mock.
 * @param typeName - The name of the type.
 * @param schema - The schema for the type.
 * @returns The generated build method as a string.
 */
function generateStaticObjectBuild(typeName: string, schema: Schema): string {
  const staticMock = generateStaticMockCode(schema, typeName);
  return (
    `  build(): types.${typeName} {\n` +
    `    const baseMock = ${staticMock};\n` +
    `    return { ...baseMock, ...this.overrides } as types.${typeName};\n` +
    `  }\n`
  );
}

/**
 * Generates the build method for a Zod object mock.
 * @param typeName - The name of the type.
 * @param schema - The schema for the type.
 * @returns The generated build method as a string.
 */
function generateZodObjectBuild(typeName: string, schema: Schema): string {
  const zodSchemaString = generateZodSchema(schema);
  return (
    `  build(): types.${typeName} {\n` +
    `    const zodSchemaString = \`${zodSchemaString}\`;\n` +
    `    return generateMockFromZodSchema(zodSchemaString, this.overrides, {\n` +
    `      useDefault: this.options.useDefault,\n` +
    `      useExamples: this.options.useExamples,\n` +
    `      alwaysIncludeOptionals: this.options.alwaysIncludeOptionals,\n` +
    `      optionalsProbability: this.options.optionalsProbability,\n` +
    `      omitNulls: this.options.omitNulls\n` +
    `    }) as types.${typeName};\n` +
    `  }\n`
  );
}

/**
 * Generates the build method for a custom object mock.
 * @param typeName - The name of the type.
 * @param constName - The name of the constant for the schema.
 * @returns The generated build method as a string.
 */
function generateCustomObjectBuild(typeName: string, constName: string): string {
  return (
    `  build(): types.${typeName} {\n` +
    `    const mock = generateMock<types.${typeName}>(schemas.${constName}, {\n` +
    `      useDefault: this.options.useDefault,\n` +
    `      useExamples: this.options.useExamples,\n` +
    `      alwaysIncludeOptionals: this.options.alwaysIncludeOptionals,\n` +
    `      optionalsProbability: this.options.optionalsProbability,\n` +
    `      omitNulls: this.options.omitNulls\n` +
    `    });\n` +
    `    return { ...mock, ...this.overrides };\n` +
    `  }\n`
  );
}

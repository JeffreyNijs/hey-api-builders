import type { Schema } from '../types';
import type { ExtendedSchema } from '../types';
import { toPascal } from './string-utils';

/**
 * Code generation utilities
 */

/**
 * Generates with* methods for builder classes
 * @param schema - JSON Schema
 * @param typeName - TypeScript type name
 * @returns Generated method code
 */
export function generateWithMethods(schema: Schema, typeName: string): string {
  const schemaWithProps = schema as ExtendedSchema;
  if (schemaWithProps.type !== 'object' || !schemaWithProps.properties) {
    return '';
  }
  return Object.keys(schemaWithProps.properties)
    .map(
      (p) =>
        `  with${toPascal(p)}(value: types.${typeName}["${p}"]): this { this.overrides["${p}"] = value; return this; }`
    )
    .join('\n');
}

/**
 * Generates import statements
 * @param options - Import options
 * @returns Import statements
 */
export function generateImports(options: {
  useStaticMocks: boolean;
  useZodForMocks: boolean;
  generateZod: boolean;
}): string {
  const { useStaticMocks, useZodForMocks, generateZod } = options;
  let imports = '';

  const needsZodImport = generateZod || useZodForMocks;

  if (useStaticMocks) {
    // Static mocks don't need any imports from the library
  } else if (useZodForMocks) {
    imports += 'import { generateMockFromZodSchema } from "hey-api-builders"\n';
  } else {
    imports += 'import { generateMock } from "hey-api-builders"\n';
    imports += 'import type { BuilderSchema } from "hey-api-builders"\n';
  }

  if (needsZodImport) {
    imports += 'import { z } from "zod"\n';
  }

  imports += 'import type * as types from "./types.gen"\n\n';

  return imports;
}

/**
 * Generates BuilderOptions type definition
 * @returns Type definition code
 */
export function generateBuilderOptionsType(): string {
  return `type BuilderOptions = {
  useDefault?: boolean;
  useExamples?: boolean;
  alwaysIncludeOptionals?: boolean;
  optionalsProbability?: number | false;
  omitNulls?: boolean;
}\n\n`;
}

/**
 * Generates schema constants for JSF
 * @param metas - Schema metadata
 * @returns Schema constant code
 */
export function generateSchemaConstants(
  metas: Array<{ constName: string; schema: Schema }>
): string {
  const schemaEntries: string[] = [];
  for (const m of metas) {
    schemaEntries.push(`  ${m.constName}: ${JSON.stringify(m.schema)}`);
  }
  return (
    'const schemas = {\n' +
    schemaEntries.join(',\n') +
    '\n} satisfies Record<string, BuilderSchema>\n\n'
  );
}

/**
 * Generates a class property declaration
 * @param name - Property name
 * @param type - Property type
 * @param value - Initial value
 * @returns Property declaration
 */
export function generateProperty(name: string, type: string, value: string): string {
  return `  private ${name}: ${type} = ${value}\n`;
}

/**
 * Generates a builder method
 * @param name - Method name
 * @param returnType - Return type
 * @param body - Method body
 * @returns Method declaration
 */
export function generateMethod(name: string, returnType: string, body: string): string {
  return `  ${name}(): ${returnType} {\n${body}  }\n`;
}

/**
 * Indents code by a specified number of spaces
 * @param code - Code to indent
 * @param spaces - Number of spaces
 * @returns Indented code
 */
export function indent(code: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? indentation + line : line))
    .join('\n');
}

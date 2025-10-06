import type { DefinePlugin } from '@hey-api/openapi-ts';
import type { IR } from '@hey-api/openapi-ts';

/**
 * JSON Schema definition
 */
export interface Schema {
  type?:
    | 'null'
    | 'boolean'
    | 'object'
    | 'array'
    | 'number'
    | 'string'
    | 'integer'
    | Array<'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer'>;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema | Schema[];
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  enum?: JsonValue[];
  const?: JsonValue;
  nullable?: boolean;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  multipleOf?: number;
  default?: unknown;
  examples?: unknown[];
  description?: string;
  title?: string;
  $ref?: string;
  $id?: string;
  $schema?: string;
  [key: string]: unknown;
}

/**
 * Mock generation strategy
 */
export type MockStrategy = 'runtime' | 'zod' | 'static';

/**
 * Plugin configuration options
 */
export interface Config {
  /**
   * Plugin name. Must be unique.
   */
  name: 'hey-api-builders';
  /**
   * Name of the generated file.
   *
   * @default 'builders'
   */
  output?: string;
  /**
   * User-configurable option for your plugin.
   *
   * @default false
   */
  myOption?: boolean;
  /**
   * Generate Zod schemas alongside builders for validation
   *
   * @default false
   */
  generateZod?: boolean;
  /**
   * Strategy for generating mock data in builders
   * - 'runtime': Use custom lightweight runtime mock generation (default)
   * - 'zod': Use Zod schemas for mock generation
   * - 'static': Generate hardcoded static mock values
   *
   * @default 'runtime'
   */
  mockStrategy?: MockStrategy;
  /**
   * Custom identifier to add to builder class names.
   * Useful when generating multiple builder sets with different strategies.
   *
   * Example: With builderIdentifier: 'Static', generates 'UserStaticBuilder' instead of 'UserBuilder'
   *
   * @default undefined (no identifier)
   */
  builderIdentifier?: string;
}

/**
 * Builder plugin type
 */
export type BuildersPlugin = DefinePlugin<Config>;

/**
 * Builder handler type
 */
export type BuildersHandler = BuildersPlugin['Handler'];

/**
 * Options for builder instances
 */
export interface BuilderOptions {
  useDefault?: boolean;
  useExamples?: boolean;
  alwaysIncludeOptionals?: boolean;
  optionalsProbability?: number | false;
  omitNulls?: boolean;
}

/**
 * JSON value types
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Schema metadata for code generation
 */
export interface GeneratedSchemaMeta {
  typeName: string;
  constName: string;
  isEnum: boolean;
  schema: Schema;
  isObject: boolean;
}

/**
 * Enum item in OpenAPI schema
 */
export interface EnumItem {
  const: JsonValue;
  description?: string;
}

/**
 * Extended schema object supporting enum structures
 */
export interface EnumSchemaObject {
  enum?: JsonValue[];
  type?: string | 'enum';
  items?: EnumItem[] | IR.SchemaObject | IR.SchemaObject[];
  nullable?: boolean;
  $ref?: string;
  properties?: Record<string, IR.SchemaObject>;
  required?: string[];
  additionalProperties?: boolean | IR.SchemaObject;
  allOf?: IR.SchemaObject[];
  anyOf?: IR.SchemaObject[];
  oneOf?: IR.SchemaObject[];
  [key: string]: unknown;
}

/**
 * Extended JSON schema with additional properties
 */
export interface ExtendedSchema {
  type?:
    | 'null'
    | 'boolean'
    | 'object'
    | 'array'
    | 'number'
    | 'string'
    | 'integer'
    | Array<'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer'>;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema | Schema[];
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  enum?: JsonValue[];
  nullable?: boolean;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
  examples?: unknown[];
  [key: string]: unknown;
}

/**
 * Normalized schema node for internal processing
 */
export interface NormalizedSchemaNode {
  type?:
    | 'null'
    | 'boolean'
    | 'object'
    | 'array'
    | 'number'
    | 'string'
    | 'integer'
    | 'enum'
    | Array<'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer'>;
  items?: NormalizedSchemaNode | NormalizedSchemaNode[];
  properties?: Record<string, NormalizedSchemaNode>;
  additionalProperties?: boolean | NormalizedSchemaNode;
  allOf?: NormalizedSchemaNode[];
  anyOf?: NormalizedSchemaNode[];
  oneOf?: NormalizedSchemaNode[];
  enum?: JsonValue[];
  logicalOperator?: string;
  const?: JsonValue;
  [key: string]: unknown;
}

/**
 * Options for Zod mock generation
 */
export interface ZodMockOptions {
  useDefault?: boolean;
  useExamples?: boolean;
  alwaysIncludeOptionals?: boolean;
  optionalsProbability?: number | false;
  omitNulls?: boolean;
}

/**
 * Options for Zod schema generation
 */
export interface ZodGeneratorOptions {
  useOptional?: boolean;
  useNullable?: boolean;
}

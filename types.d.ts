import {DefinePlugin} from "@hey-api/openapi-ts";
import type { IR } from '@hey-api/openapi-ts';
import type { Schema } from 'json-schema-faker';

export type MockStrategy = 'runtime' | 'zod' | 'static';

export interface Config {
    /**
     * Plugin name. Must be unique.
     */
    name: 'hey-api-builders',
    /**
     * Name of the generated file.
     *
     * @default 'my-plugin'
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

export type BuildersPlugin = DefinePlugin<Config>

export interface BuilderOptions {
  useDefault?: boolean;
  useExamples?: boolean;
  alwaysIncludeOptionals?: boolean;
  optionalsProbability?: number | false;
  omitNulls?: boolean;
}

export interface GeneratedSchemaMeta {
  typeName: string;
  constName: string;
  isEnum: boolean;
  schema: Schema;
  isObject: boolean;
}

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

export interface EnumItem {
  const: JsonValue;
  description?: string;
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ExtendedSchema {
  type?: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer' | Array<'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer'>;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema | Schema[];
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  enum?: JsonValue[];
  nullable?: boolean;
  [key: string]: unknown;
}

export interface NormalizedSchemaNode {
  type?: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer' | 'enum' | Array<'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer'>;
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

export type BuildersHandler = BuildersPlugin['Handler'];

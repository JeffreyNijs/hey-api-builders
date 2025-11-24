import type { IR } from '@hey-api/openapi-ts';
import type { JsonValue } from './index';

/**
 * Strict wrapper for IR.SchemaObject to avoid loose typing
 */
export interface IRSchemaObject
  extends Omit<
    IR.SchemaObject,
    'additionalProperties' | 'items' | 'properties' | 'allOf' | 'anyOf' | 'oneOf'
  > {
  enum?: JsonValue[];
  items?: IRSchemaObject | IRSchemaObject[] | EnumItem[];
  properties?: Record<string, IRSchemaObject>;
  additionalProperties?: boolean | IRSchemaObject;
  allOf?: IRSchemaObject[];
  anyOf?: IRSchemaObject[];
  oneOf?: IRSchemaObject[];
  nullable?: boolean;
}

/**
 * Enum item in OpenAPI schema
 */
export interface EnumItem {
  const: JsonValue;
  description?: string;
}

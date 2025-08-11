// Shared utility functions and types for hey-api-builders plugin
import type { BuildersPlugin } from './types';
import {IR, OpenApiSchemaObject} from "@hey-api/openapi-ts";
import {Schema} from "json-schema-faker";

/**
 * Narrow internal representation of a JSON Schema node we care about.
 * We purposely model only the aspects used by the builder generator to
 * reduce reliance on external full JSON Schema typings.
 */
// Allow either strongly-typed OpenAPI/IR schema shapes or a loose object to
// accommodate updates to the JSONSchema shape; keep an index signature so
// existing property access (e.g. schema.$ref, schema.items) types remain valid.
export type JSONSchema = Schema | OpenApiSchemaObject.V3_1_X | IR.SchemaObject | Record<string, any>

export interface EnumItemSchema {
  const: string | number | boolean | null;
  description?: string;
  [k: string]: unknown;
}

export interface InternalEnumSchema extends IR.SchemaObject {
  type: 'enum';
  items?: EnumItemSchema[]; // internal representation prior to flattening
}

export type SchemaMap = Record<string, JSONSchema>;

export interface BuilderOptions {
  useDefault?: boolean;
  useExamples?: boolean;
  alwaysIncludeOptionals?: boolean;
  optionalsProbability?: number | false;
  omitNulls?: boolean;
}

/**
 * Determine if a schema node is an internal enum representation produced by upstream tooling.
 */
export function isInternalEnumSchema(schema: JSONSchema): schema is InternalEnumSchema {
  if (!schema) return false;
  if ((schema as InternalEnumSchema).type === 'enum') return true;
  // Fallback heuristic: array of const items without standard JSON Schema enum field.
  if (!('enum' in schema) && Array.isArray(schema.items) && (schema.items as JSONSchema[]).every(i => typeof (i as EnumItemSchema).const !== 'undefined')) {
    return true;
  }
  return false;
}

/**
 * Safely flatten an internal enum schema to standard JSON Schema shape: { type: 'string' | inferred, enum: [...] }.
 * Defaults to string type when inference fails.
 */
export function flattenEnumSchema(schema: InternalEnumSchema): JSONSchema {
  const rawItems = Array.isArray(schema.items) ? schema.items : [];
  const enumValues = rawItems.map(i => i.const);
  // Attempt type inference (primitive homogeneity check)
  const primitiveTypes = new Set(enumValues.map(v => (v === null ? 'null' : typeof v)));
  // JSON Schema types don't have 'null' combined with others unless wrapped; keep simple here.
  const inferredType = primitiveTypes.size === 1 ? [...primitiveTypes][0] : 'string';
  const allowedTypes = ['number', 'integer', 'boolean'];
  const jsonType = allowedTypes.includes(inferredType) ? inferredType : 'string';
  return {
    ...schema,
    type: jsonType,
    enum: enumValues,
    // remove internal enum artifacts
    items: undefined,
  };
}

/**
 * Recursively resolve $ref pointers within the given schema tree.
 * Returns the same object reference (mutative) to maintain performance, mirroring prior behavior.
 */
export function resolveRefs(schema: JSONSchema | undefined, allSchemas: SchemaMap, seen: Set<JSONSchema> = new Set()): JSONSchema | undefined {
  if (!schema) return schema;

  // Prevent infinite recursion on circular references
  if (seen.has(schema)) return schema;
  seen.add(schema);

  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/components/schemas/', '');
    const resolved = allSchemas[refPath] || allSchemas[`${refPath}Schema`];
    if (!resolved) return schema; // unresolved ref stays as-is
    return resolveRefs(resolved, allSchemas, seen);
  }

  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      schema.properties[key] = resolveRefs(schema.properties[key], allSchemas, seen) as JSONSchema;
    }
  }

  if (schema.items) {
    if (Array.isArray(schema.items)) {
      schema.items = schema.items.map(item => resolveRefs(item, allSchemas, seen) as JSONSchema);
    } else {
      schema.items = resolveRefs(schema.items, allSchemas, seen) as JSONSchema;
    }
  }

  if ('allOf' in schema && Array.isArray(schema.allOf)) {
    schema.allOf = schema.allOf.map(item => resolveRefs(item, allSchemas, seen) as JSONSchema);
  }

  return schema;
}

/** Sanitize property name into PascalCase section for method generation. */
export function sanitizeMethodName(prop: string): string {
  return prop
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^(.)/, (m: string) => m.toUpperCase());
}

/** Schema const naming helper. */
export function getSchemaConstName(typeName: string): string {
  return `${typeName}SchemaDef`;
}

/** Deep stable sort for deterministic hashing. */
export function deepSort<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(v => deepSort(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v !== 'undefined')
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => [k, deepSort(v)] as [string, unknown]);
    return Object.fromEntries(entries) as unknown as T;
  }
  return value;
}

/** Stable stringify of a schema for deduplication. */
export function stableStringify(obj: unknown): string {
  return JSON.stringify(deepSort(obj));
}

/** Generate fluent withX methods for a schema's first-level properties. */
export function generateWithMethods(resolvedSchema: JSONSchema, typeName: string): string {
  if (!resolvedSchema.properties) return '';
  return Object.keys(resolvedSchema.properties)
    .filter(prop => !prop.includes('[') && !prop.includes(']'))
    .map(prop => {
      const methodName = `with${sanitizeMethodName(prop)}`;
      return `  ${methodName}(value: types.${typeName}["${prop}"]): this {\n    this.overrides["${prop}"] = value;\n    return this;\n  }`;
    })
    .join('\n');
}

/** Apply object-property level transformations (enum flattening, union simplification). */
export function normalizeObjectProperties(resolvedSchema: JSONSchema): void {
  if (!resolvedSchema.properties) return;
  for (const [prop, raw] of Object.entries(resolvedSchema.properties)) {
    const propSchema = raw as JSONSchema;
    if (!propSchema) continue;

    // Handle internal enum schemas
    if (isInternalEnumSchema(propSchema)) {
      resolvedSchema.properties[prop] = flattenEnumSchema(propSchema as InternalEnumSchema);
      continue;
    }

    // Handle union-like structures with logicalOperator
    if (Array.isArray(propSchema.items) && 'logicalOperator' in propSchema &&  propSchema.logicalOperator === 'or') {
      const itemTypes = (propSchema.items as JSONSchema[])
        .map(i => i.type)
        .filter(Boolean) as string[];
      if (itemTypes.length > 0) {
        const reducedType = itemTypes.length === 1 ? itemTypes[0] : itemTypes;
        const clone: JSONSchema = { ...propSchema, type: reducedType };
        delete clone.items;
        delete clone.logicalOperator;
        resolvedSchema.properties[prop] = clone;
      } else {
        // fallback to anyOf representation
        const clone: JSONSchema = { ...propSchema, anyOf: propSchema.items as JSONSchema[] };
        delete clone.items;
        delete clone.logicalOperator;
        resolvedSchema.properties[prop] = clone;
      }
    }
  }
}

export interface RegisteredSchema {
  typeName: string;
  builderClassName: string;
  isEnum: boolean;
  schemaConst: string;
}

export interface RegistrationContext {
  schemaDefs: Record<string, JSONSchema>;
  schemaDefNames: Record<string, string>;
  schemaDefHashes: Record<string, string>;
  schemaDefIndex: number;
}

export function registerSchemaDef(schema: JSONSchema, typeName: string, ctx: RegistrationContext): string {
  const stable = stableStringify(schema);
  if (ctx.schemaDefHashes[stable]) return ctx.schemaDefHashes[stable];

  const baseName = getSchemaConstName(typeName);
  const constName = baseName + (ctx.schemaDefNames[typeName] ? `_${ctx.schemaDefIndex++}` : '');

  ctx.schemaDefs[constName] = schema;
  ctx.schemaDefNames[typeName] = constName;
  ctx.schemaDefHashes[stable] = constName;

  return constName;
}

/** Flatten a top-level schema if it's an enum. */
export function normalizeTopLevelEnum(schema: JSONSchema): JSONSchema {
  if (isInternalEnumSchema(schema)) {
    return flattenEnumSchema(schema as InternalEnumSchema);
  }
  return schema;
}

/** Plugin handler implementation helper */
export type BuildersHandler = BuildersPlugin['Handler'];

// Force module emission
export {};

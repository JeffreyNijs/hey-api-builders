// Minimal utilities: map IR.SchemaObject -> JSON Schema Faker Schema + helpers
import type { IR } from '@hey-api/openapi-ts';
import type { BuildersPlugin } from './types';
import type { Schema } from 'json-schema-faker';

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

// Define types for schema objects with enum properties
interface EnumSchemaObject {
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

interface EnumItem {
  const: JsonValue;
  description?: string;
}

// Define JSON-compatible values for enum constants
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Define extended schema types for internal processing
interface ExtendedSchema {
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
  // Allow any additional properties from JSON Schema
  [key: string]: unknown;
}

// Define normalized schema node for processing
interface NormalizedSchemaNode {
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
  // Allow any additional properties
  [key: string]: unknown;
}

export function irToSchema(
  ir: IR.SchemaObject,
  all: Record<string, IR.SchemaObject>,
  seen = new Set<IR.SchemaObject>()
): Schema {
  if (!ir || typeof ir !== 'object') return {};
  if (seen.has(ir)) return {};
  seen.add(ir);

  if (ir.$ref) {
    const name = ir.$ref.replace('#/components/schemas/', '');
    const target = all[name];
    return target ? irToSchema(target, all, seen) : {};
  }

  // Handle enum schemas properly
  if (isEnum(ir)) {
    const enumIr = ir as EnumSchemaObject;

    // Standard OpenAPI/JSON Schema enum array
    if (Array.isArray(enumIr.enum)) {
      const enumValues = enumIr.enum;
      const anyOfSchemas = enumValues.map((value: JsonValue) => ({ const: value }));
      return { anyOf: anyOfSchemas };
    }

    // Handle internal enum representation (type: 'enum' with items)
    if (enumIr.type === 'enum' && Array.isArray(enumIr.items)) {
      const enumValues = (enumIr.items as EnumItem[])
        .filter((item: EnumItem) => item && typeof item === 'object' && 'const' in item)
        .map((item: EnumItem) => item.const);

      if (enumValues.length > 0) {
        const anyOfSchemas = enumValues.map((value: JsonValue) => ({ const: value }));
        return { anyOf: anyOfSchemas };
      }
    }

    // Handle items with const values (alternative enum representation)
    if (!enumIr.enum && Array.isArray(enumIr.items)) {
      const items = enumIr.items as EnumItem[];
      if (items.length > 0 && items.every((it: EnumItem) => it && typeof it === 'object' && 'const' in it)) {
        const enumValues = items.map((it: EnumItem) => it.const);
        const anyOfSchemas = enumValues.map((value: JsonValue) => ({ const: value }));
        return { anyOf: anyOfSchemas };
      }
    }
  }

  const out: Record<string, unknown> = {};

  if (ir.type) out.type = ir.type;
  else if (ir.properties) out.type = 'object';
  else if (ir.items) out.type = 'array';

  const extendedIr = ir as EnumSchemaObject;
  if (extendedIr.nullable) {
    if (typeof out.type === 'string') out.type = [out.type, 'null'];
    else if (Array.isArray(out.type) && !out.type.includes('null')) out.type.push('null');
  }

  if (ir.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(ir.properties)) {
      (out.properties as Record<string, Schema>)[k] = irToSchema(v as IR.SchemaObject, all, seen);
    }
  }

  if (ir.required && ir.required.length) out.required = [...ir.required];

  if (typeof ir.additionalProperties !== 'undefined') {
    if (typeof ir.additionalProperties === 'boolean') out.additionalProperties = ir.additionalProperties;
    else out.additionalProperties = irToSchema(ir.additionalProperties as IR.SchemaObject, all, seen);
  }

  if (ir.items) {
    if (Array.isArray(ir.items)) out.items = ir.items.map(i => irToSchema(i as IR.SchemaObject, all, seen));
    else out.items = irToSchema(ir.items as IR.SchemaObject, all, seen);
  }

  const extendedIrWithComposition = ir as IR.SchemaObject & {
    allOf?: IR.SchemaObject[];
    anyOf?: IR.SchemaObject[];
    oneOf?: IR.SchemaObject[];
  };

  if (extendedIrWithComposition.allOf) out.allOf = extendedIrWithComposition.allOf.map((s: IR.SchemaObject) => irToSchema(s, all, seen));
  if (extendedIrWithComposition.anyOf) out.anyOf = extendedIrWithComposition.anyOf.map((s: IR.SchemaObject) => irToSchema(s, all, seen));
  if (extendedIrWithComposition.oneOf) out.oneOf = extendedIrWithComposition.oneOf.map((s: IR.SchemaObject) => irToSchema(s, all, seen));

  const copy: (keyof IR.SchemaObject | string)[] = [
    'format','pattern','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','uniqueItems','minProperties','maxProperties','title','description','default','deprecated','readOnly','writeOnly','example'
  ];
  for (const k of copy) {
    const val = (ir as Record<string, unknown>)[k];
    if (typeof val !== 'undefined') {
      if (k === 'example') out.examples = [val];
      else out[k] = val;
    }
  }

  return out as Schema;
}

function normalizeSchema(node: NormalizedSchemaNode | ExtendedSchema | Schema): NormalizedSchemaNode {
  if (!node || typeof node !== 'object') return node as NormalizedSchemaNode;

  const workingNode = { ...node } as NormalizedSchemaNode;

  // Transform internal enum representation (type: 'enum') into standard JSON Schema
  if (workingNode.type === 'enum') {
    let enumValues: JsonValue[] = [];
    if (Array.isArray(workingNode.items)) {
      for (const item of workingNode.items) {
        if (item && typeof item === 'object' && 'const' in item) {
          enumValues.push((item as { const: JsonValue }).const);
        }
      }
    }
    if (enumValues.length > 0) {
      const primitiveTypes = new Set(enumValues.map(v => (v === null ? 'null' : typeof v)));
      let inferred: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer' = primitiveTypes.size === 1 ? [...primitiveTypes][0] as 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' : 'string';
      if (inferred === 'number') {
        // decide integer vs number
        if (enumValues.every(v => typeof v === 'number' && Number.isInteger(v))) inferred = 'integer';
      }
      if (inferred === 'object') inferred = 'string';
      workingNode.type = inferred;
      workingNode.enum = enumValues;
    } else {
      // no explicit values -> degrade gracefully to string
      workingNode.type = 'string';
    }
    delete workingNode.items;
    delete workingNode.logicalOperator;
  }

  // Detect union types represented as array items masquerading as tuples
  if (
    workingNode.type === 'array' &&
    Array.isArray(workingNode.items) &&
    workingNode.items.length > 0 &&
    workingNode.items.every(
      (item: NormalizedSchemaNode) =>
        item && typeof item === 'object' && 'type' in item &&
        (item.type === 'string' || item.type === 'null' || item.type === 'number' || item.type === 'integer' || item.type === 'boolean' || item.type === 'object')
    )
  ) {
    workingNode.anyOf = workingNode.items;
    delete workingNode.type;
    delete workingNode.items;
  }

  if (workingNode.properties && typeof workingNode.properties === 'object') {
    for (const key of Object.keys(workingNode.properties)) {
      workingNode.properties[key] = normalizeSchema(workingNode.properties[key]);
    }
  }
  if (workingNode.items) {
    if (Array.isArray(workingNode.items)) workingNode.items = workingNode.items.map(it => normalizeSchema(it));
    else workingNode.items = normalizeSchema(workingNode.items);
  }
  for (const k of ['allOf','anyOf','oneOf'] as const) {
    const schemaArray = workingNode[k];
    if (Array.isArray(schemaArray)) workingNode[k] = schemaArray.map((s: NormalizedSchemaNode) => normalizeSchema(s));
  }
  return workingNode;
}

function sanitizeSchema(node: NormalizedSchemaNode): Schema {
  if (!node || typeof node !== 'object') return node as Schema;

  const workingNode = { ...node } as Record<string, unknown>;

  // Remove unsupported 'unknown' type so downstream JSON Schema libs treat it as any
  if (workingNode.type === 'unknown') delete workingNode.type;
  // Sanitize enum arrays (ensure at least string type if none)
  if (!workingNode.type && Array.isArray(workingNode.enum)) workingNode.type = 'string';

  // Recurse into structural members
  if (workingNode.properties && typeof workingNode.properties === 'object') {
    const properties = workingNode.properties as Record<string, NormalizedSchemaNode>;
    for (const k of Object.keys(properties)) {
      properties[k] = sanitizeSchema(properties[k]) as NormalizedSchemaNode;
    }
  }
  if (workingNode.additionalProperties && typeof workingNode.additionalProperties === 'object') {
    workingNode.additionalProperties = sanitizeSchema(workingNode.additionalProperties as NormalizedSchemaNode);
  }
  if (workingNode.items) {
    if (Array.isArray(workingNode.items)) {
      workingNode.items = (workingNode.items as NormalizedSchemaNode[]).map(sanitizeSchema);
    } else {
      workingNode.items = sanitizeSchema(workingNode.items as NormalizedSchemaNode);
    }
  }
  (['allOf','anyOf','oneOf'] as const).forEach(k => {
    const schemaArray = workingNode[k];
    if (Array.isArray(schemaArray)) {
      workingNode[k] = (schemaArray as NormalizedSchemaNode[]).map(sanitizeSchema);
    }
  });
  return workingNode as Schema;
}

export function isEnum(ir: IR.SchemaObject): boolean {
  if (!ir || typeof ir !== 'object') return false;
  const enumIr = ir as EnumSchemaObject;

  // Standard OpenAPI/JSON Schema enum array
  if (Array.isArray(enumIr.enum)) return true;
  // Internal representation: explicit type 'enum'
  if (enumIr.type === 'enum') return true;
  // Heuristic: items[] each having a 'const' (and maybe description) with no other structural keywords
  if (!enumIr.enum && Array.isArray(enumIr.items)) {
    const items = enumIr.items as EnumItem[];
    if (items.length > 0 && items.every((it: EnumItem) => it && typeof it === 'object' && 'const' in it)) {
      return true;
    }
  }
  return false;
}

export function toPascal(str: string): string {
  return str
    .replace(/([_-]+|\s+)([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase());
}

export function safeTypeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export function collectSchemas(all: Record<string, IR.SchemaObject>): GeneratedSchemaMeta[] {
  const metas: GeneratedSchemaMeta[] = [];
  for (const [name, irSchema] of Object.entries(all)) {
    const typeName = safeTypeName(name.replace(/Schema$/, ''));
    const jsf = sanitizeSchema(normalizeSchema(irToSchema(irSchema as IR.SchemaObject, all)));
    const schemaWithType = jsf as ExtendedSchema;
    const t = schemaWithType.type;
    const isObject = t === 'object' || (Array.isArray(t) && t.includes('object'));
    metas.push({ typeName, constName: `${typeName}Schema`, isEnum: isEnum(irSchema as IR.SchemaObject), schema: jsf, isObject });
  }
  return metas;
}

export function generateWithMethods(schema: Schema, typeName: string): string {
  const schemaWithProps = schema as ExtendedSchema;
  if (schemaWithProps.type !== 'object' || !schemaWithProps.properties) return '';
  return Object.keys(schemaWithProps.properties)
    .map(p => `  with${toPascal(p)}(value: types.${typeName}["${p}"]): this { this.overrides["${p}"] = value; return this; }`)
    .join('\n');
}

export type BuildersHandler = BuildersPlugin['Handler'];

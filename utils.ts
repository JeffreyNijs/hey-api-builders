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

  if (Array.isArray((ir as any).enum)) {
    const out: Schema = { enum: (ir as any).enum };
    if (ir.type) out.type = ir.type as any;
    return out;
  }

  const out: Schema = {};

  if (ir.type) out.type = ir.type as any;
  else if (ir.properties) out.type = 'object';
  else if (ir.items) out.type = 'array';

  if ((ir as any).nullable) {
    if (typeof out.type === 'string') out.type = [out.type, 'null'] as any;
    else if (Array.isArray(out.type) && !out.type.includes('null')) out.type.push('null');
  }

  if (ir.properties) {
    (out as any).properties = {};
    for (const [k, v] of Object.entries(ir.properties)) {
      (out as any).properties[k] = irToSchema(v as IR.SchemaObject, all, seen);
    }
  }

  if (ir.required && ir.required.length) (out as any).required = [...ir.required];

  if (typeof ir.additionalProperties !== 'undefined') {
    if (typeof ir.additionalProperties === 'boolean') (out as any).additionalProperties = ir.additionalProperties;
    else (out as any).additionalProperties = irToSchema(ir.additionalProperties as IR.SchemaObject, all, seen);
  }

  if (ir.items) {
    if (Array.isArray(ir.items)) (out as any).items = ir.items.map(i => irToSchema(i as IR.SchemaObject, all, seen));
    else (out as any).items = irToSchema(ir.items as IR.SchemaObject, all, seen);
  }

  if ((ir as any).allOf) (out as any).allOf = (ir as any).allOf.map((s: IR.SchemaObject) => irToSchema(s, all, seen));
  if ((ir as any).anyOf) (out as any).anyOf = (ir as any).anyOf.map((s: IR.SchemaObject) => irToSchema(s, all, seen));
  if ((ir as any).oneOf) (out as any).oneOf = (ir as any).oneOf.map((s: IR.SchemaObject) => irToSchema(s, all, seen));

  const copy: (keyof IR.SchemaObject | string)[] = [
    'format','pattern','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','uniqueItems','minProperties','maxProperties','title','description','default','deprecated','readOnly','writeOnly','example'
  ];
  for (const k of copy) {
    const val = (ir as any)[k];
    if (typeof val !== 'undefined') {
      if (k === 'example') (out as any).examples = [val]; else (out as any)[k] = val;
    }
  }

  return out;
}

function normalizeSchema(node: any): any {
  if (!node || typeof node !== 'object') return node;

  // Transform internal enum representation (type: 'enum') into standard JSON Schema
  if (node.type === 'enum') {
    let enumValues: any[] = [];
    if (Array.isArray(node.items)) {
      for (const item of node.items) {
        if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'const')) {
          enumValues.push(item.const);
        }
      }
    }
    if (enumValues.length > 0) {
      const primitiveTypes = new Set(enumValues.map(v => (v === null ? 'null' : typeof v)));
      let inferred: any = primitiveTypes.size === 1 ? [...primitiveTypes][0] : 'string';
      if (inferred === 'number') {
        // decide integer vs number
        if (enumValues.every(v => typeof v === 'number' && Number.isInteger(v))) inferred = 'integer';
      }
      if (inferred === 'object') inferred = 'string';
      node.type = inferred;
      node.enum = enumValues;
    } else {
      // no explicit values -> degrade gracefully to string
      node.type = 'string';
    }
    delete node.items;
    delete node.logicalOperator;
  }

  if (node.properties && typeof node.properties === 'object') {
    for (const key of Object.keys(node.properties)) {
      node.properties[key] = normalizeSchema(node.properties[key]);
    }
  }
  if (node.items) {
    // @ts-ignore
    if (Array.isArray(node.items)) node.items = node.items.map(it => normalizeSchema(it));
    else node.items = normalizeSchema(node.items);
  }
  for (const k of ['allOf','anyOf','oneOf'] as const) {
    if (Array.isArray(node[k])) node[k] = node[k].map((s: any) => normalizeSchema(s));
  }
  return node;
}

function sanitizeSchema(node: any): any {
  if (!node || typeof node !== 'object') return node;
  // Remove unsupported 'unknown' type so downstream JSON Schema libs treat it as any
  if (node.type === 'unknown') delete node.type;
  // Sanitize enum arrays (ensure at least string type if none)
  if (!node.type && Array.isArray(node.enum)) node.type = 'string';
  // Recurse into structural members
  if (node.properties && typeof node.properties === 'object') {
    for (const k of Object.keys(node.properties)) sanitizeSchema(node.properties[k]);
  }
  if (node.additionalProperties && typeof node.additionalProperties === 'object') sanitizeSchema(node.additionalProperties);
  if (node.items) {
    if (Array.isArray(node.items)) node.items.forEach(sanitizeSchema); else sanitizeSchema(node.items);
  }
  ['allOf','anyOf','oneOf'].forEach(k => { if (Array.isArray(node[k])) node[k].forEach(sanitizeSchema); });
  return node;
}

export function isEnum(ir: IR.SchemaObject): boolean {
  if (!ir || typeof ir !== 'object') return false;
  // Standard OpenAPI/JSON Schema enum array
  if (Array.isArray((ir as any).enum)) return true;
  // Internal representation: explicit type 'enum'
  if ((ir as any).type === 'enum') return true;
  // Heuristic: items[] each having a 'const' (and maybe description) with no other structural keywords
  if (!(ir as any).enum && Array.isArray((ir as any).items)) {
    const items = (ir as any).items;
    if (items.length > 0 && items.every((it: any) => it && typeof it === 'object' && 'const' in it)) {
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
    const t = (jsf as any).type;
    const isObject = t === 'object' || (Array.isArray(t) && t.includes('object'));
    metas.push({ typeName, constName: `${typeName}Schema`, isEnum: isEnum(irSchema as IR.SchemaObject), schema: jsf, isObject });
  }
  return metas;
}

export function generateWithMethods(schema: Schema, typeName: string): string {
  if (schema.type !== 'object' || !(schema as any).properties) return '';
  return Object.keys((schema as any).properties)
    .map(p => `  with${toPascal(p)}(value: types.${typeName}["${p}"]): this { this.overrides["${p}"] = value; return this; }`)
    .join('\n');
}

export type BuildersHandler = BuildersPlugin['Handler'];

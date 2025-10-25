import type { IR } from '@hey-api/openapi-ts'
import type { Schema } from '../types'
import type {
  EnumSchemaObject,
  EnumItem,
  JsonValue,
  ExtendedSchema,
  NormalizedSchemaNode,
  GeneratedSchemaMeta,
} from '../types'
import { isEnum, isObjectType } from './schema-validators'
import { normalizeTypeName, safeTypeName } from './string-utils'

/**
 * Converts IR schema to JSON Schema format
 * @param ir - IR schema object
 * @param all - All schemas for reference resolution
 * @param seen - Set of already processed schemas to avoid cycles
 * @returns JSON Schema
 */
export function irToSchema(
  ir: IR.SchemaObject,
  all: Record<string, IR.SchemaObject>,
  seen?: Set<IR.SchemaObject>
): Schema {
  const seenSet = seen || new Set<IR.SchemaObject>()

  if (!ir || typeof ir !== 'object') {
    return {}
  }
  if (seenSet.has(ir)) {
    return {}
  }
  seenSet.add(ir)

  if (ir.$ref) {
    const name = ir.$ref.replace('#/components/schemas/', '')
    const target = all[name]
    return target ? irToSchema(target, all, seenSet) : {}
  }

  if (isEnum(ir)) {
    const enumIr = ir as EnumSchemaObject

    if (Array.isArray(enumIr.enum)) {
      const enumValues = enumIr.enum
      const anyOfSchemas = enumValues.map((value: JsonValue) => ({ const: value }))
      return { anyOf: anyOfSchemas }
    }

    if (enumIr.type === 'enum' && Array.isArray(enumIr.items)) {
      const enumValues = (enumIr.items as EnumItem[])
        .filter((item: EnumItem) => typeof item === 'object' && 'const' in item)
        .map((item: EnumItem) => item.const)

      if (enumValues.length > 0) {
        const anyOfSchemas = enumValues.map((value: JsonValue) => ({ const: value }))
        return { anyOf: anyOfSchemas }
      }
    }

    if (!enumIr.enum && Array.isArray(enumIr.items)) {
      const items = enumIr.items as EnumItem[]
      if (
        items.length > 0 &&
        items.every((it: EnumItem) => typeof it === 'object' && 'const' in it)
      ) {
        const enumValues = items.map((it: EnumItem) => it.const)
        const anyOfSchemas = enumValues.map((value: JsonValue) => ({ const: value }))
        return { anyOf: anyOfSchemas }
      }
    }
  }

  const out: Record<string, unknown> = {}

  if (ir.type) {
    out.type = ir.type
  } else if (ir.properties) {
    out.type = 'object'
  } else if (ir.items) {
    out.type = 'array'
  }

  const extendedIr = ir as EnumSchemaObject
  if (extendedIr.nullable) {
    if (typeof out.type === 'string') {
      out.type = [out.type, 'null']
    } else if (Array.isArray(out.type) && !out.type.includes('null')) {
      out.type.push('null')
    }
  }

  if (ir.properties) {
    out.properties = {}
    for (const [k, v] of Object.entries(ir.properties)) {
      ;(out.properties as Record<string, Schema>)[k] = irToSchema(v, all, seenSet)
    }
  }

  if (ir.required && ir.required.length) {
    out.required = [...ir.required]
  }

  if (typeof ir.additionalProperties !== 'undefined') {
    if (typeof ir.additionalProperties === 'boolean') {
      out.additionalProperties = ir.additionalProperties
    } else {
      out.additionalProperties = irToSchema(ir.additionalProperties, all, seenSet)
    }
  }

  if (ir.items) {
    if (Array.isArray(ir.items)) {
      out.items = ir.items.map((i) => irToSchema(i as IR.SchemaObject, all, seenSet))
    } else {
      out.items = irToSchema(ir.items as IR.SchemaObject, all, seenSet)
    }
  }

  const extendedIrWithComposition = ir as IR.SchemaObject & {
    allOf?: IR.SchemaObject[]
    anyOf?: IR.SchemaObject[]
    oneOf?: IR.SchemaObject[]
  }

  if (extendedIrWithComposition.allOf) {
    out.allOf = extendedIrWithComposition.allOf.map((s: IR.SchemaObject) =>
      irToSchema(s, all, seenSet)
    )
  }
  if (extendedIrWithComposition.anyOf) {
    out.anyOf = extendedIrWithComposition.anyOf.map((s: IR.SchemaObject) =>
      irToSchema(s, all, seenSet)
    )
  }
  if (extendedIrWithComposition.oneOf) {
    out.oneOf = extendedIrWithComposition.oneOf.map((s: IR.SchemaObject) =>
      irToSchema(s, all, seenSet)
    )
  }

  const copy: (keyof IR.SchemaObject | string)[] = [
    'format',
    'pattern',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'title',
    'description',
    'default',
    'deprecated',
    'readOnly',
    'writeOnly',
    'example',
  ]
  for (const k of copy) {
    const val = (ir as Record<string, unknown>)[k]
    if (typeof val !== 'undefined') {
      if (k === 'example') {
        out.examples = [val]
      } else {
        out[k] = val
      }
    }
  }

  return out as Schema
}

/**
 * Normalizes a schema node for consistent processing
 * @param node - Schema node to normalize
 * @returns Normalized schema node
 */
export function normalizeSchema(
  node: NormalizedSchemaNode | ExtendedSchema | Schema
): NormalizedSchemaNode {
  if (typeof node !== 'object' || !node) {
    return node as NormalizedSchemaNode
  }

  const workingNode = { ...node } as NormalizedSchemaNode

  if (workingNode.type === 'enum') {
    const enumValues: JsonValue[] = []
    if (Array.isArray(workingNode.items)) {
      for (const item of workingNode.items) {
        if (typeof item === 'object' && item && 'const' in item) {
          enumValues.push((item as { const: JsonValue }).const)
        }
      }
    }
    if (enumValues.length > 0) {
      const primitiveTypes = new Set(enumValues.map((v) => (v === null ? 'null' : typeof v)))
      let inferred: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer' =
        primitiveTypes.size === 1
          ? ([...primitiveTypes][0] as
              | 'null'
              | 'boolean'
              | 'object'
              | 'array'
              | 'number'
              | 'string')
          : 'string'
      if (inferred === 'number') {
        if (enumValues.every((v) => typeof v === 'number' && Number.isInteger(v))) {
          inferred = 'integer'
        }
      }
      if (inferred === 'object') {
        inferred = 'string'
      }
      workingNode.type = inferred
      workingNode.enum = enumValues
    } else {
      workingNode.type = 'string'
    }
    delete workingNode.items
    delete workingNode.logicalOperator
  }

  if (Array.isArray(workingNode.items)) {
    const hasEnumItems = workingNode.items.some(
      (item: NormalizedSchemaNode) => typeof item === 'object' && item && item.type === 'enum'
    )

    if (hasEnumItems) {
      workingNode.items = workingNode.items.map((item: NormalizedSchemaNode) => {
        if (typeof item === 'object' && item && item.type === 'enum') {
          return normalizeSchema(item)
        }
        return item
      })
    }
  }

  if (
    workingNode.type === 'array' &&
    Array.isArray(workingNode.items) &&
    workingNode.items.length > 0 &&
    workingNode.items.every(
      (item: NormalizedSchemaNode) =>
        typeof item === 'object' &&
        item &&
        'type' in item &&
        (item.type === 'string' ||
          item.type === 'null' ||
          item.type === 'number' ||
          item.type === 'integer' ||
          item.type === 'boolean' ||
          item.type === 'object')
    )
  ) {
    workingNode.anyOf = workingNode.items
    delete workingNode.type
    delete workingNode.items
  }

  if (workingNode.properties && typeof workingNode.properties === 'object') {
    for (const key of Object.keys(workingNode.properties)) {
      const prop = workingNode.properties[key]
      if (prop !== undefined) {
        workingNode.properties[key] = normalizeSchema(prop)
      }
    }
  }
  if (workingNode.items) {
    if (Array.isArray(workingNode.items)) {
      workingNode.items = workingNode.items.map((it) => normalizeSchema(it))
    } else {
      workingNode.items = normalizeSchema(workingNode.items)
    }
  }
  for (const k of ['allOf', 'anyOf', 'oneOf'] as const) {
    const schemaArray = workingNode[k]
    if (Array.isArray(schemaArray)) {
      workingNode[k] = schemaArray.map((s: NormalizedSchemaNode) => normalizeSchema(s))
    }
  }
  return workingNode
}

/**
 * Sanitizes a schema by removing invalid properties
 * @param node - Schema node to sanitize
 * @returns Sanitized schema
 */
export function sanitizeSchema(node: NormalizedSchemaNode): Schema {
  if (typeof node !== 'object' || !node) {
    return node as Schema
  }

  const workingNode = { ...node } as Record<string, unknown>

  if (workingNode.type === 'enum') {
    delete workingNode.type
    if (Array.isArray(workingNode.enum)) {
      workingNode.type = 'string'
    }
  }

  if (workingNode.type === 'unknown') {
    delete workingNode.type
  }
  if (!workingNode.type && Array.isArray(workingNode.enum)) {
    workingNode.type = 'string'
  }

  delete workingNode.logicalOperator

  if (workingNode.properties && typeof workingNode.properties === 'object') {
    const properties = workingNode.properties as Record<string, NormalizedSchemaNode>
    for (const k of Object.keys(properties)) {
      const prop = properties[k]
      if (prop !== undefined) {
        properties[k] = sanitizeSchema(prop) as NormalizedSchemaNode
      }
    }
  }
  if (workingNode.additionalProperties && typeof workingNode.additionalProperties === 'object') {
    workingNode.additionalProperties = sanitizeSchema(
      workingNode.additionalProperties as NormalizedSchemaNode
    )
  }
  if (workingNode.items) {
    if (Array.isArray(workingNode.items)) {
      workingNode.items = (workingNode.items as NormalizedSchemaNode[]).map(sanitizeSchema)
    } else {
      workingNode.items = sanitizeSchema(workingNode.items as NormalizedSchemaNode)
    }
  }
  ;['allOf', 'anyOf', 'oneOf'].forEach((k) => {
    const schemaArray = workingNode[k]
    if (Array.isArray(schemaArray)) {
      workingNode[k] = (schemaArray as NormalizedSchemaNode[]).map(sanitizeSchema)
    }
  })
  return workingNode as Schema
}

/**
 * Collects and processes all schemas from IR
 * @param all - All IR schemas
 * @returns Array of schema metadata
 */
export function collectSchemas(all: Record<string, IR.SchemaObject>): GeneratedSchemaMeta[] {
  const metas: GeneratedSchemaMeta[] = []
  for (const [name, irSchema] of Object.entries(all)) {
    let typeName = name.replace(/Schema$/, '')
    typeName = normalizeTypeName(typeName)

    const jsf = sanitizeSchema(normalizeSchema(irToSchema(irSchema, all)))
    const schemaWithType = jsf as ExtendedSchema
    const t = schemaWithType.type
    const isObject = isObjectType(t)
    metas.push({
      typeName,
      constName: `${safeTypeName(typeName)}Schema`,
      isEnum: isEnum(irSchema),
      schema: jsf,
      isObject,
    })
  }
  return metas
}

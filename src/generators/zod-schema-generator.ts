/**
 * Zod schema generation from JSON schema
 */

import type { Schema } from '../types'
import type { ExtendedSchema, JsonValue, ZodGeneratorOptions } from '../types'
import { ZOD_STRINGS, ZOD_REGEX } from './constants'

/**
 * Manages the generation of Zod schemas and their export to a file.
 */
export class ZodSchemaGenerator {
  private schemaDefs: Map<string, string> = new Map()
  private options: ZodGeneratorOptions

  constructor(options: ZodGeneratorOptions = {}) {
    this.options = options
  }

  /**
   * Generates a Zod schema for a given JSON schema and adds it to the list of schemas to be exported.
   * @param schema - JSON schema
   * @param typeName - The name of the type for which to generate the schema
   * @returns The name of the generated Zod schema
   */
  generate(schema: Schema, typeName: string): string {
    const schemaName = `${typeName}Schema`
    if (this.schemaDefs.has(schemaName)) {
      return schemaName
    }

    const zodSchema = this.generateZodSchemaInternal(schema as ExtendedSchema)
    this.schemaDefs.set(schemaName, zodSchema)
    return schemaName
  }

  /**
   * Returns the generated Zod schemas as a string that can be written to a file.
   * @returns The generated Zod schemas as a string
   */
  getGeneratedSchemas(): string {
    let content = "import { z } from 'zod';\n\n"
    for (const [name, schema] of this.schemaDefs.entries()) {
      content += `export const ${name} = ${schema};\n\n`
    }
    return content
  }

  /**
   * Generates a Zod schema string from a JSON schema
   * @param schema - JSON Schema
   * @returns Zod schema code
   */
  private generateZodSchemaInternal(schema: ExtendedSchema): string {
    if (typeof schema !== 'object') {
      return ZOD_STRINGS.UNKNOWN
    }

    if (Array.isArray(schema.anyOf)) {
      const enumValues = schema.anyOf
        .filter((item) => item && typeof item === 'object' && 'const' in item)
        .map((item) => (item as { const: JsonValue }).const)

      if (enumValues.length > 0) {
        const zodEnumValues = enumValues.map((val) => JSON.stringify(val)).join(', ')
        return `${ZOD_STRINGS.ENUM}([${zodEnumValues}])`
      }
    }

    if (Array.isArray(schema.enum)) {
      const zodEnumValues = schema.enum.map((val) => JSON.stringify(val)).join(', ')
      return `${ZOD_STRINGS.ENUM}([${zodEnumValues}])`
    }

    if (Array.isArray(schema.type)) {
      return this.generateUnionOrNullableType(schema)
    }

    if (typeof schema.type === 'string') {
      return this.generateZodForSingleType(schema.type, schema)
    }

    if (schema.properties && !schema.type) {
      return this.generateZodObject(schema)
    }

    if (schema.items && !schema.type) {
      return this.generateZodArray(schema)
    }

    return ZOD_STRINGS.UNKNOWN
  }

  private generateUnionOrNullableType(schema: ExtendedSchema): string {
    const types = (schema.type as string[]).filter((t) => t !== 'null')
    const isNullable = (schema.type as string[]).includes('null')

    let zodType: string
    if (types.length === 1 && types[0]) {
      zodType = this.generateZodForSingleType(types[0], schema)
    } else {
      const unionTypes = types.map((t) => this.generateZodForSingleType(t, schema))
      zodType = `${ZOD_STRINGS.UNION}([${unionTypes.join(', ')}])`
    }

    return isNullable ? `${zodType}.nullable()` : zodType
  }

  private generateZodForSingleType(type: string, schema: ExtendedSchema): string {
    switch (type) {
      case 'string':
        return this.generateZodString(schema)
      case 'number':
        return this.generateZodNumber(schema)
      case 'integer':
        return this.generateZodInteger(schema)
      case 'boolean':
        return ZOD_STRINGS.BOOLEAN
      case 'null':
        return ZOD_STRINGS.NULL
      case 'array':
        return this.generateZodArray(schema)
      case 'object':
        return this.generateZodObject(schema)
      default:
        return ZOD_STRINGS.UNKNOWN
    }
  }

  private generateZodString(schema: ExtendedSchema): string {
    let zodType = ZOD_STRINGS.STRING

    if (schema.format) {
      zodType += this.getZodStringFormat(schema.format)
    }

    if (schema.pattern) {
      zodType += `${ZOD_STRINGS.REGEX}(/${schema.pattern}/)`
    }
    if (typeof schema.minLength === 'number') {
      zodType += `${ZOD_STRINGS.MIN}(${schema.minLength})`
    }
    if (typeof schema.maxLength === 'number') {
      zodType += `${ZOD_STRINGS.MAX}(${schema.maxLength})`
    }

    return zodType
  }

  private getZodStringFormat(format: string): string {
    switch (format) {
      case 'uuid':
        return ZOD_STRINGS.UUID
      case 'email':
        return ZOD_STRINGS.EMAIL
      case 'uri':
      case 'url':
        return ZOD_STRINGS.URL
      case 'date':
        return ZOD_STRINGS.DATE
      case 'date-time':
        return ZOD_STRINGS.DATETIME
      case 'phone':
        return `${ZOD_STRINGS.REGEX}(/${ZOD_REGEX.PHONE}/)`
      default:
        return ''
    }
  }

  private generateZodNumber(schema: ExtendedSchema): string {
    let zodType = ZOD_STRINGS.NUMBER

    if (typeof schema.minimum === 'number') {
      zodType += `${ZOD_STRINGS.MIN}(${schema.minimum})`
    }
    if (typeof schema.maximum === 'number') {
      zodType += `${ZOD_STRINGS.MAX}(${schema.maximum})`
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      zodType += `${ZOD_STRINGS.GT}(${schema.exclusiveMinimum})`
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      zodType += `${ZOD_STRINGS.LT}(${schema.exclusiveMaximum})`
    }

    return zodType
  }

  private generateZodInteger(schema: ExtendedSchema): string {
    let zodType = `${ZOD_STRINGS.NUMBER}${ZOD_STRINGS.INT}`

    if (typeof schema.minimum === 'number') {
      zodType += `${ZOD_STRINGS.MIN}(${schema.minimum})`
    }
    if (typeof schema.maximum === 'number') {
      zodType += `${ZOD_STRINGS.MAX}(${schema.maximum})`
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      zodType += `${ZOD_STRINGS.GT}(${schema.exclusiveMinimum})`
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      zodType += `${ZOD_STRINGS.LT}(${schema.exclusiveMaximum})`
    }

    return zodType
  }

  private generateZodArray(schema: ExtendedSchema): string {
    let itemType = ZOD_STRINGS.UNKNOWN

    if (schema.items) {
      if (Array.isArray(schema.items)) {
        const tupleTypes = schema.items.map((item) =>
          this.generateZodSchemaInternal(item as ExtendedSchema)
        )
        return `z.tuple([${tupleTypes.join(', ')}])`
      } else {
        itemType = this.generateZodSchemaInternal(schema.items as ExtendedSchema)
      }
    }

    let zodType = `${ZOD_STRINGS.ARRAY}${itemType})`

    if (typeof schema.minItems === 'number') {
      zodType += `${ZOD_STRINGS.MIN}(${schema.minItems})`
    }
    if (typeof schema.maxItems === 'number') {
      zodType += `${ZOD_STRINGS.MAX}(${schema.maxItems})`
    }

    return zodType
  }

  private generateZodObject(schema: ExtendedSchema): string {
    if (!schema.properties) {
      return 'z.object({})'
    }

    const properties: string[] = []
    const required = new Set(schema.required || [])

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const safePropName = /^[a-zA-Z_]\w*$/.test(key) ? key : `"${key}"`
      let propType = this.generateZodSchemaInternal(propSchema as ExtendedSchema)

      if (!required.has(key)) {
        propType += ZOD_STRINGS.OPTIONAL
      }

      properties.push(`${safePropName}: ${propType}`)
    }

    let zodType = `z.object({\n  ${properties.join(',\n  ')}\n})`

    if (schema.additionalProperties === false) {
      zodType += '.strict()'
    } else if (typeof schema.additionalProperties === 'object') {
      const additionalType = this.generateZodSchemaInternal(
        schema.additionalProperties as ExtendedSchema
      )
      zodType += `.catchall(${additionalType})`
    }

    return zodType
  }
}

/**
 * Generates a Zod schema string from a JSON schema
 * @param schema - JSON Schema
 * @param options - Generator options
 * @returns Zod schema code
 */
export function generateZodSchema(schema: Schema, options: ZodGeneratorOptions = {}): string {
  const generator = new ZodSchemaGenerator(options)
  return generator.generate(schema, 'schema')
}

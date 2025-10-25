import type { Schema } from '../types';
import type { ExtendedSchema, JsonValue, ZodGeneratorOptions } from '../types';

/**
 * Manages the generation of Zod schemas and their export to a file.
 */
export class ZodSchemaGenerator {
  private schemaDefs: Map<string, string> = new Map();
  private options: ZodGeneratorOptions;

  constructor(options: ZodGeneratorOptions = {}) {
    this.options = options;
  }

  /**
   * Generates a Zod schema for a given JSON schema and adds it to the list of schemas to be exported.
   * @param schema - JSON schema
   * @param typeName - The name of the type for which to generate the schema
   * @returns The name of the generated Zod schema
   */
  generate(schema: Schema, typeName: string): string {
    const schemaName = `${typeName}Schema`;
    if (this.schemaDefs.has(schemaName)) {
      return schemaName;
    }

    const zodSchema = this.generateZodSchemaInternal(schema as ExtendedSchema);
    this.schemaDefs.set(schemaName, zodSchema);
    return schemaName;
  }

  /**
   * Returns the generated Zod schemas as a string that can be written to a file.
   * @returns The generated Zod schemas as a string
   */
  getGeneratedSchemas(): string {
    let content = "import { z } from 'zod';\n\n";
    for (const [name, schema] of this.schemaDefs.entries()) {
      content += `export const ${name} = ${schema};\n\n`;
    }
    return content;
  }

  /**
   * Generates a Zod schema string from a JSON schema
   * @param schema - JSON Schema
   * @returns Zod schema code
   */
  private generateZodSchemaInternal(schema: ExtendedSchema): string {
    if (!schema || typeof schema !== 'object') {
      return 'z.unknown()';
    }

    if (schema.anyOf && Array.isArray(schema.anyOf)) {
      const enumValues = schema.anyOf
        .filter((item) => item && typeof item === 'object' && 'const' in item)
        .map((item) => (item as { const: JsonValue }).const);

      if (enumValues.length > 0) {
        const zodEnumValues = enumValues.map((val) => JSON.stringify(val)).join(', ');
        return `z.enum([${zodEnumValues}])`;
      }
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      const zodEnumValues = schema.enum.map((val) => JSON.stringify(val)).join(', ');
      return `z.enum([${zodEnumValues}])`;
    }

    if (Array.isArray(schema.type)) {
      const types = schema.type.filter((t) => t !== 'null');
      const isNullable = schema.type.includes('null');

      if (types.length > 0 && types[0]) {
        let zodType = this.generateZodForSingleType(types[0], schema);
        if (isNullable) {
          zodType += '.nullable()';
        }
        return zodType;
      } else if (types.length > 1) {
        const unionTypes = types.map((t) => this.generateZodForSingleType(t, schema));
        let zodType = `z.union([${unionTypes.join(', ')}])`;
        if (isNullable) {
          zodType += '.nullable()';
        }
        return zodType;
      }
    }

    if (typeof schema.type === 'string') {
      return this.generateZodForSingleType(schema.type, schema);
    }

    if (schema.properties && !schema.type) {
      return this.generateZodObject(schema);
    }

    if (schema.items && !schema.type) {
      return this.generateZodArray(schema);
    }

    return 'z.unknown()';
  }

  private generateZodForSingleType(type: string, schema: ExtendedSchema): string {
    switch (type) {
      case 'string':
        return this.generateZodString(schema);
      case 'number':
        return this.generateZodNumber(schema);
      case 'integer':
        return this.generateZodInteger(schema);
      case 'boolean':
        return 'z.boolean()';
      case 'null':
        return 'z.null()';
      case 'array':
        return this.generateZodArray(schema);
      case 'object':
        return this.generateZodObject(schema);
      default:
        return 'z.unknown()';
    }
  }

  private generateZodString(schema: ExtendedSchema): string {
    let zodType = 'z.string()';

    if (schema.format) {
      switch (schema.format) {
        case 'uuid':
          zodType += '.uuid()';
          break;
        case 'email':
          zodType += '.email()';
          break;
        case 'uri':
        case 'url':
          zodType += '.url()';
          break;
        case 'date':
          zodType += '.date()';
          break;
        case 'date-time':
          zodType += '.datetime()';
          break;
        case 'phone':
          zodType += '.regex(/^\\+?[1-9]\\d{1,14}$/)';
          break;
      }
    }

    if (schema.pattern) {
      zodType += `.regex(/${schema.pattern}/)`;
    }

    if (typeof schema.minLength === 'number') {
      zodType += `.min(${schema.minLength})`;
    }
    if (typeof schema.maxLength === 'number') {
      zodType += `.max(${schema.maxLength})`;
    }

    return zodType;
  }

  private generateZodNumber(schema: ExtendedSchema): string {
    let zodType = 'z.number()';

    if (typeof schema.minimum === 'number') {
      zodType += `.min(${schema.minimum})`;
    }
    if (typeof schema.maximum === 'number') {
      zodType += `.max(${schema.maximum})`;
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      zodType += `.gt(${schema.exclusiveMinimum})`;
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      zodType += `.lt(${schema.exclusiveMaximum})`;
    }

    return zodType;
  }

  private generateZodInteger(schema: ExtendedSchema): string {
    let zodType = 'z.number().int()';

    if (typeof schema.minimum === 'number') {
      zodType += `.min(${schema.minimum})`;
    }
    if (typeof schema.maximum === 'number') {
      zodType += `.max(${schema.maximum})`;
    }
    if (typeof schema.exclusiveMinimum === 'number') {
      zodType += `.gt(${schema.exclusiveMinimum})`;
    }
    if (typeof schema.exclusiveMaximum === 'number') {
      zodType += `.lt(${schema.exclusiveMaximum})`;
    }

    return zodType;
  }

  private generateZodArray(schema: ExtendedSchema): string {
    let itemType = 'z.unknown()';

    if (schema.items) {
      if (Array.isArray(schema.items)) {
        const tupleTypes = schema.items.map((item) =>
          this.generateZodSchemaInternal(item as ExtendedSchema)
        );
        return `z.tuple([${tupleTypes.join(', ')}])`;
      } else {
        itemType = this.generateZodSchemaInternal(schema.items as ExtendedSchema);
      }
    }

    let zodType = `z.array(${itemType})`;

    if (typeof schema.minItems === 'number') {
      zodType += `.min(${schema.minItems})`;
    }
    if (typeof schema.maxItems === 'number') {
      zodType += `.max(${schema.maxItems})`;
    }

    return zodType;
  }

  private generateZodObject(schema: ExtendedSchema): string {
    if (!schema.properties) {
      return 'z.object({})';
    }

    const properties: string[] = [];
    const required = new Set(schema.required || []);

    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const safePropName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `"${key}"`;
      let propType = this.generateZodSchemaInternal(propSchema as ExtendedSchema);

      if (!required.has(key)) {
        propType += '.optional()';
      }

      properties.push(`${safePropName}: ${propType}`);
    }

    let zodType = `z.object({\n  ${properties.join(',\n  ')}\n})`;

    if (schema.additionalProperties === false) {
      zodType += '.strict()';
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      const additionalType = this.generateZodSchemaInternal(
        schema.additionalProperties as ExtendedSchema
      );
      zodType += `.catchall(${additionalType})`;
    }

    return zodType;
  }
}

/**
 * Generates a Zod schema string from a JSON schema
 * @param schema - JSON Schema
 * @param options - Generator options
 * @returns Zod schema code
 */
export function generateZodSchema(schema: Schema, options: ZodGeneratorOptions = {}): string {
  const generator = new ZodSchemaGenerator(options);
  return generator.generate(schema, 'schema');
}

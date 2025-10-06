import type { Schema } from '../types';
import type { ExtendedSchema, JsonValue } from '../types';

/**
 * Static mock value generators
 */

/**
 * Generates static TypeScript code that creates mock data without runtime dependencies
 * @param schema - JSON Schema
 * @param typeName - TypeScript type name
 * @returns Static mock code
 */
export function generateStaticMockCode(schema: Schema, typeName: string): string {
  return generateStaticMockInternal(schema as ExtendedSchema, typeName, 0);
}

function generateStaticMockInternal(
  schema: ExtendedSchema,
  typeName: string,
  depth: number
): string {
  if (!schema || typeof schema !== 'object') {
    return 'null';
  }

  // Handle anyOf (enums typically)
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const enumValues = schema.anyOf
      .filter((item) => item && typeof item === 'object' && 'const' in item)
      .map((item) => (item as { const: JsonValue }).const);

    if (enumValues.length > 0) {
      return JSON.stringify(enumValues[0]);
    }
  }

  // Handle enum arrays
  if (schema.enum && Array.isArray(schema.enum)) {
    return JSON.stringify(schema.enum[0]);
  }

  // Handle union types - pick first non-null type
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((t) => t !== 'null');
    if (types.length > 0 && types[0]) {
      return generateStaticForSingleType(types[0], schema, typeName, depth);
    }
  }

  // Handle single types
  if (typeof schema.type === 'string') {
    return generateStaticForSingleType(schema.type, schema, typeName, depth);
  }

  // Handle object with properties but no explicit type
  if (schema.properties && !schema.type) {
    return generateStaticObject(schema, typeName, depth);
  }

  // Handle array with items but no explicit type
  if (schema.items && !schema.type) {
    return generateStaticArray(schema, typeName, depth);
  }

  return 'null';
}

function generateStaticForSingleType(
  type: string,
  schema: ExtendedSchema,
  typeName: string,
  depth: number
): string {
  switch (type) {
    case 'string':
      return generateStaticString(schema);
    case 'number':
      return generateStaticNumber(schema);
    case 'integer':
      return generateStaticInteger(schema);
    case 'boolean':
      return 'true';
    case 'null':
      return 'null';
    case 'array':
      return generateStaticArray(schema, typeName, depth);
    case 'object':
      return generateStaticObject(schema, typeName, depth);
    default:
      return 'null';
  }
}

/**
 * Generates static string mock value
 */
function generateStaticString(schema: ExtendedSchema): string {
  // Handle format-specific strings
  if (schema.format) {
    const formatValue = getFormatDefaultValue(schema.format);
    if (formatValue) {
      return JSON.stringify(formatValue);
    }
  }

  // Handle default or example values
  if (schema.default !== undefined) {
    return JSON.stringify(schema.default);
  }

  if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
    return JSON.stringify(schema.examples[0]);
  }

  // Handle pattern - generate a simple placeholder
  if (schema.pattern) {
    return '"pattern-match"';
  }

  // Use min/max length if available
  const minLength = typeof schema.minLength === 'number' ? schema.minLength : 5;
  const targetLength = Math.max(minLength, 5);

  return JSON.stringify('a'.repeat(targetLength));
}

/**
 * Gets default value for a given format
 */
function getFormatDefaultValue(format: string): string | null {
  const formatDefaults: Record<string, string> = {
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    email: 'user@example.com',
    uri: 'https://example.com',
    url: 'https://example.com',
    date: '2024-01-01',
    'date-time': '2024-01-01T00:00:00.000Z',
    phone: '+15551234567',
  };
  return formatDefaults[format] || null;
}

/**
 * Generates static number mock value
 */
function generateStaticNumber(schema: ExtendedSchema): string {
  // Handle default or example values
  if (typeof schema.default === 'number') {
    return String(schema.default);
  }

  if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
    const example = schema.examples[0];
    if (typeof example === 'number') {
      return String(example);
    }
  }

  const min = typeof schema.minimum === 'number' ? schema.minimum : 0;
  const max = typeof schema.maximum === 'number' ? schema.maximum : 100;

  const value = min + Math.floor((max - min) / 2);
  return String(value);
}

/**
 * Generates static integer mock value
 */
function generateStaticInteger(schema: ExtendedSchema): string {
  // Handle default or example values
  if (typeof schema.default === 'number') {
    return String(Math.floor(schema.default));
  }

  if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
    const example = schema.examples[0];
    if (typeof example === 'number') {
      return String(Math.floor(example));
    }
  }

  const min = typeof schema.minimum === 'number' ? Math.ceil(schema.minimum) : 0;
  const max = typeof schema.maximum === 'number' ? Math.floor(schema.maximum) : 100;

  const value = min + Math.floor((max - min) / 2);
  return String(value);
}

/**
 * Generates static array mock value
 */
function generateStaticArray(schema: ExtendedSchema, typeName: string, depth: number): string {
  if (!schema.items) {
    return '[]';
  }

  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);

  // Generate a single item by default
  const minItems = typeof schema.minItems === 'number' ? schema.minItems : 1;
  const itemCount = Math.max(minItems, 1);

  if (Array.isArray(schema.items)) {
    // Tuple
    const items = schema.items.map((item) =>
      generateStaticMockInternal(item as ExtendedSchema, typeName, depth + 1)
    );
    return `[\n${nextIndent}${items.join(`,\n${nextIndent}`)}\n${indent}]`;
  } else {
    // Array of same type
    const itemMock = generateStaticMockInternal(
      schema.items as ExtendedSchema,
      typeName,
      depth + 1
    );

    if (itemCount === 1) {
      return `[${itemMock}]`;
    }

    const items = Array(itemCount).fill(itemMock);
    return `[\n${nextIndent}${items.join(`,\n${nextIndent}`)}\n${indent}]`;
  }
}

/**
 * Generates static object mock value
 */
function generateStaticObject(schema: ExtendedSchema, typeName: string, depth: number): string {
  if (!schema.properties) {
    return '{}';
  }

  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);
  const properties: string[] = [];
  const required = new Set(schema.required || []);

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    // Only include required properties by default
    if (!required.has(key)) {
      continue;
    }

    const propValue = generateStaticMockInternal(propSchema as ExtendedSchema, typeName, depth + 1);
    const safePropName = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : `"${key}"`;
    properties.push(`${safePropName}: ${propValue}`);
  }

  if (properties.length === 0) {
    return '{}';
  }

  return `{\n${nextIndent}${properties.join(`,\n${nextIndent}`)}\n${indent}}`;
}

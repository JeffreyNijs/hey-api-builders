import type { Schema } from 'json-schema-faker';
import type { ExtendedSchema, JsonValue } from './types';

export function generateStaticMockCode(schema: Schema, typeName: string): string {
  return generateStaticMockInternal(schema as ExtendedSchema, typeName, 0);
}

function generateStaticMockInternal(schema: ExtendedSchema, typeName: string, depth: number): string {
  if (!schema || typeof schema !== 'object') {
    return 'null';
  }

  const indent = '  '.repeat(depth);

  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const enumValues = schema.anyOf
      .filter(item => item && typeof item === 'object' && 'const' in item)
      .map(item => (item as { const: JsonValue }).const);

    if (enumValues.length > 0) {
      return JSON.stringify(enumValues[0]);
    }
  }

  if (schema.enum && Array.isArray(schema.enum)) {
    return JSON.stringify(schema.enum[0]);
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter(t => t !== 'null');
    if (types.length > 0 && types[0]) {
      return generateStaticForSingleType(types[0], schema, typeName, depth);
    }
  }

  if (typeof schema.type === 'string') {
    return generateStaticForSingleType(schema.type, schema, typeName, depth);
  }

  if (schema.properties && !schema.type) {
    return generateStaticObject(schema, typeName, depth);
  }

  if (schema.items && !schema.type) {
    return generateStaticArray(schema, typeName, depth);
  }

  return 'null';
}

function generateStaticForSingleType(type: string, schema: ExtendedSchema, typeName: string, depth: number): string {
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

function generateStaticString(schema: ExtendedSchema): string {
  if (schema.format) {
    switch (schema.format) {
      case 'uuid':
        return '"550e8400-e29b-41d4-a716-446655440000"';
      case 'email':
        return '"user@example.com"';
      case 'uri':
      case 'url':
        return '"https:
      case 'date':
        return '"2024-01-01"';
      case 'date-time':
        return '"2024-01-01T00:00:00.000Z"';
      case 'phone':
        return '"+15551234567"';
    }
  }

  if (schema.default !== undefined) {
    return JSON.stringify(schema.default);
  }

  if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
    return JSON.stringify(schema.examples[0]);
  }

  if (schema.pattern) {
    return '"pattern-match"';
  }

  const minLength = typeof schema.minLength === 'number' ? schema.minLength : 5;
  const targetLength = Math.max(minLength, 5);
  
  return JSON.stringify('a'.repeat(targetLength));
}

function generateStaticNumber(schema: ExtendedSchema): string {
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

function generateStaticInteger(schema: ExtendedSchema): string {
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

function generateStaticArray(schema: ExtendedSchema, typeName: string, depth: number): string {
  if (!schema.items) {
    return '[]';
  }

  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);

  const minItems = typeof schema.minItems === 'number' ? schema.minItems : 1;
  const itemCount = Math.max(minItems, 1);

  if (Array.isArray(schema.items)) {
    const items = schema.items.map(item => 
      generateStaticMockInternal(item as ExtendedSchema, typeName, depth + 1)
    );
    return `[\n${nextIndent}${items.join(`,\n${nextIndent}`)}\n${indent}]`;
  } else {
    const itemMock = generateStaticMockInternal(schema.items as ExtendedSchema, typeName, depth + 1);
    
    if (itemCount === 1) {
      return `[${itemMock}]`;
    }
    
    const items = Array(itemCount).fill(itemMock);
    return `[\n${nextIndent}${items.join(`,\n${nextIndent}`)}\n${indent}]`;
  }
}

function generateStaticObject(schema: ExtendedSchema, typeName: string, depth: number): string {
  if (!schema.properties) {
    return '{}';
  }

  const indent = '  '.repeat(depth);
  const nextIndent = '  '.repeat(depth + 1);
  const properties: string[] = [];
  const required = new Set(schema.required || []);

  for (const [key, propSchema] of Object.entries(schema.properties)) {
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

import type { JsonValue } from '../types';

export interface ZodMockOptions {
  useDefault?: boolean;
  useExamples?: boolean;
  alwaysIncludeOptionals?: boolean;
  optionalsProbability?: number | false;
  omitNulls?: boolean;
}

/**
 * Generates mock data from a Zod schema definition
 */
export function generateMockFromZodSchema(
  zodSchemaString: string,
  overrides: Record<string, unknown> = {},
  options: ZodMockOptions = {}
): unknown {
  const mockGenerator = new ZodMockGenerator(options);
  return mockGenerator.generateFromSchemaString(zodSchemaString, overrides);
}

class ZodMockGenerator {
  private static readonly EMAIL_DOMAINS = ['example.com', 'test.org', 'demo.net', 'sample.io'];
  private static readonly FIRST_NAMES = [
    'Alice',
    'Bob',
    'Charlie',
    'Diana',
    'Eve',
    'Frank',
    'Grace',
    'Henry',
  ];
  private static readonly LAST_NAMES = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
  ];

  private options: ZodMockOptions;

  constructor(options: ZodMockOptions = {}) {
    this.options = {
      useDefault: options.useDefault ?? false,
      useExamples: options.useExamples ?? false,
      alwaysIncludeOptionals: options.alwaysIncludeOptionals ?? false,
      optionalsProbability: options.optionalsProbability ?? 0.8,
      omitNulls: options.omitNulls ?? false,
    };
  }

  generateFromSchemaString(
    zodSchemaString: string,
    overrides: Record<string, unknown> = {}
  ): unknown {
    if (zodSchemaString.includes('z.object(')) {
      return this.generateObjectMock(zodSchemaString, overrides);
    } else if (zodSchemaString.includes('z.array(')) {
      return this.generateArrayMock(zodSchemaString, overrides);
    } else if (zodSchemaString.includes('z.enum(')) {
      return this.generateEnumMock(zodSchemaString);
    } else if (zodSchemaString.includes('z.string()')) {
      return this.generateStringMock(zodSchemaString);
    } else if (zodSchemaString.includes('z.number()')) {
      return this.generateNumberMock(zodSchemaString);
    } else if (zodSchemaString.includes('z.boolean()')) {
      return this.generateBooleanMock();
    } else if (zodSchemaString.includes('z.union(')) {
      return this.generateUnionMock(zodSchemaString, overrides);
    } else if (zodSchemaString.includes('z.null()')) {
      return this.options.omitNulls ? undefined : null;
    }

    return null;
  }

  private generateObjectMock(
    zodSchemaString: string,
    overrides: Record<string, unknown>
  ): Record<string, unknown> {
    const mock: Record<string, unknown> = {};

    const propertiesString = this.extractObjectProperties(zodSchemaString);
    if (!propertiesString) {
      return mock;
    }

    const properties = this.parseObjectProperties(propertiesString);

    for (const [key, propSchema] of properties) {
      if (overrides[key] !== undefined) {
        mock[key] = overrides[key];
      } else {
        const isOptional = propSchema.includes('.optional()');

        if (isOptional && !this.options.alwaysIncludeOptionals) {
          const probability =
            this.options.optionalsProbability === false ? 0.8 : this.options.optionalsProbability;
          if (Math.random() > (probability ?? 0.8)) {
            continue;
          }
        }

        const value = this.generateFromSchemaString(propSchema);

        if (value === null && this.options.omitNulls) {
          continue;
        }

        mock[key] = value;
      }
    }

    return mock;
  }

  private extractObjectProperties(zodSchemaString: string): string | null {
    const objectStart = zodSchemaString.indexOf('z.object({');
    if (objectStart === -1) {
      return null;
    }

    const contentStart = objectStart + 'z.object({'.length;
    let depth = 1;
    let i = contentStart;

    while (i < zodSchemaString.length && depth > 0) {
      const char = zodSchemaString[i];
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      }
      i++;
    }

    if (depth === 0) {
      return zodSchemaString.substring(contentStart, i - 1);
    }

    return null;
  }

  private parseObjectProperties(propertiesString: string): Array<[string, string]> {
    const properties: Array<[string, string]> = [];

    const cleanString = propertiesString.trim();

    const propertyStrings = this.splitObjectProperties(cleanString);

    for (const propString of propertyStrings) {
      const trimmed = propString.trim();
      if (!trimmed) {
        continue;
      }

      const match = trimmed.match(/^(\w+|"[^"]+"|'[^']+'):\s*(.+)$/s);
      if (match && match[1] && match[2]) {
        const key = match[1].replace(/['"]/g, '');
        const schema = match[2].trim();
        properties.push([key, schema]);
      }
    }

    return properties;
  }

  private splitObjectProperties(str: string): string[] {
    const result: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let i = 0;

    while (i < str.length) {
      const char = str[i];

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && str[i - 1] !== '\\') {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        if (char === '(' || char === '[' || char === '{') {
          depth++;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
        } else if (char === ',' && depth === 0) {
          const beforeComma = current.trim();
          if (beforeComma && this.isCompleteProperty(beforeComma)) {
            result.push(current.trim());
            current = '';
            i++;
            continue;
          }
        }
      }

      current += char;
      i++;
    }

    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  }

  private isCompleteProperty(str: string): boolean {
    const colonIndex = str.indexOf(':');
    if (colonIndex === -1) {
      return false;
    }

    const key = str.substring(0, colonIndex).trim();
    const value = str.substring(colonIndex + 1).trim();

    const keyValid = /^(\w+|"[^"]+"|'[^']+')$/.test(key);

    const valueValid = value.length > 0 && this.hasBalancedBrackets(value);

    return keyValid && valueValid;
  }

  private hasBalancedBrackets(str: string): boolean {
    let depth = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && str[i - 1] !== '\\') {
        inString = false;
        stringChar = '';
      } else if (!inString) {
        if (char === '(' || char === '[' || char === '{') {
          depth++;
        } else if (char === ')' || char === ']' || char === '}') {
          depth--;
          if (depth < 0) {
            return false;
          }
        }
      }
    }

    return depth === 0;
  }

  private generateArrayMock(
    zodSchemaString: string,
    overrides: Record<string, unknown>
  ): unknown[] {
    const itemTypeMatch = zodSchemaString.match(/z\.array\(([^)]+)\)/);
    if (!itemTypeMatch || !itemTypeMatch[1]) {
      return [];
    }

    const itemSchema = itemTypeMatch[1];

    if (Array.isArray(overrides.items)) {
      return overrides.items.map((item) => {
        if (item !== null && typeof item === 'object') {
          return this.generateFromSchemaString(itemSchema, item as Record<string, unknown>);
        } else {
          return item;
        }
      });
    }

    const minMatch = zodSchemaString.match(/\.min\((\d+)\)/);
    const maxMatch = zodSchemaString.match(/\.max\((\d+)\)/);

    const minLength = minMatch?.[1] ? parseInt(minMatch[1]) : 1;
    const maxLength = maxMatch?.[1] ? parseInt(maxMatch[1]) : 3;
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    return Array.from({ length }, () => {
      return this.generateFromSchemaString(itemSchema, {});
    });
  }

  private generateEnumMock(zodSchemaString: string): unknown {
    const enumMatch = zodSchemaString.match(/z\.enum\(\[([^\]]+)\]\)/);
    if (!enumMatch || !enumMatch[1]) {
      return null;
    }

    const enumValues = enumMatch[1].split(',').map((val) => {
      const trimmed = val.trim();

      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1);
      }
      if (trimmed === 'true' || trimmed === 'false') {
        return trimmed === 'true';
      }
      if (!isNaN(Number(trimmed))) {
        return Number(trimmed);
      }
      return trimmed;
    });

    return enumValues[Math.floor(Math.random() * enumValues.length)];
  }

  private generateStringMock(zodSchemaString: string): string {
    if (zodSchemaString.includes('.uuid()')) {
      return this.generateUUID();
    } else if (zodSchemaString.includes('.email()')) {
      return this.generateEmail();
    } else if (zodSchemaString.includes('.url()')) {
      return this.generateURL();
    } else if (zodSchemaString.includes('.date()')) {
      return this.generateDate();
    } else if (zodSchemaString.includes('.datetime()')) {
      return this.generateDateTime();
    } else if (zodSchemaString.includes('.regex(')) {
      return this.generateFromRegex(zodSchemaString);
    }

    const minMatch = zodSchemaString.match(/\.min\((\d+)\)/);
    const maxMatch = zodSchemaString.match(/\.max\((\d+)\)/);

    const minLength = minMatch?.[1] ? parseInt(minMatch[1]) : 5;
    const maxLength = maxMatch?.[1] ? parseInt(maxMatch[1]) : 15;
    const targetLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    return this.generateRandomString(targetLength);
  }

  private generateNumberMock(zodSchemaString: string): number {
    const isInt = zodSchemaString.includes('.int()');
    const minMatch = zodSchemaString.match(/\.min\(([^)]+)\)/);
    const maxMatch = zodSchemaString.match(/\.max\(([^)]+)\)/);
    const gtMatch = zodSchemaString.match(/\.gt\(([^)]+)\)/);
    const ltMatch = zodSchemaString.match(/\.lt\(([^)]+)\)/);

    let min = minMatch && minMatch[1] ? parseFloat(minMatch[1]) : isInt ? 0 : 0.0;
    let max = maxMatch && maxMatch[1] ? parseFloat(maxMatch[1]) : isInt ? 100 : 100.0;

    if (gtMatch && gtMatch[1]) {
      min = parseFloat(gtMatch[1]) + (isInt ? 1 : 0.001);
    }
    if (ltMatch && ltMatch[1]) {
      max = parseFloat(ltMatch[1]) - (isInt ? 1 : 0.001);
    }

    const value = Math.random() * (max - min) + min;
    return isInt ? Math.floor(value) : Math.round(value * 100) / 100;
  }

  private generateBooleanMock(): boolean {
    return Math.random() > 0.5;
  }

  private generateUnionMock(zodSchemaString: string, overrides: Record<string, unknown>): unknown {
    const unionMatch = zodSchemaString.match(/z\.union\(\[([^\]]+)\]\)/);
    if (!unionMatch || !unionMatch[1]) {
      return null;
    }

    const unionTypes = this.parseUnionTypes(unionMatch[1]);
    if (unionTypes.length === 0) {
      return null;
    }

    const randomType = unionTypes[Math.floor(Math.random() * unionTypes.length)];
    if (!randomType) {
      return null;
    }

    return this.generateFromSchemaString(randomType, overrides);
  }

  private parseUnionTypes(unionString: string): string[] {
    const types: string[] = [];
    let depth = 0;
    let current = '';

    for (let i = 0; i < unionString.length; i++) {
      const char = unionString[i];

      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
      } else if (char === ',' && depth === 0) {
        types.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    if (current.trim()) {
      types.push(current.trim());
    }

    return types;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private generateEmail(): string {
    const firstNames = ZodMockGenerator.FIRST_NAMES;
    const lastNames = ZodMockGenerator.LAST_NAMES;
    const domains = ZodMockGenerator.EMAIL_DOMAINS;

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)] || 'user';
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)] || 'example';
    const domain = domains[Math.floor(Math.random() * domains.length)] || 'example.com';

    return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
  }

  private generateURL(): string {
    const protocols = ['https', 'http'];
    const domains = ['example.com', 'test.org', 'demo.net', 'api.sample.io'];
    const protocol = protocols[Math.floor(Math.random() * protocols.length)];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${protocol}://${domain}`;
  }

  private generateDate(): string {
    const start = new Date(2020, 0, 1);
    const end = new Date();
    const randomDate = new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime())
    );
    return randomDate.toISOString().split('T')[0];
  }

  private generateDateTime(): string {
    const start = new Date(2020, 0, 1);
    const end = new Date();
    const randomDate = new Date(
      start.getTime() + Math.random() * (end.getTime() - start.getTime())
    );
    return randomDate.toISOString();
  }

  private generateFromRegex(zodSchemaString: string): string {
    const regexMatch = zodSchemaString.match(/\.regex\(\/([^/]+)\/\)/);
    if (!regexMatch) {
      return this.generateRandomString(10);
    }

    const pattern = regexMatch[1];

    if (pattern?.includes('\\+?[1-9]\\d{1,14}')) {
      return `+1${Math.floor(Math.random() * 9000000000) + 1000000000}`;
    }

    return this.generateRandomString(10);
  }

  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

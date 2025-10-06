import { JSONSchemaFaker } from 'json-schema-faker';
import type { Schema } from 'json-schema-faker';

export interface JSFOptions {
  useDefaultValue?: boolean;
  useExamplesValue?: boolean;
  alwaysFakeOptionals?: boolean;
  optionalsProbability?: number | false;
  omitNulls?: boolean;
  requiredOnly?: boolean;
}

/**
 * Generates mock data using JSON Schema Faker
 * @param schema - JSON Schema
 * @param options - Generation options
 * @returns Generated mock data
 */
export function generateMock<T = unknown>(schema: unknown, options?: JSFOptions): T {
  JSONSchemaFaker.option({
    useDefaultValue: options?.useDefaultValue ?? false,
    useExamplesValue: options?.useExamplesValue ?? false,
    alwaysFakeOptionals: options?.alwaysFakeOptionals ?? false,
    optionalsProbability: options?.optionalsProbability ?? 1,
    omitNulls: options?.omitNulls ?? false,
    requiredOnly: options?.requiredOnly ?? true,
  });
  return JSONSchemaFaker.generate(schema as Schema) as T;
}

export type { BuilderOptions } from '../types';
export type { Schema as BuilderSchema };

import type { Schema } from 'json-schema-faker';
export interface ZodGeneratorOptions {
    useOptional?: boolean;
    useNullable?: boolean;
}
export interface ZodMockOptions {
    useDefault?: boolean;
    useExamples?: boolean;
    alwaysIncludeOptionals?: boolean;
    optionalsProbability?: number | false;
    omitNulls?: boolean;
}
/**
 * Generates a Zod schema string from a JSON schema
 */
export declare function generateZodSchema(schema: Schema, options?: ZodGeneratorOptions): string;
/**
 * Generates mock data from a Zod schema definition
 */
export declare function generateMockFromZodSchema(zodSchemaString: string, overrides?: Record<string, unknown>, options?: ZodMockOptions): unknown;
//# sourceMappingURL=zod-generator.d.ts.map
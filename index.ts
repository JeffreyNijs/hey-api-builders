import {JSONSchemaFaker} from 'json-schema-faker'
import type { Schema} from 'json-schema-faker'
import type { BuilderOptions } from './utils'

export interface JSFOptions {
    useDefaultValue?: boolean
    useExamplesValue?: boolean
    alwaysFakeOptionals?: boolean
    optionalsProbability?: number | false
    omitNulls?: boolean
    requiredOnly?: boolean
}

// TODO: replace unknown with Schema
export function generateMock<T = unknown>(schema: unknown, options?: JSFOptions): T {
    JSONSchemaFaker.option({
        useDefaultValue: options?.useDefaultValue ?? false,
        useExamplesValue: options?.useExamplesValue ?? false,
        alwaysFakeOptionals: options?.alwaysFakeOptionals ?? false,
        optionalsProbability: options?.optionalsProbability ?? 1,
        omitNulls: options?.omitNulls ?? false,
        requiredOnly: options?.requiredOnly ?? true,
    })
    return JSONSchemaFaker.generate(schema as Schema) as T
}

export { defaultConfig, defineConfig } from './config';
export type { BuildersPlugin } from "./types";
export type { Schema as BuilderSchema, BuilderOptions };

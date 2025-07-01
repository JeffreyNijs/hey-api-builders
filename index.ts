import {JSONSchemaFaker} from 'json-schema-faker'

export interface JSFOptions {
    useDefaultValue?: boolean
    useExamplesValue?: boolean
    alwaysFakeOptionals?: boolean
    optionalsProbability?: number | false
    omitNulls?: boolean
    requiredOnly?: boolean
}

export function generateMock(schema: any, options?: JSFOptions): any {
    JSONSchemaFaker.option({
        useDefaultValue: options?.useDefaultValue ?? false,
        useExamplesValue: options?.useExamplesValue ?? false,
        alwaysFakeOptionals: options?.alwaysFakeOptionals ?? false,
        optionalsProbability: options?.optionalsProbability ?? 1,
        omitNulls: options?.omitNulls ?? false,
        requiredOnly: options?.requiredOnly ?? true,
    })
    return JSONSchemaFaker.generate(schema)
}

export {defaultConfig, defineConfig} from './config';
export type {BuildersPlugin} from "./types";



import {BuildersPlugin} from "./types";

function resolveRefs(schema: any, allSchemas: Record<string, any>): any {
    if (!schema) return schema;
    if (schema.$ref) {
        const refPath = schema.$ref.replace('#/components/schemas/', '');
        const resolved = allSchemas[refPath] || allSchemas[`${refPath}Schema`];
        if (!resolved) return schema;
        return resolveRefs(resolved, allSchemas);
    }
    if (schema.properties) {
        for (const key in schema.properties) {
            schema.properties[key] = resolveRefs(schema.properties[key], allSchemas);
        }
    }
    if (schema.items) {
        if (Array.isArray(schema.items)) {
            schema.items = schema.items.map((item: any) => resolveRefs(item, allSchemas));
        } else {
            schema.items = resolveRefs(schema.items, allSchemas);
        }
    }
    if (schema.allOf) {
        schema.allOf = schema.allOf.map((item: any) => resolveRefs(item, allSchemas));
    }
    return schema;
}

function sanitizeMethodName(prop: string) {
    return prop
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')
        .replace(/^(.)/, (m) => m.toUpperCase());
}

function getBuilderOptionsType(builderClassName: string) {
    return `_${builderClassName}Options`;
}

function getBuilderOptionsTypeDef(builderOptionsType: string) {
    return `type ${builderOptionsType} = {\n  useDefault?: boolean;\n  useExamples?: boolean;\n  alwaysIncludeOptionals?: boolean;\n  optionalsProbability?: number | false;\n  omitNulls?: boolean;\n};\n`;
}

// Helper to create a unique name for a schema constant
function getSchemaConstName(typeName: string) {
    return `${typeName}SchemaDef`;
}

// Helper to deeply compare schemas for deduplication
function stableStringify(obj: any): string {
    return JSON.stringify(obj, Object.keys(obj).sort());
}

function generateWithMethods(resolvedSchema: any, typeName: string) {
    if (!resolvedSchema.properties) return '';
    return Object.keys(resolvedSchema.properties)
        .filter((prop) => !prop.includes('[') && !prop.includes(']')) // skip bracket notation keys
        .map((prop) => {
            const methodName = `with${sanitizeMethodName(prop)}`;
            return `  ${methodName}(value: types.${typeName}["${prop}"]): this {\n    this.overrides["${prop}"] = value;\n    return this;\n  }`;
        })
        .join('\n');
}

export const handler: BuildersPlugin['Handler'] = ({plugin}) => {
    const schemas: Record<string, any> = {};

    // context.subscribe('after', () => {
    //     const file = context.createFile({
    //         id: plugin.name,
    //         path: plugin.output,
    //     });

    plugin.forEach('schema', (event) => {
        const {name, schema} = event;
        if (schema && typeof schema === 'object') {
            schemas[name] = schema;
        }
    })

    const file = plugin.createFile({
        id: plugin.name,
        path: plugin.output,
    });

    let outputContent = 'import { generateMock } from "hey-api-builders";\n';
    outputContent += 'import type * as types from "./types.gen";\n\n';
    outputContent += 'type BuilderOptions = {\n  useDefault?: boolean;\n  useExamples?: boolean;\n  alwaysIncludeOptionals?: boolean;\n  optionalsProbability?: number | false;\n  omitNulls?: boolean;\n};\n\n';

    // 1. Collect all unique resolved schemas
    const schemaDefs: Record<string, any> = {};
    const schemaDefNames: Record<string, string> = {};
    const schemaDefHashes: Record<string, string> = {};
    let schemaDefIndex = 1;

    function registerSchemaDef(schema: any, typeName: string): string {
        const stable = stableStringify(schema);
        if (schemaDefHashes[stable]) {
            return schemaDefHashes[stable];
        }
        const constName = getSchemaConstName(typeName) + (schemaDefNames[typeName] ? `_${schemaDefIndex++}` : '');
        schemaDefs[constName] = schema;
        schemaDefNames[typeName] = constName;
        schemaDefHashes[stable] = constName;
        return constName;
    }

    // 2. Prepare all resolved schemas and register them
    const builderSchemas: { typeName: string, builderClassName: string, isEnum: boolean, schemaConst: string }[] = [];
    for (const [schemaName, schema] of Object.entries(schemas)) {
        if (!schema || typeof schema !== 'object') continue;
        const resolvedSchema = resolveRefs(schema, schemas);
        const typeName = schemaName.replace(/Schema$/, '').trim();
        const builderClassName = `${typeName}Builder`;
        const isEnum = resolvedSchema.type === 'enum';
        // Clean up enum/union properties for object schemas
        if (!isEnum && resolvedSchema.properties) {
            for (const [prop, propSchemaRaw] of Object.entries(resolvedSchema.properties)) {
                const propSchema = propSchemaRaw as Record<string, any>;
                if (propSchema && propSchema["type"] === "enum") {
                    const enumValues = Array.isArray(propSchema["items"])
                        ? propSchema["items"].map((item: any) => item.const)
                        : [];
                    resolvedSchema.properties[prop] = {
                        ...propSchema,
                        type: "string",
                        enum: enumValues,
                    };
                } else if (
                    propSchema &&
                    Array.isArray(propSchema.items) &&
                    propSchema.logicalOperator === "or"
                ) {
                    const types = propSchema.items.map((item: any) => item.type).filter(Boolean);
                    if (types.length > 0) {
                        resolvedSchema.properties[prop] = {
                            ...propSchema,
                            type: types.length === 1 ? types[0] : types,
                        };
                        delete resolvedSchema.properties[prop].items;
                        delete resolvedSchema.properties[prop].logicalOperator;
                    } else {
                        resolvedSchema.properties[prop] = {
                            anyOf: propSchema.items,
                        };
                        delete resolvedSchema.properties[prop].items;
                        delete resolvedSchema.properties[prop].logicalOperator;
                    }
                }
            }
        }
        // For enums, flatten to string/enum
        let schemaForConst = resolvedSchema;
        if (isEnum) {
            const enumValues = resolvedSchema.items?.map((item: any) => item.const) || [];
            schemaForConst = {
                ...resolvedSchema,
                type: 'string',
                enum: enumValues,
            };
        }
        const schemaConst = registerSchemaDef(schemaForConst, typeName);
        builderSchemas.push({typeName, builderClassName, isEnum, schemaConst});
    }

    // 3. Emit all schema constants as a single object
    outputContent += 'const schemas = ' + JSON.stringify(schemaDefs, null, 0) + '\n\n';

    // 4. Emit all builder classes, referencing schemas from the object
    for (const {typeName, builderClassName, isEnum, schemaConst} of builderSchemas) {
        if (isEnum) {
            outputContent += `\nexport class ${builderClassName} {\n  private options: BuilderOptions = {};\n  setOptions(options: BuilderOptions) { this.options = options || {}; return this; }\n  build(): types.${typeName} {\n    return generateMock(schemas.${schemaConst}, {\n      useDefaultValue: this.options.useDefault,\n      useExamplesValue: this.options.useExamples,\n      alwaysFakeOptionals: this.options.alwaysIncludeOptionals,\n      optionalsProbability: this.options.optionalsProbability,\n      omitNulls: this.options.omitNulls,\n    }) as types.${typeName};\n  }\n}\n`;
        } else {
            const withMethods = generateWithMethods(schemaDefs[schemaConst], typeName);
            outputContent += `\nexport class ${builderClassName} {\n  private overrides: Partial<types.${typeName}> = {};\n  private options: BuilderOptions = {};\n  setOptions(options: BuilderOptions) { this.options = options || {}; return this; }\n${withMethods ? withMethods + '\n' : ''}  build(): types.${typeName} {\n    const mock = generateMock(schemas.${schemaConst}, {\n      useDefaultValue: this.options.useDefault,\n      useExamplesValue: this.options.useExamples,\n      alwaysFakeOptionals: this.options.alwaysIncludeOptionals,\n      optionalsProbability: this.options.optionalsProbability,\n      omitNulls: this.options.omitNulls,\n    }) as types.${typeName};\n    return { ...mock, ...this.overrides };\n  }\n}\n`;
        }
    }
    file.add(outputContent);
};

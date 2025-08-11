import type { BuildersPlugin } from "./types";
import {
  JSONSchema,
  SchemaMap,
  RegisteredSchema,
  RegistrationContext,
  resolveRefs,
  generateWithMethods,
  registerSchemaDef,
  normalizeObjectProperties,
  normalizeTopLevelEnum,
  isInternalEnumSchema, BuildersHandler
} from './utils';

export const handler: BuildersHandler = ({ plugin }) => {
  const schemas: SchemaMap = {};

  plugin.forEach('schema', (event) => {
    const { name, schema } = event
    if (schema && typeof schema === 'object') {
      schemas[name] = schema;
    }
  });

  const file = plugin.createFile({
    id: plugin.name,
    path: plugin.output,
  });

  let outputContent = 'import { generateMock } from "hey-api-builders";\n';
  outputContent += 'import type * as types from "./types.gen";\n\n';
  outputContent += 'type BuilderOptions = {\n  useDefault?: boolean;\n  useExamples?: boolean;\n  alwaysIncludeOptionals?: boolean;\n  optionalsProbability?: number | false;\n  omitNulls?: boolean;\n};\n\n';

  // Registration context for deduplication
  const ctx: RegistrationContext = {
    schemaDefs: {},
    schemaDefNames: {},
    schemaDefHashes: {},
    schemaDefIndex: 1,
  };

  const builderSchemas: RegisteredSchema[] = [];

  for (const [schemaName, rawSchema] of Object.entries(schemas)) {
    if (!rawSchema || typeof rawSchema !== 'object') continue;

    const resolvedSchema = resolveRefs(rawSchema, schemas) as JSONSchema;
    const typeName = schemaName.replace(/Schema$/, '').trim();
    const builderClassName = `${typeName}Builder`;

    // Detect top-level enum (internal representation) and normalize before registration
    let schemaForConst = normalizeTopLevelEnum(resolvedSchema);
    const isEnum = isInternalEnumSchema(resolvedSchema);

    // If not a top-level enum, normalize nested object properties
    if (!isEnum) {
      normalizeObjectProperties(schemaForConst);
    }

    const schemaConst = registerSchemaDef(schemaForConst, typeName, ctx);
    builderSchemas.push({ typeName, builderClassName, isEnum, schemaConst });
  }

  // Emit all schema constants as a single object (typed as const for property access)
  outputContent += 'const schemas = ' + JSON.stringify(ctx.schemaDefs, null, 2) + ' as const;\n\n';

  // Emit builder classes
  for (const { typeName, builderClassName, isEnum, schemaConst } of builderSchemas) {
    if (isEnum) {
      outputContent += `
export class ${builderClassName} {
  private options: BuilderOptions = {};
  
  setOptions(options: BuilderOptions): this { 
    this.options = options || {}; 
    return this; 
  }
  
  build(): types.${typeName} {
    return generateMock<types.${typeName}>(schemas.${schemaConst}, {
      useDefaultValue: this.options.useDefault,
      useExamplesValue: this.options.useExamples,
      alwaysFakeOptionals: this.options.alwaysIncludeOptionals,
      optionalsProbability: this.options.optionalsProbability,
      omitNulls: this.options.omitNulls,
    });
  }
}
`;
    } else {
      const withMethods = generateWithMethods(ctx.schemaDefs[schemaConst], typeName);
      outputContent += `
export class ${builderClassName} {
  private overrides: Partial<types.${typeName}> = {};
  private options: BuilderOptions = {};
  
  setOptions(options: BuilderOptions): this { 
    this.options = options || {}; 
    return this; 
  }
${withMethods ? withMethods + '\n' : ''}  
  build(): types.${typeName} {
    const mock = generateMock<types.${typeName}>(schemas.${schemaConst}, {
      useDefaultValue: this.options.useDefault,
      useExamplesValue: this.options.useExamples,
      alwaysFakeOptionals: this.options.alwaysIncludeOptionals,
      optionalsProbability: this.options.optionalsProbability,
      omitNulls: this.options.omitNulls,
    });
    return { ...mock, ...this.overrides };
  }
}
`;
    }
  }

  file.add(outputContent);
};

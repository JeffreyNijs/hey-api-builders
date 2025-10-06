import { collectSchemas, generateWithMethods } from './utils';
import { generateZodSchema } from './zod-generator';
import { generateStaticMockCode } from './static-mock-generator';
import type { BuildersHandler } from './types';
import type { IR } from '@hey-api/openapi-ts';

export const handler: BuildersHandler = ({ plugin }) => {
  const rawSchemas: Record<string, IR.SchemaObject> = {};
  plugin.forEach('schema', (event) => { rawSchemas[event.name] = event.schema; });
  const metas = collectSchemas(rawSchemas);
  const file = plugin.createFile({ id: plugin.name, path: plugin.output });

  const config = plugin.config;
  const generateZod = config.generateZod || false;
  const useZodForMocks = config.useZodForMocks || false;
  const useStaticMocks = config.useStaticMocks || false;

  let out = '';

  // Fix: Only import "z" once, even if both options are enabled
  const needsZodImport = generateZod || useZodForMocks;

  // Import section based on options
  if (useStaticMocks) {
    // Static mocks don't need any imports from the library
  } else if (useZodForMocks) {
    out += 'import { generateMockFromZodSchema } from "hey-api-builders"\n';
  } else {
    out += 'import { generateMock } from "hey-api-builders"\n';
    out += 'import type { BuilderSchema } from "hey-api-builders"\n';
  }

  if (needsZodImport) {
    out += 'import { z } from "zod"\n';
  }

  out += 'import type * as types from "./types.gen"\n\n';

  out += 'type BuilderOptions = {\n';
  out += '  useDefault?: boolean;\n';
  out += '  useExamples?: boolean;\n';
  out += '  alwaysIncludeOptionals?: boolean;\n';
  out += '  optionalsProbability?: number | false;\n';
  out += '  omitNulls?: boolean;\n';
  out += '}\n\n';

  // Generate JSON schemas for JSF (only if not using static or zod mocks)
  if (!useZodForMocks && !useStaticMocks) {
    const schemaEntries: string[] = [];
    for (const m of metas) {
      schemaEntries.push(`  ${m.constName}: ${JSON.stringify(m.schema)}`);
    }
    out += 'const schemas = {\n' + schemaEntries.join(',\n') + '\n} satisfies Record<string, BuilderSchema>\n\n';
  }

  // Generate Zod schemas if requested
  if (generateZod || useZodForMocks) {
    const zodSchemaEntries: string[] = [];
    for (const m of metas) {
      const zodSchemaString = generateZodSchema(m.schema);
      zodSchemaEntries.push(`  ${m.constName}Zod: ${zodSchemaString}`);
    }
    out += 'export const zodSchemas = {\n' + zodSchemaEntries.join(',\n') + '\n}\n\n';
  }

  // Generate builders
  for (const m of metas) {
    if (m.isEnum) {
      out += `export class ${m.typeName}Builder {\n`;
      out += `  private options: BuilderOptions = {}\n`;
      out += `  setOptions(o: BuilderOptions): this { this.options = o || {}; return this }\n`;

      if (useStaticMocks) {
        // Static mock for enums - just return the first value
        const staticMock = generateStaticMockCode(m.schema, m.typeName);
        out += `  build(): types.${m.typeName} {\n`;
        out += `    return ${staticMock} as types.${m.typeName};\n`;
        out += `  }\n`;
      } else if (useZodForMocks) {
        out += `  build(): types.${m.typeName} {\n`;
        out += `    const zodSchemaString = \`${generateZodSchema(m.schema)}\`;\n`;
        out += `    return generateMockFromZodSchema(zodSchemaString, {}, {\n`;
        out += `      useDefault: this.options.useDefault,\n`;
        out += `      useExamples: this.options.useExamples,\n`;
        out += `      alwaysIncludeOptionals: this.options.alwaysIncludeOptionals,\n`;
        out += `      optionalsProbability: this.options.optionalsProbability,\n`;
        out += `      omitNulls: this.options.omitNulls\n`;
        out += `    }) as types.${m.typeName};\n`;
        out += `  }\n`;
      } else {
        out += `  build(): types.${m.typeName} {\n`;
        out += `    return generateMock<types.${m.typeName}>(schemas.${m.constName}, {\n`;
        out += `      useDefaultValue: this.options.useDefault,\n`;
        out += `      useExamplesValue: this.options.useExamples,\n`;
        out += `      alwaysFakeOptionals: this.options.alwaysIncludeOptionals,\n`;
        out += `      optionalsProbability: this.options.optionalsProbability,\n`;
        out += `      omitNulls: this.options.omitNulls\n`;
        out += `    })\n`;
        out += `  }\n`;
      }
      out += `}\n\n`;
    } else {
      const withMethods = generateWithMethods(m.schema, m.typeName);
      out += `export class ${m.typeName}Builder {\n`;
      out += `  private overrides: Partial<types.${m.typeName}> = {}\n`;
      out += `  private options: BuilderOptions = {}\n`;
      out += `  setOptions(o: BuilderOptions): this { this.options = o || {}; return this }\n`;
      if (withMethods) out += withMethods + '\n';

      if (useStaticMocks) {
        // Static mock generation - generate a base object and merge overrides
        const staticMock = generateStaticMockCode(m.schema, m.typeName);
        out += `  build(): types.${m.typeName} {\n`;
        out += `    const baseMock = ${staticMock};\n`;
        out += `    return { ...baseMock, ...this.overrides } as types.${m.typeName};\n`;
        out += `  }\n`;
      } else if (useZodForMocks) {
        out += `  build(): types.${m.typeName} {\n`;
        out += `    const zodSchemaString = \`${generateZodSchema(m.schema)}\`;\n`;
        out += `    return generateMockFromZodSchema(zodSchemaString, this.overrides, {\n`;
        out += `      useDefault: this.options.useDefault,\n`;
        out += `      useExamples: this.options.useExamples,\n`;
        out += `      alwaysIncludeOptionals: this.options.alwaysIncludeOptionals,\n`;
        out += `      optionalsProbability: this.options.optionalsProbability,\n`;
        out += `      omitNulls: this.options.omitNulls\n`;
        out += `    }) as types.${m.typeName};\n`;
        out += `  }\n`;
      } else {
        out += `  build(): types.${m.typeName} {\n`;
        out += `    const mock = generateMock<types.${m.typeName}>(schemas.${m.constName}, {\n`;
        out += `      useDefaultValue: this.options.useDefault,\n`;
        out += `      useExamplesValue: this.options.useExamples,\n`;
        out += `      alwaysFakeOptionals: this.options.alwaysIncludeOptionals,\n`;
        out += `      optionalsProbability: this.options.optionalsProbability,\n`;
        out += `      omitNulls: this.options.omitNulls\n`;
        out += `    })\n`;
        out += `    for (const k in this.overrides) {\n`;
        out += `      if (Object.prototype.hasOwnProperty.call(this.overrides, k)) {\n`;
        out += `        const typedMock = mock as Record<string, unknown>;\n`;
        out += `        const typedOverrides = this.overrides as Record<string, unknown>;\n`;
        out += `        typedMock[k] = typedOverrides[k];\n`;
        out += `      }\n`;
        out += `    }\n`;
        out += `    return mock\n`;
        out += `  }\n`;
      }
      out += `}\n\n`;
    }
  }

  file.add(out);
};

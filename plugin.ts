import { collectSchemas, generateWithMethods } from './utils';
import { ZodSchemaGenerator } from './zod-generator';
import { generateStaticMockCode } from './static-mock-generator';
import type { BuildersHandler } from './types';
import type { IR } from '@hey-api/openapi-ts';

export const handler: BuildersHandler = ({ plugin }) => {
  const rawSchemas: Record<string, IR.SchemaObject> = {};
  plugin.forEach('schema', (event) => { rawSchemas[event.name] = event.schema; });
  const metas = collectSchemas(rawSchemas);
  const file = plugin.createFile({ id: plugin.name, path: plugin.output });

  const config = plugin.config;
  const mockStrategy = config.mockStrategy || 'runtime';

  let out = '';

  if (mockStrategy === 'zod') {
    out += 'import { generateMockFromZodSchema } from "hey-api-builders"\n';
    out += 'import * as zodSchemas from "./zod.gen"\n';
  } else if (mockStrategy === 'runtime') {
    out += 'import { generateMock } from "hey-api-builders"\n';
    out += 'import type { BuilderSchema } from "hey-api-builders"\n';
  }

  out += 'import type * as types from "./types.gen"\n\n';

  out += 'type BuilderOptions = {\n';
  out += '  useDefault?: boolean;\n';
  out += '  useExamples?: boolean;\n';
  out += '  alwaysIncludeOptionals?: boolean;\n';
  out += '  optionalsProbability?: number | false;\n';
  out += '  omitNulls?: boolean;\n';
  out += '}\n\n';

  if (mockStrategy === 'runtime') {
    const schemaEntries: string[] = [];
    for (const m of metas) {
      schemaEntries.push(`  ${m.constName}: ${JSON.stringify(m.schema)}`);
    }
    out += 'const schemas = {\n' + schemaEntries.join(',\n') + '\n} satisfies Record<string, BuilderSchema>\n\n';
  }

  if (mockStrategy === 'zod') {
    const zodSchemaGenerator = new ZodSchemaGenerator();
    for (const m of metas) {
      zodSchemaGenerator.generate(m.schema, m.typeName);
    }
    const zodFile = plugin.createFile({ id: 'zod', path: 'zod.gen.ts' });
    zodFile.add(zodSchemaGenerator.getGeneratedSchemas());
  }

  for (const m of metas) {
    if (m.isEnum) {
      out += `export class ${m.typeName}Builder {\n`;
      out += `  private options: BuilderOptions = {}\n`;
      out += `  setOptions(o: BuilderOptions): this { this.options = o || {}; return this }\n`;

      if (mockStrategy === 'static') {
        const staticMock = generateStaticMockCode(m.schema, m.typeName);
        out += `  build(): types.${m.typeName} {\n`;
        out += `    return ${staticMock} as types.${m.typeName};\n`;
        out += `  }\n`;
      } else if (mockStrategy === 'zod') {
        out += `  build(): types.${m.typeName} {\n`;
        out += `    return generateMockFromZodSchema(zodSchemas.${m.typeName}Schema, {}, {\n`;
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

      if (mockStrategy === 'static') {
        const staticMock = generateStaticMockCode(m.schema, m.typeName);
        out += `  build(): types.${m.typeName} {\n`;
        out += `    const baseMock = ${staticMock};\n`;
        out += `    return { ...baseMock, ...this.overrides } as types.${m.typeName};\n`;
        out += `  }\n`;
      } else if (mockStrategy === 'zod') {
        out += `  build(): types.${m.typeName} {\n`;
        out += `    return generateMockFromZodSchema(zodSchemas.${m.typeName}Schema, this.overrides, {\n`;
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

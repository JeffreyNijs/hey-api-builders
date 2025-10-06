import type { IR } from '@hey-api/openapi-ts';
import type { BuildersHandler } from '../types';
import { collectSchemas } from '../core/schema-transformer';
import { generateZodSchema } from '../generators/zod-schema-generator';
import { generateEnumBuilder, generateObjectBuilder } from '../generators/builder-generator';
import {
  generateImports,
  generateBuilderOptionsType,
  generateSchemaConstants,
} from '../core/code-generator';

/**
 * Main plugin handler for generating builder classes
 */
export const handler: BuildersHandler = ({ plugin }) => {
  const rawSchemas: Record<string, IR.SchemaObject> = {};
  plugin.forEach('schema', (event) => {
    rawSchemas[event.name] = event.schema;
  });
  const metas = collectSchemas(rawSchemas);

  const file = plugin.createFile({ id: plugin.name, path: plugin.output });

  const config = plugin.config;
  const generateZod = config.generateZod || false;
  const mockStrategy = config.mockStrategy || 'runtime';
  const builderIdentifier = config.builderIdentifier || '';

  let out = '';

  out += generateImports({ mockStrategy, generateZod });

  out += generateBuilderOptionsType();

  if (mockStrategy === 'runtime') {
    out += generateSchemaConstants(metas);
  }

  if (generateZod || mockStrategy === 'zod') {
    const zodSchemaEntries: string[] = [];
    for (const m of metas) {
      const zodSchemaString = generateZodSchema(m.schema);
      zodSchemaEntries.push(`  ${m.constName}Zod: ${zodSchemaString}`);
    }
    out += 'export const zodSchemas = {\n' + zodSchemaEntries.join(',\n') + '\n}\n\n';
  }

  for (const m of metas) {
    if (m.isEnum) {
      out += generateEnumBuilder(m, { mockStrategy, builderIdentifier });
    } else {
      out += generateObjectBuilder(m, { mockStrategy, builderIdentifier });
    }
  }

  file.add(out);
};

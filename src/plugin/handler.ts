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
  // Collect schemas from IR
  const rawSchemas: Record<string, IR.SchemaObject> = {};
  plugin.forEach('schema', (event) => {
    rawSchemas[event.name] = event.schema;
  });
  const metas = collectSchemas(rawSchemas);

  // Create output file
  const file = plugin.createFile({ id: plugin.name, path: plugin.output });

  // Get configuration
  const config = plugin.config;
  const generateZod = config.generateZod || false;
  const useZodForMocks = config.useZodForMocks || false;
  const useStaticMocks = config.useStaticMocks || false;

  let out = '';

  // Generate imports
  out += generateImports({ useStaticMocks, useZodForMocks, generateZod });

  // Generate BuilderOptions type
  out += generateBuilderOptionsType();

  // Generate JSON schemas for JSF (only if not using static or zod mocks)
  if (!useZodForMocks && !useStaticMocks) {
    out += generateSchemaConstants(metas);
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
  const builderOptions = { useStaticMocks, useZodForMocks };
  for (const m of metas) {
    if (m.isEnum) {
      out += generateEnumBuilder(m, builderOptions);
    } else {
      out += generateObjectBuilder(m, builderOptions);
    }
  }

  file.add(out);
};

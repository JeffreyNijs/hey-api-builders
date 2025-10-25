import { collectSchemas } from '../core/schema-transformer'
import { generateEnumBuilder, generateObjectBuilder } from '../generators/builder-generator'
import { ZodSchemaGenerator } from '../generators/zod-schema-generator'
import type { BuildersHandler, Plugin } from '../types'
import type { IR } from '@hey-api/openapi-ts'
import { MOCK_STRATEGIES } from '../core/constants'
import { getPluginConfig } from '../plugin/config'

export const handler: BuildersHandler = ({ plugin }) => {
  const rawSchemas: Record<string, IR.SchemaObject> = {}
  ;(plugin as Plugin).forEach('schema', (event) => {
    rawSchemas[event.name] = event.schema
  })
  const metas = collectSchemas(rawSchemas)
  const file = (plugin as Plugin).createFile({
    id: (plugin as Plugin).name,
    path: (plugin as Plugin).output,
  })

  const config = getPluginConfig((plugin as Plugin).config)

  let out = ''

  if (config.mockStrategy === MOCK_STRATEGIES.ZOD) {
    out += 'import { generateMockFromZodSchema } from "hey-api-builders"\n'
    out += `import * as zodSchemas from "./zod.gen"\n`
  } else if (config.mockStrategy === MOCK_STRATEGIES.RUNTIME) {
    out += 'import { generateMock } from "hey-api-builders"\n'
    out += 'import type { BuilderSchema } from "hey-api-builders"\n'
  }

  out += 'import type * as types from "./types.gen"\n'
  out += 'import { BaseBuilder, BuilderOptions } from "hey-api-builders"\n\n'

  if (config.mockStrategy === MOCK_STRATEGIES.RUNTIME) {
    const schemaEntries: string[] = []
    for (const m of metas) {
      schemaEntries.push(`  ${m.constName}: ${JSON.stringify(m.schema)}`)
    }
    out +=
      'const schemas = {\n' +
      schemaEntries.join(',\n') +
      '\n} satisfies Record<string, BuilderSchema>\n\n'
  }

  if (config.mockStrategy === MOCK_STRATEGIES.ZOD) {
    const zodSchemaGenerator = new ZodSchemaGenerator()
    for (const m of metas) {
      zodSchemaGenerator.generate(m.schema, m.typeName)
    }
    const zodFile = (plugin as Plugin).createFile({ id: 'zod', path: 'zod.gen.ts' })
    zodFile.add(zodSchemaGenerator.getGeneratedSchemas())
  }

  for (const m of metas) {
    if (m.isEnum) {
      out += generateEnumBuilder(m, { mockStrategy: config.mockStrategy })
    } else {
      out += generateObjectBuilder(m, { mockStrategy: config.mockStrategy })
    }
  }

  file.add(out)
}

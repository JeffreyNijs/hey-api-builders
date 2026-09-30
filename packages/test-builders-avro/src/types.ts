import type { SchemaBuilderConfig } from '@jeffreynijs/test-builders';
export type AvroSchema = string | readonly AvroSchema[] | Readonly<Record<string, unknown>>;
export interface AvroFixtureOptions extends SchemaBuilderConfig {
  readonly profile?: 'minimal' | 'random' | 'boundary' | 'defaults';
  readonly listLength?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
  readonly maxSchemaCharacters?: number;
}

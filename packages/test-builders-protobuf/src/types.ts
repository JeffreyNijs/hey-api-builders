import type { SchemaBuilderConfig } from '@jeffreynijs/test-builders';
export interface ProtobufFixtureOptions extends SchemaBuilderConfig {
  readonly profile?: 'minimal' | 'random' | 'boundary' | 'defaults';
  readonly filename?: string;
  /** Virtual .proto files, resolved in memory. Filesystem/network imports are never attempted. */
  readonly imports?: Readonly<Record<string, string>>;
  readonly keepCase?: boolean;
  readonly listLength?: number;
  readonly maxDepth?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
  readonly maxSchemaCharacters?: number;
}

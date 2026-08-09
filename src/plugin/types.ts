import type { DefinePlugin, Plugin } from '@hey-api/openapi-ts';

export type Casing =
  'camelCase' | 'PascalCase' | 'preserve' | 'snake_case' | 'SCREAMING_SNAKE_CASE';

export type NameTransformer = string | ((name: string) => string);

export interface BuilderNamingConfig {
  /** Casing applied to the OpenAPI schema or operation name. */
  case?: Casing;
  /** Whether this category of builders is generated. */
  enabled?: boolean;
  /** Naming template or transformer. The template receives `{{name}}`. */
  name?: NameTransformer;
}

type BuilderFeature = boolean | NameTransformer | BuilderNamingConfig;

export type UserConfig = {
  name: 'hey-api-builders';
} & Plugin.Hooks &
  Plugin.UserExports & {
    /** Casing shared by builder categories unless overridden. */
    case?: Casing;
    /** Builders for reusable schemas. Enabled by default. */
    definitions?: BuilderFeature;
    /** Builders for operation request data. Enabled by default. */
    requests?: BuilderFeature;
    /** Builders for operation response data. Enabled by default. */
    responses?: BuilderFeature;
  };

interface ResolvedBuilderFeature {
  case: Casing;
  enabled: boolean;
  name: NameTransformer;
}

export type Config = {
  name: 'hey-api-builders';
} & Plugin.Hooks &
  Plugin.Exports & {
    case: Casing;
    definitions: ResolvedBuilderFeature;
    requests: ResolvedBuilderFeature;
    responses: ResolvedBuilderFeature;
  };

export type BuildersPlugin = DefinePlugin<UserConfig, Config>;

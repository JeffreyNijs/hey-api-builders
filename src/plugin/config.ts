import { definePluginConfig } from '@hey-api/openapi-ts';

import { handler } from './handler';
import type { BuildersPlugin, UserConfig } from './types';

export const defaultConfig: BuildersPlugin['Config'] = {
  config: {
    $cascade: ['case'],
    case: 'PascalCase',
    definitions: {
      enabled: true,
      name: '{{name}}Builder',
    },
    includeInEntry: true,
    requests: {
      enabled: true,
      name: '{{name}}Builder',
    },
    responses: {
      enabled: true,
      name: '{{name}}Builder',
    },
  },
  dependencies: ['@hey-api/typescript', '@faker-js/faker'],
  handler,
  name: 'hey-api-builders',
  symbolMeta() {
    return {
      artifact: 'hey-api-builders',
    };
  },
};

type PublicPluginConfig = Omit<BuildersPlugin['Config'], 'name'> & {
  name: never;
};

export const defineConfig = definePluginConfig(defaultConfig) as (
  userConfig?: Omit<UserConfig, 'name'>
) => PublicPluginConfig;

export default defineConfig;

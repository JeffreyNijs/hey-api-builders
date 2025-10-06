import { definePluginConfig } from '@hey-api/openapi-ts';
import type { BuildersPlugin } from '../types';
import { handler } from './handler';

export const defaultConfig: BuildersPlugin['Config'] = {
  config: {},
  dependencies: ['@hey-api/schemas', '@hey-api/typescript'],
  handler,
  name: 'hey-api-builders',
  output: 'builders',
};

export const defineConfig = definePluginConfig(defaultConfig);

export default defineConfig;

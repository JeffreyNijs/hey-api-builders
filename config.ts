import {definePluginConfig, Plugin} from "@hey-api/openapi-ts";
import {Config, BuildersPlugin} from "./types";
import { handler } from "./plugin";

export const defaultConfig: BuildersPlugin['Config'] = {
    config: {},
    dependencies: ['@hey-api/schemas', '@hey-api/typescript'],
    handler,
    name: 'hey-api-builders',
    output: 'builders',
    // @ts-ignore
    exportFromIndex: true
};

export const defineConfig = definePluginConfig(
    defaultConfig
);

export default defineConfig;

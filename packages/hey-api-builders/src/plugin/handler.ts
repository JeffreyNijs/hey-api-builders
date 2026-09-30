import { emitDefinitionBuilder, emitOperationBuilders, emitRuntime } from './generator';
import type { BuilderNamingConfig, BuildersPlugin, Casing, Config, NameTransformer } from './types';

const defaultName = '{{name}}Builder';

function resolveFeature(
  feature: boolean | NameTransformer | BuilderNamingConfig,
  inheritedCase: Casing
): Config['definitions'] {
  if (typeof feature === 'boolean') {
    return {
      case: inheritedCase,
      enabled: feature,
      name: defaultName,
    };
  }

  if (typeof feature === 'function' || typeof feature === 'string') {
    return {
      case: inheritedCase,
      enabled: true,
      name: feature,
    };
  }

  return {
    case: feature.case ?? inheritedCase,
    enabled: feature.enabled ?? true,
    name: feature.name ?? defaultName,
  };
}

export const handler: BuildersPlugin['Handler'] = ({ plugin }) => {
  // External plugins are currently handed unresolved shorthand values by
  // openapi-ts 0.99. Normalize them here while continuing to accept the fully
  // resolved object shape used by future plugin resolvers.
  const inheritedCase = plugin.config.case ?? 'PascalCase';
  const definitions = resolveFeature(plugin.config.definitions, inheritedCase);
  const requests = resolveFeature(plugin.config.requests, inheritedCase);
  const responses = resolveFeature(plugin.config.responses, inheritedCase);
  const runtime = emitRuntime(plugin);

  plugin.forEach('schema', 'operation', (event) => {
    if (event.type === 'schema') {
      if (definitions.enabled) {
        emitDefinitionBuilder({ event, naming: definitions, plugin, runtime });
      }
      return;
    }

    emitOperationBuilders({
      operation: event.operation,
      plugin,
      requests,
      responses,
      runtime,
    });
  });
};

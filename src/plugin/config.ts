import type { PluginConfig, HeyApiBuildersConfig } from '../types'
import { MOCK_STRATEGIES } from '../core/constants'

export function getPluginConfig(config: PluginConfig = {}): HeyApiBuildersConfig {
  const mockStrategy =
    config.mockStrategy ||
    (config.useZodForMocks ? MOCK_STRATEGIES.ZOD : undefined) ||
    (config.useStaticMocks ? MOCK_STRATEGIES.STATIC : undefined) ||
    MOCK_STRATEGIES.RUNTIME

  return {
    mockStrategy,
  }
}

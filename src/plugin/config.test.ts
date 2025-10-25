import { describe, it, expect } from 'vitest';
import { getPluginConfig } from './config';
import { MOCK_STRATEGIES } from '../core/constants';

describe('config', () => {
  describe('getPluginConfig', () => {
    it('should return runtime strategy by default', () => {
      const config = getPluginConfig({});
      expect(config.mockStrategy).toBe(MOCK_STRATEGIES.RUNTIME);
    });

    it('should return zod strategy when useZodForMocks is true', () => {
      const config = getPluginConfig({ useZodForMocks: true });
      expect(config.mockStrategy).toBe(MOCK_STRATEGIES.ZOD);
    });

    it('should return static strategy when useStaticMocks is true', () => {
      const config = getPluginConfig({ useStaticMocks: true });
      expect(config.mockStrategy).toBe(MOCK_STRATEGIES.STATIC);
    });

    it('should prefer mockStrategy over deprecated flags', () => {
      const config = getPluginConfig({
        mockStrategy: 'runtime',
        useZodForMocks: true,
      });
      expect(config.mockStrategy).toBe(MOCK_STRATEGIES.RUNTIME);
    });

    it('should handle all mockStrategy options', () => {
      const runtimeConfig = getPluginConfig({ mockStrategy: 'runtime' });
      expect(runtimeConfig.mockStrategy).toBe(MOCK_STRATEGIES.RUNTIME);

      const zodConfig = getPluginConfig({ mockStrategy: 'zod' });
      expect(zodConfig.mockStrategy).toBe(MOCK_STRATEGIES.ZOD);

      const staticConfig = getPluginConfig({ mockStrategy: 'static' });
      expect(staticConfig.mockStrategy).toBe(MOCK_STRATEGIES.STATIC);
    });
  });
});

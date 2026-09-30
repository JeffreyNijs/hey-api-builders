import { expect, it } from 'vitest';
import builders from '../../packages/hey-api-builders/src/index.js';
it('keeps independent plugin configurations from changing shared defaults', () => {
  const baseline = builders();
  const configured = builders({
    definitions: false,
    requests: true,
    runtimeModule: './runtime.js',
  });
  expect(configured).not.toEqual(baseline);
  expect(builders()).toEqual(baseline);
});

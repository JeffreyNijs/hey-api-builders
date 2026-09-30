import { expect, it } from 'vitest';
import builders from '../../packages/hey-api-builders/src/index.js';
it('retains the plugin configuration entry point without requiring a generated client', () => {
  expect(builders()).toBeDefined();
  expect(builders({ definitions: false, requests: true })).toBeDefined();
});

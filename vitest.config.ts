import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/hey-api-builders/src/**/*.{test,spec}.ts', 'tests/e2e/**/*.{test,spec}.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      // Core coverage is measured by test:core with its complete Node suite and
      // higher thresholds. Do not re-count only its four Zod integration tests.
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.ts',
        'packages/test-builders/**',
      ],
      include: ['packages/hey-api-builders/src/**/*.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});

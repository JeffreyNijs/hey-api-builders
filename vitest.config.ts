import { defineConfig } from 'vitest/config';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
// Source tests follow workspace imports back to TypeScript so watch mode observes
// edits immediately. Integration/packed tests deliberately keep real exports.
const aliases = [
  {
    find: '@mimlet/adapter/testing',
    replacement: fileURLToPath(new URL('./packages/adapter/src/testing.ts', import.meta.url)),
  },
  ...readdirSync(new URL('./packages', import.meta.url)).map((directory) => {
    const manifest = JSON.parse(
      readFileSync(new URL(`./packages/${directory}/package.json`, import.meta.url), 'utf8')
    ) as { name: string };
    return {
      find: manifest.name,
      replacement: fileURLToPath(new URL(`./packages/${directory}/src/index.ts`, import.meta.url)),
    };
  }),
];

export default defineConfig({
  test: {
    projects: [
      {
        root,
        resolve: { alias: aliases },
        test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        root,
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          include: [
            'packages/hey-api-builders/src/**/*.{test,spec}.ts',
            'tests/e2e/**/*.{test,spec}.ts',
          ],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
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
        'packages/core/**',
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

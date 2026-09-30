import { defineConfig, devices } from '@playwright/test';
import { createServer } from 'node:net';

// A developer preview may belong to another worktree. Always start this build's
// own server; pass its selected port to Playwright workers through their environment.
if (!process.env.MIMLET_DOCS_TEST_PORT) {
  const socket = createServer();
  await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to select a docs test port');
  }
  process.env.MIMLET_DOCS_TEST_PORT = String(address.port);
  await new Promise<void>((resolve) => socket.close(() => resolve()));
}
const port = Number(process.env.MIMLET_DOCS_TEST_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError('Invalid docs test port');
}
const url = `http://127.0.0.1:${port}/mimlet/`;

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/artifacts',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  use: { baseURL: url, trace: 'retain-on-failure' },
  webServer: {
    command: `node scripts/preview.ts --port ${port}`,
    url,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

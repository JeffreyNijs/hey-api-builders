import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results/artifacts',
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  use: { baseURL: 'http://127.0.0.1:4174/mimlet/', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm docs:preview',
    url: 'http://127.0.0.1:4174/mimlet/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

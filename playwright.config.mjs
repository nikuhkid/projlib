import { defineConfig } from '@playwright/test';
const baseURL = process.env.PROJLIB_TEST_ORIGIN || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL, viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run dev', url: baseURL + '/projlib/', env: { PORT: new URL(baseURL).port }, reuseExistingServer: !process.env.CI },
  reporter: 'list'
});

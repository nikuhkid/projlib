import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 900 } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4173/projlib/', reuseExistingServer: !process.env.CI },
  reporter: 'list'
});

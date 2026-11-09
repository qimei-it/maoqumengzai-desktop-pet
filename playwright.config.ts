import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: process.env.MQMZ_TEST_OUTPUT || '/tmp/mqmz-playwright-results',
})

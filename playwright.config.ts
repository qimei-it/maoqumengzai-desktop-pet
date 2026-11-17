import { defineConfig } from '@playwright/test'

// Panels are created on demand in production; the existing suite expects every
// window to exist after launch, so tests opt into eager creation.
process.env.MQMZ_EAGER_WINDOWS = '1'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  // Native window/focus timing can flake under a long local run; one retry
  // keeps the suite signal without hiding reproducible failures.
  retries: 1,
  reporter: 'list',
  outputDir: process.env.MQMZ_TEST_OUTPUT || '/tmp/mqmz-playwright-results',
})

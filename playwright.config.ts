import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  // Один воркер, а не параллель: комната в mock-сервере одна на весь прогон, и проекты
  // chromium/webkit, идя одновременно, писали бы в неё вперемешку — тесты, которые считают
  // сообщения в ленте, ловили бы чужие. Набор маленький, цена — секунды.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // line — прогресс в консоли, html — отчёт с трассами упавших (`playwright show-report`).
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // Штатный Chromium из поставки Playwright, не системный Chrome: на CI его нет,
      // а `channel: 'chrome'` без него падает ещё до первого теста.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --dir tools/matrix-mock dev',
      url: 'http://localhost:3001/_dev/history-toggle',
      reuseExistingServer: !isCI,
    },
    {
      command: 'pnpm --dir packages/widget dev',
      url: 'http://localhost:5174/widget/',
      reuseExistingServer: !isCI,
    },
    {
      command: 'pnpm --dir tools/host-demo dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
    },
  ],
})

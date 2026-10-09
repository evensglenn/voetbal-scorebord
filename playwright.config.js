import { defineConfig } from '@playwright/test'

// Browsertests tegen de Firebase-emulators (npm run test:e2e). Elke test logt
// in met een eigen, vers account, zodat tests elkaar niet raken en ook het
// "Test"-account van `npm run dev:local` niet.
export default defineConfig({
  testDir: 'e2e',
  // Eén emulator voor alle tests; één voor één houdt het inlogvenster betrouwbaar.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5181',
    // De geïnstalleerde Google Chrome (ook op de GitHub-runners): geen download nodig.
    channel: 'chrome',
    trace: 'retain-on-failure',
    // De pulserende startknop staat anders nooit stil voor Playwright.
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'node scripts/emulators.mjs dev',
    url: 'http://localhost:5181',
    // Lokaal wordt een al draaiende `npm run dev:local` hergebruikt.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

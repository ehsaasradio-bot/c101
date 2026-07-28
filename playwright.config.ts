import { defineConfig, devices } from '@playwright/test'

// Not Astro's default 4321 — that port is often already taken by another dev
// server, and `reuseExistingServer` would then silently run the whole suite
// against someone else's app. Override with PORT if 4399 is busy too.
const PORT = Number(process.env.PORT ?? 4399)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Tests run against the real production build, so they exercise the same
  // bundling, code-splitting, and static output that ships.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: baseURL,
    // Never reuse: a stranger's server on this port must fail loudly, not
    // quietly serve 404s that look like our own routing bugs.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})

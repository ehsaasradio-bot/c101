import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Compute functions and the registry conformance suite are pure Node —
    // no DOM, no Astro. Playwright covers everything that touches a browser.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})

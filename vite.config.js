import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the same build works both at the domain root (Netlify) and
  // under a sub-path (GitHub Pages: /womens-world-cup-viewer/).
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // Full-app tests under v8 instrumentation brush the default 5s ceiling on a
    // loaded CI runner (mount, several polls, a fake-timer refresh cycle). Give
    // them headroom so a busy runner doesn't flake a passing test.
    testTimeout: 15000,
    // Pin the suite's timezone so any test asserting a day heading ("July 20,
    // 2023"), or what counts as "today", is runner-independent.
    //
    // This edition has no single tournament timezone: the 10 host stadiums span
    // +08:00 (Perth), +09:30 (Adelaide), +10:00 (Sydney/Melbourne/Brisbane) and
    // +12:00 (New Zealand), and each match is stored against its own venue's
    // offset. Sydney was chosen by measurement, not by assumption — it is the
    // venue majority AND the only real host zone under which none of the 64
    // matches changes calendar day (Auckland moves 3, New York moves 7).
    //
    // UTC is day-stable for this data too, which makes the pin easy to delete
    // without noticing on a UTC CI runner — so test/timezone-pinned.test.js
    // asserts it explicitly. Do not remove without making every date-derived
    // assertion pass an explicit tz.
    env: { TZ: 'Australia/Sydney' },
    coverage: {
      provider: 'v8',
      all: true, // count untested files too, so the badge isn't flattered
      // netlify/functions is inside the gate as well as src. The subscription
      // endpoint is real shipped code that a subscriber's calendar hits directly,
      // and it sat outside coverage.include while the badge read 100%.
      include: ['src/**', 'netlify/functions/**'],
      exclude: ['src/main.jsx', 'src/**/*.test.{js,jsx}'],
      reporter: ['text-summary', 'json-summary', 'json'],
      // Enforced gate: the suite (and CI's coverage:badge step) fails if any
      // metric slips below 100%. Genuinely unreachable defensive arms carry an
      // inline `/* v8 ignore next -- why */` with a justification rather than
      // lowering these.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})

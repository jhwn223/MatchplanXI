// vitest/config re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  preview: {
    // allow serving through tunnel hosts (Cloudflare, localhost.run, etc.)
    allowedHosts: true,
  },
  test: {
    // The match calibration suites simulate tens of full 90-minute matches,
    // and the engine now steps the world through every second of match time.
    // A single generous budget here beats scattering per-test timeouts that
    // trip one at a time whenever the machine is busy.
    testTimeout: 120_000,
  },
})

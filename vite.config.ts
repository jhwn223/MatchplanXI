import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/altitude-tactics/',
  plugins: [react()],
  preview: {
    // allow serving through tunnel hosts (Cloudflare, localhost.run, etc.)
    allowedHosts: true,
  },
})

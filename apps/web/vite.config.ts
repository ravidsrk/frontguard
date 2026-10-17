import { defineConfig } from 'vitest/config'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

// TanStack Start (Vite + TanStack Router) configured to run on Cloudflare Workers.
// The tanstackStart() plugin generates src/routeTree.gen.ts on first run.
const isTest = !!process.env.VITEST

export default defineConfig(({ command }) => ({
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000,
    allowedHosts: ['.aq.dev'],
  },
  plugins: [
    ...(isTest || command !== 'build'
      ? []
      : [cloudflare({ viteEnvironment: { name: 'ssr' } })]),
    tanstackStart(),
    viteReact(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}))
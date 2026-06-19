import { defineConfig } from 'vitest/config'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

// TanStack Start (Vite + TanStack Router) configured to run on Cloudflare Workers.
// The tanstackStart() plugin generates src/routeTree.gen.ts on first run.
const isTest = !!process.env.VITEST

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    ...(isTest ? [] : [cloudflare({ viteEnvironment: { name: 'ssr' } })]),
    tanstackStart(),
    viteReact(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
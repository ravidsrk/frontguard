import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

// TanStack Start (Vite + TanStack Router) configured to run on Cloudflare Workers.
// The tanstackStart() plugin generates src/routeTree.gen.ts on first run.
// To run on plain Node instead, remove the cloudflare() plugin and the wrangler
// config — see DEPLOY.md.
export default defineConfig({
  server: { port: 3000 },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
  ],
})

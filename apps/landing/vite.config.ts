import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Emit one static document per route as dist/<route>/index.html (spec §1.4/§1.5),
  // so every route is crawlable and serves without JS at parity with the homepage.
  ssgOptions: {
    dirStyle: 'nested',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});

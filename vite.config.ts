import { defineConfig } from 'vite';

// CSV Doctor — Vite config.
// Pure static SPA, no framework, no plugins needed.
export default defineConfig({
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5174,
    open: true,
  },
});

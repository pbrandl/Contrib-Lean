import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite build` builds the app for the server (build/, served by Apache from ~/html);
// `vite build --mode demo` the demo without a server (build-demo/, turned into one page by
// scripts/demo-inline.py). `vite` serves the app on :3000 and forwards /api to the backend.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  const api = { '/api': process.env.API_TARGET || 'http://localhost:3001' };
  return {
    plugins: [react()],
    base: demo ? './' : '/',
    server: { port: 3000, proxy: api },
    preview: { port: 3000, proxy: api },
    build: {
      outDir: demo ? 'build-demo' : 'build',
      // Members bring older phones too: the syntax works back to Safari 14 (iOS 14).
      target: ['es2020', 'safari14', 'chrome87', 'firefox78', 'edge88'],
      // The demo is one page: one script, images inline. Fonts stay files, the page keeps
      // only the latin ones (scripts/demo-inline.py).
      assetsInlineLimit: demo ? (file) => !file.endsWith('.woff2') : 4096,
      rolldownOptions: demo ? { output: { inlineDynamicImports: true } } : {},
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
    },
  };
});

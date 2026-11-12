import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        // The React runtime is needed by every route, so it gets its own long-lived chunk
        // that survives app redeploys. recharts is deliberately NOT forced into a named
        // chunk: only the lazy report pages import it, so the bundler can keep it in a
        // purely dynamic chunk instead of pulling it into the entry graph.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
})

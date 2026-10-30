import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createLogger, defineConfig } from 'vite'
import path from 'path'

const logger = createLogger()
const originalWarning = logger.warn.bind(logger)
logger.warn = (msg, options) => {
  if (msg.includes('THREE.Clock: This module has been deprecated')) return
  originalWarning(msg, options)
}

export default defineConfig({
  customLogger: logger,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})

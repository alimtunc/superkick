import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readApiPort(): number {
  const portFile = path.resolve(__dirname, '..', '.superkick-port')
  try {
    const content = fs.readFileSync(portFile, 'utf-8').trim()
    const port = Number(content)
    if (Number.isFinite(port) && port > 0) return port
  } catch {
    // Port file missing — API not started yet, fall back to default.
  }
  return 3100
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${readApiPort()}`,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})

import { join } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const isMainExternal = (id: string) =>
  id === 'playwright' ||
  id === 'playwright-core' ||
  id.startsWith('playwright/') ||
  id.startsWith('playwright-core/')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: isMainExternal,
        input: {
          index: join(__dirname, 'src/main/index.ts')
        }
      },
      outDir: 'out/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: join(__dirname, 'src/main/preload.ts')
        }
      },
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: join(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      outDir: join(__dirname, 'out/renderer')
    }
  }
})

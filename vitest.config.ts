import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environmentMatchGlobs: [
      ['tests/unit/renderer/**', 'jsdom'],
      ['tests/unit/main/**', 'node'],
      ['tests/unit/shared/**', 'node']
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    }
  }
})

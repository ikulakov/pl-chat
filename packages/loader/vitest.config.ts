import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@bankchat/protocol': resolve(__dirname, '../protocol/src/index.ts'),
    },
  },
})

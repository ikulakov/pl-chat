import { defineConfig, mergeConfig } from 'vitest/config'
import { resolve } from 'path'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./test.setup.ts'],
      clearMocks: true,
      typecheck: {
        tsconfig: './tsconfig.json',
      },
    },
    resolve: {
      alias: {
        '@bankchat/protocol': resolve(__dirname, '../protocol/src/index.ts'),
      },
    },
  }),
)

import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { loader: 'src/index.ts' },
    format: ['esm'],
    target: 'es2020',
    noExternal: [/@bankchat\/protocol/],
    outExtension: () => ({ js: '.mjs' }),
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { loader: 'src/index.ts' },
    format: ['iife'],
    target: 'es2020',
    noExternal: [/@bankchat\/protocol/],
    outExtension: () => ({ js: '.js' }),
    minify: true,
    sourcemap: true,
  },
])

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/widget',
  server: {
    port: 5174,
    proxy: {
      '/_matrix': 'http://localhost:3001',
      '/_dev': 'http://localhost:3001',
    },
  },
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// По умолчанию — локальный mock; PLCHAT_API_TARGET переключает dev-сервер на живой matrixkc:
// либо проброшенный порт (http://localhost:8080 из minikube), либо внешний URL стенда.
const apiTarget = process.env.PLCHAT_API_TARGET ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  base: '/widget',
  server: {
    port: 5174,
    proxy: {
      '/_matrix': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/_dev': 'http://localhost:3001',
    },
  },
})

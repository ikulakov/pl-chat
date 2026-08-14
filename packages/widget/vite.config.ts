import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// По умолчанию — локальный mock; PLCHAT_API_TARGET переключает dev-сервер на живой matrixkc
// (например, http://localhost:8080 при проброшенном порте из minikube).
const apiTarget = process.env.PLCHAT_API_TARGET ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react()],
  base: '/widget',
  server: {
    port: 5174,
    proxy: {
      '/_matrix': apiTarget,
      '/_dev': 'http://localhost:3001',
    },
  },
})

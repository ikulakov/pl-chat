import { defineConfig } from 'vite'

// Виджет и его API — через dev-сервер виджета (:5174), а тот уже решает, куда слать /_matrix
// (mock или PLCHAT_API_TARGET). Нужно для туннеля на телефон: снаружи виден один origin.
const widgetDevServer = { target: 'http://localhost:5174', changeOrigin: true }

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/widget': { ...widgetDevServer, ws: true },
      '/_matrix': widgetDevServer,
      '/_dev': widgetDevServer,
    },
  },
})

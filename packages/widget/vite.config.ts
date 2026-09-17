import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import sbom from 'rollup-plugin-sbom'
import { defineConfig } from 'vite'

// По умолчанию — локальный mock; PLCHAT_API_TARGET переключает dev-сервер на живой matrixkc:
// либо проброшенный порт (http://localhost:8080 из minikube), либо внешний URL стенда.
const apiTarget = process.env.PLCHAT_API_TARGET ?? 'http://localhost:3001'

// Версию схемы SBOM диктует SCA-инстанция банка: TeamCity кладёт её в SBOM_SCHEMA_VER
// из глобального параметра uib_sbom_schema_ver_latest, локально по умолчанию та же 1.6.
// Rolldown не даёт писать за пределы dist, поэтому файл остаётся в сборочной папке —
// в корень репозитория его перекладывает `pnpm sbom`.
const sbomSchemaVersion = (process.env.SBOM_SCHEMA_VER ?? '1.6') as NonNullable<
  Parameters<typeof sbom>[0]
>['specVersion']

export default defineConfig({
  plugins: [
    react(),
    {
      ...sbom({
        specVersion: sbomSchemaVersion,
        outDir: '.',
        outFilename: 'sbom',
        outFormats: ['json'],
        includeWellKnown: false,
      }),
      // SBOM нужен только в собранном образе — на dev-сервере и в тестах не подключаем.
      apply: 'build',
    },
  ],
  // Абсолютные импорты внутри виджета: @/ — это src/. Алиас обязан совпадать с paths
  // в tsconfig.json и tsconfig.build.json; vitest.config.ts наследует его через mergeConfig.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
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

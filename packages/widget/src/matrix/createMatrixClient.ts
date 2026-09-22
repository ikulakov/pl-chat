import type { ChatRuntimeState, RuntimeAction } from '@/store/state'
import { createMatrixApi } from './api/matrixApi'
import { MatrixTransport } from './api/matrixTransport'
import { MatrixCatalog, type CatalogService } from './catalog/matrixCatalog'
import { MatrixController, type MatrixService } from './matrixController'
import { MatrixMedia, type MediaService } from './media/matrixMedia'
import { LocalStorageSessionStore } from './session/localStorageSessionStore'
import { MatrixSessionManager } from './session/sessionManager'

interface CreateMatrixServiceDeps {
  dispatch: (action: RuntimeAction) => void
  getState: () => ChatRuntimeState
}

/**
 * Клиент homeserver'а: диалог, справочники и медиа. Отдельные объекты, потому что у каталогов и
 * медиа нет ни сессии, ни комнаты, ни поколения жизненного цикла. Медиа при этом общая с
 * диалогом: он заливает через неё файлы и сбрасывает её кэши при смене сессии.
 */
export interface MatrixClient {
  matrix: MatrixService
  catalog: CatalogService
  media: MediaService
}

export function createMatrixClient(deps: CreateMatrixServiceDeps): MatrixClient {
  const sessionStore = new LocalStorageSessionStore()
  const transport = new MatrixTransport(sessionStore)
  const api = createMatrixApi(transport)
  const sessionManager = new MatrixSessionManager(api, sessionStore)
  const media = new MatrixMedia(api)

  return {
    matrix: new MatrixController({
      api,
      media,
      sessionManager,
      dispatch: deps.dispatch,
      getState: deps.getState,
    }),
    catalog: new MatrixCatalog(api),
    media,
  }
}

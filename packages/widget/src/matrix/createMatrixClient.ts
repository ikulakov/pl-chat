import type { ChatRuntimeState, RuntimeAction } from '@/store/state'
import { createMatrixApi } from './api/matrixApi'
import { MatrixTransport } from './api/matrixTransport'
import { MatrixCatalog, type CatalogService } from './catalog/matrixCatalog'
import { MatrixController, type MatrixService } from './matrixController'
import { LocalStorageSessionStore } from './session/localStorageSessionStore'
import { MatrixSessionManager } from './session/sessionManager'

interface CreateMatrixServiceDeps {
  dispatch: (action: RuntimeAction) => void
  getState: () => ChatRuntimeState
}

/**
 * Клиент homeserver'а: диалог и справочники. Два объекта, а не один, потому что делят они
 * ровно `api` — у каталогов нет ни сессии, ни комнаты, ни поколения жизненного цикла.
 */
export interface MatrixClient {
  matrix: MatrixService
  catalog: CatalogService
}

export function createMatrixClient(deps: CreateMatrixServiceDeps): MatrixClient {
  const sessionStore = new LocalStorageSessionStore()
  const transport = new MatrixTransport(sessionStore)
  const api = createMatrixApi(transport)
  const sessionManager = new MatrixSessionManager(api, sessionStore)

  return {
    matrix: new MatrixController({
      api,
      sessionManager,
      dispatch: deps.dispatch,
      getState: deps.getState,
    }),
    catalog: new MatrixCatalog(api),
  }
}

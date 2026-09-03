import type { ChatRuntimeState, RuntimeAction } from '../store/state'
import { createMatrixApi } from './api/matrixApi'
import { MatrixTransport } from './api/matrixTransport'
import { MatrixController, type MatrixService } from './matrixController'
import { LocalStorageSessionStore } from './session/localStorageSessionStore'
import { MatrixSessionManager } from './session/sessionManager'

interface CreateMatrixServiceDeps {
  dispatch: (action: RuntimeAction) => void
  getState: () => ChatRuntimeState
}

export function createMatrixService(deps: CreateMatrixServiceDeps): MatrixService {
  const sessionStore = new LocalStorageSessionStore()
  const transport = new MatrixTransport(sessionStore)
  const api = createMatrixApi(transport)
  const sessionManager = new MatrixSessionManager(api, sessionStore)

  return new MatrixController({
    api,
    sessionManager,
    dispatch: deps.dispatch,
    getState: deps.getState,
  })
}

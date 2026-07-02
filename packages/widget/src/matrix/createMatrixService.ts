import type { ChatRuntimeState, RuntimeAction } from '../store/model'
import { createMatrixApi } from './matrixApi'
import { MatrixController, type MatrixService } from './matrixController'
import { LocalStorageSessionStore } from './session/localStorageSessionStore'
import { MatrixSessionManager } from './session/sessionManager'
import { MatrixTransport } from './transport/matrixTransport'

interface CreateMatrixServiceDeps {
  dispatch: (action: RuntimeAction) => void
  getState: () => ChatRuntimeState
}

const MATRIX_BASE_URL = import.meta.env.VITE_HOMESERVER_URL ?? ''

export function createMatrixService(deps: CreateMatrixServiceDeps): MatrixService {
  const sessionStore = new LocalStorageSessionStore()
  const transport = new MatrixTransport(MATRIX_BASE_URL, sessionStore)
  const api = createMatrixApi(transport)
  const sessionManager = new MatrixSessionManager(api, sessionStore)

  return new MatrixController({
    api,
    sessionManager,
    dispatch: deps.dispatch,
    getState: deps.getState,
  })
}

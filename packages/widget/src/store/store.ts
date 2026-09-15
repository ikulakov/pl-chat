import type { ViewportMode } from '@bankchat/protocol'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { dispatchMiddleware } from '../middleware'
import { INITIAL_RUNTIME_STATE } from './initialState'
import { chatRuntimeReducer } from './reducer'
import type { ChatRuntimeState, RuntimeAction } from './state'

export interface ChatStoreState extends ChatRuntimeState {
  isOpen: boolean
  viewport: ViewportMode
  dispatch: Dispatch
  openPanel: () => void
  closePanel: () => void
  setViewport: (mode: ViewportMode) => void
}

export type Dispatch = (action: RuntimeAction) => void
interface MiddlewareApi {
  getState: () => ChatRuntimeState
}
export type DispatchMiddleware = (api: MiddlewareApi) => (next: Dispatch) => Dispatch

const DEVTOOLS_OPT_IN_KEY = 'plchat.devtools'

/*
 * Zustand здесь контейнер для редьюсера в стиле Redux, а не набор слайсов с методами.
 *
 * - Состояние чата (сессия, комната, лента) меняется только через `dispatch(action)`
 * - Перехватчики `dispatch` (`dispatchMiddleware`) — в `src/middleware/`
 * - Состояние фрейма (`isOpen`, `viewport`) меняется обычными методами zustand
 */
export const chatStore = create<ChatStoreState>()(
  devtools(
    (set, get) => ({
      isOpen: false,
      viewport: 'docked',
      ...INITIAL_RUNTIME_STATE,

      dispatch: buildDispatch(dispatchMiddleware, { getState: get }, (action) =>
        set((state) => chatRuntimeReducer(state, action), false, action),
      ),
      openPanel: () => set({ isOpen: true }, false, 'panel.opened'),
      closePanel: () => set({ isOpen: false }, false, 'panel.closed'),
      setViewport: (mode) => set({ viewport: mode }, false, 'viewport.changed'),
    }),
    { name: 'PLChat', enabled: isDevtoolsEnabled() },
  ),
)

function buildDispatch(
  middleware: DispatchMiddleware[],
  api: MiddlewareApi,
  reduce: Dispatch,
): Dispatch {
  return middleware.reduceRight<Dispatch>((next, mw) => mw(api)(next), reduce)
}

function isDevtoolsEnabled(): boolean {
  if (import.meta.env.DEV) return true

  try {
    return localStorage.getItem(DEVTOOLS_OPT_IN_KEY) === '1'
  } catch {
    return false
  }
}

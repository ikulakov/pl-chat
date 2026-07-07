import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IframeBridge } from './bridge'
import { initChatController } from './chatController'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

const bridge = new IframeBridge()
const controller = initChatController(bridge)

// Standalone dev mode
if (import.meta.env.DEV && window.parent === window) {
  controller.open()
}
// if (import.meta.env.DEV) {
//   const days = [2, 1, 0]
//   const messages = days.flatMap((offset, dayIdx) =>
//     Array.from({ length: 10 }, (_, i) => i).map((i) => ({
//       localId: `m-${dayIdx}-${i}`,
//       eventId: `m-${dayIdx}-${i}`,
//       sender: i % 2 === 0 ? '@operator:bank' : '@guest:bank',
//       body: `Сообщение день -${offset}, №${i}`,
//       ts: Date.now() - offset * 86400000 + i * 60000,
//       pending: false,
//       failed: false,
//     })),
//   )
//   chatStore.setState({
//     phase: 'connected',
//     identity: { userId: '@guest:bank', roomId: '!room:bank' },
//     room: {
//       timeline: [],
//       messages,
//       operator: { id: '@operator:bank', displayName: 'Оператор', isActive: true },
//     },
//   })
// }

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

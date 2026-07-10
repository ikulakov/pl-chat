import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IframeBridge } from './bridge'
import { initChatController } from './chatController'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

const bridge = new IframeBridge()
const controller = initChatController(bridge)

// Standalone dev mode //import.meta.env.DEV &&
if (window.parent === window) {
  controller.open()
}

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IframeBridge } from './bridge'
import { initChatController } from './chatController'
import './styles/global.css'

const bridge = new IframeBridge()
const controller = initChatController(bridge)

// Standalone dev mode
if (import.meta.env.DEV && window.parent === window) {
  controller.handleHostCommand({ type: 'OPEN' })
}

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

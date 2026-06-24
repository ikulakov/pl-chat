import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IframeBridge } from './bridge'
import { initChatStore } from './store'
import './styles/global.css'

const store = initChatStore(new IframeBridge())

// Standalone dev mode
if (import.meta.env.DEV && window.parent === window) {
  store.getState().handleCommand({ type: 'OPEN' })
}

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

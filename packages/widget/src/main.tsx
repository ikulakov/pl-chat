import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { hostBridge } from './bridge'
import { chatStore } from './store/chatStore'
import './styles/variables.css'

hostBridge.connect((cmd) => chatStore.handleCommand(cmd))

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

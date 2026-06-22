import { Activity } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { useChatStore } from './hooks/useChatStore'

const isStandalone = import.meta.env.DEV && window.parent === window

export function App() {
  const { isOpen } = useChatStore()

  return (
    <Activity mode={isOpen || isStandalone ? 'visible' : 'hidden'}>
      <ChatPanel />
    </Activity>
  )
}

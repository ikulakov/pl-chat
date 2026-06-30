import { Activity } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { useChatStore } from './hooks/useChatStore'

export function App() {
  const isOpen = useChatStore((s) => s.isOpen)

  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ChatPanel />
    </Activity>
  )
}

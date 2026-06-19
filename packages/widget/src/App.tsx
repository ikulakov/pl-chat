import { Activity } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { useChatStore } from './hooks/useChatStore'

export function App() {
  const { isOpen, closePanel } = useChatStore()

  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ChatPanel onClose={closePanel} />
    </Activity>
  )
}

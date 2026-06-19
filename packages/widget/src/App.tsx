import { ChatPanel } from './components/ChatPanel'
import { useChatStore } from './hooks/useChatStore'

export function App() {
  const { isOpen, closePanel } = useChatStore()

  if (!isOpen) return null

  return <ChatPanel onClose={closePanel} />
}

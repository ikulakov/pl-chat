import { Activity } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { useChatStore } from './hooks/useChatStore'
import { selectIsOpen } from './store/selectors'

export function App() {
  const isOpen = useChatStore(selectIsOpen)

  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ChatPanel />
    </Activity>
  )
}

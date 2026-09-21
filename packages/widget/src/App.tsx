import { Activity } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { useChatStore } from './hooks/useChatStore'
import { useEmojiIndexBootstrap } from './components/Emoji/useEmojiIndexBootstrap'
import { selectIsOpen } from './store/selectors'

export function App() {
  const isOpen = useChatStore(selectIsOpen)

  useEmojiIndexBootstrap()

  return (
    <Activity mode={isOpen ? 'visible' : 'hidden'}>
      <ChatPanel />
    </Activity>
  )
}

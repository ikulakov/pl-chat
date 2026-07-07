import { formatDateLabel, startOfDay } from '../../shared/formatDate'
import type { ChatMessage } from '../../store/model'
import type { BubblePosition } from './MessageBubble'

interface DayGroup {
  key: string
  label: string
  messages: ChatMessage[]
}

export function groupMessagesByDate(messages: ChatMessage[]): DayGroup[] {
  const groups: DayGroup[] = []

  for (const message of messages) {
    const day = startOfDay(message.ts)
    const key = `date-${day}`
    const lastGroup = groups.at(-1)

    if (lastGroup?.key === key) {
      lastGroup.messages.push(message)
    } else {
      groups.push({ key, label: formatDateLabel(message.ts), messages: [message] })
    }
  }

  return groups
}

export function getPosition(
  prev: ChatMessage | undefined,
  current: ChatMessage,
  next: ChatMessage | undefined,
): BubblePosition {
  const isPrevSame = prev?.sender === current.sender
  const isNextSame = next?.sender === current.sender

  if (!isPrevSame && !isNextSame) return 'single'
  if (!isPrevSame && isNextSame) return 'first'
  if (isPrevSame && isNextSame) return 'middle'
  return 'last'
}

import { isOptimistic } from '@/domain/optimistic'
import { aggregateReactions } from '@/domain/reactions'
import { useChatActions } from '@/hooks/useChatActions'
import { useChatStore } from '@/hooks/useChatStore'
import type { EventId, UserId } from '@/shared/types/ids'
import { selectReactionsFor } from '@/store/selectors'
import { useCallback, useMemo } from 'react'

interface Options {
  eventId: EventId
  userId: UserId
}

export function useMessageReactions({ eventId, userId }: Options) {
  const { toggleReaction } = useChatActions()

  const canReact = !isOptimistic(eventId)

  const entries = useChatStore(selectReactionsFor(eventId))
  const summaries = useMemo(() => aggregateReactions(entries, userId), [entries, userId])

  const toggle = useCallback(
    (key: string) => {
      if (canReact) void toggleReaction(eventId, key)
    },
    [canReact, eventId, toggleReaction],
  )

  return { summaries, canReact, toggle }
}

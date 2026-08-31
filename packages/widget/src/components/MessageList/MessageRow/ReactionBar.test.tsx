import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../../../i18n'
import { ReactionBar } from './ReactionBar'

describe('ReactionBar', () => {
  it('не показывает счётчик единственной реакции — в макете его нет', () => {
    render(
      <ReactionBar
        summaries={[{ key: '👍', count: 1, ownEventId: null }]}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('button')).toHaveTextContent('👍')
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('показывает счётчик, когда реакцию поставил не один участник', () => {
    render(
      <ReactionBar
        summaries={[{ key: '👍', count: 2, ownEventId: '$r1' }]}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('помечает свою реакцию нажатой — снятие идёт тем же кликом', () => {
    render(
      <ReactionBar
        summaries={[
          { key: '👍', count: 1, ownEventId: '$r1' },
          { key: '❤️', count: 1, ownEventId: null },
        ]}
        onToggle={vi.fn()}
      />,
    )

    const [own, foreign] = screen.getAllByRole('button')

    expect(own).toHaveAttribute('aria-pressed', 'true')
    expect(foreign).toHaveAttribute('aria-pressed', 'false')
  })

  it('отдаёт ключ реакции по клику', () => {
    const onToggle = vi.fn()
    render(
      <ReactionBar
        summaries={[{ key: '👍', count: 2, ownEventId: null }]}
        onToggle={onToggle}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: t('chat.reaction.count', { emoji: '👍', count: 2 }) }),
    )

    expect(onToggle).toHaveBeenCalledExactlyOnceWith('👍')
  })
})

import { t } from '@/i18n'
import type { ReactionSummary } from '@/domain/reactions'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReactionPicker } from './ReactionPicker'

function renderPicker(summaries: ReactionSummary[] = []) {
  const onToggle = vi.fn()
  render(
    <ReactionPicker
      summaries={summaries}
      onToggle={onToggle}
    />,
  )
  return onToggle
}

describe('ReactionPicker: фиксированный набор', () => {
  it('показывает шесть заданных реакций', () => {
    renderPicker()
    const buttons = within(screen.getByRole('toolbar')).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(
      ['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => t('chat.reaction.add', { emoji })),
    )
  })

  it.each([false, true])('работает без Dropdown и сообщает выбранную реакцию (своя: %s)', (own) => {
    const onToggle = renderPicker(own ? [{ key: '👍', count: 1, isOwn: true }] : [])
    const button = screen.getByRole('button', {
      name: t(own ? 'chat.reaction.remove' : 'chat.reaction.add', { emoji: '👍' }),
    })
    expect(button).toHaveAttribute('aria-pressed', String(own))
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('👍')
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('имеет одну остановку Tab, переключает фокус стрелками и сохраняет его при возврате', async () => {
    const user = userEvent.setup()
    const onToggle = renderPicker()
    render(<button>{t('chat.action.menu')}</button>)
    const buttons = within(screen.getByRole('toolbar')).getAllByRole('button')

    await user.tab()
    expect(buttons[0]).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(buttons[5]).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(buttons[0]).toHaveFocus()
    await user.keyboard('{End}')
    expect(buttons[5]).toHaveFocus()
    await user.keyboard('{Home}{ArrowRight}')
    expect(buttons[1]).toHaveFocus()
    expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1])
    expect(onToggle).not.toHaveBeenCalled()

    await user.tab()
    expect(screen.getByRole('button', { name: t('chat.action.menu') })).toHaveFocus()
    await user.tab({ shift: true })
    expect(buttons[1]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onToggle).toHaveBeenCalledExactlyOnceWith('❤️')
  })

  it('обновляет остановку Tab при прямом фокусе и работает внутри Shadow DOM', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = host.attachShadow({ mode: 'open' })
    const container = document.createElement('div')
    root.append(container)
    const { unmount } = render(
      <ReactionPicker
        summaries={[]}
        onToggle={vi.fn()}
      />,
      { container },
    )
    const buttons = within(container).getAllByRole('button')

    try {
      act(() => buttons[3]!.focus())
      expect(buttons.map((button) => button.tabIndex)).toEqual([-1, -1, -1, 0, -1, -1])
      fireEvent.keyDown(buttons[3]!, { key: 'ArrowRight' })
      expect(root.activeElement).toBe(buttons[4])
      expect(buttons.map((button) => button.tabIndex)).toEqual([-1, -1, -1, -1, 0, -1])
    } finally {
      unmount()
      host.remove()
    }
  })
})

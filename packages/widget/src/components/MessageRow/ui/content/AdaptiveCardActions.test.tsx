import type { CardAction } from '@/domain/adaptiveCards'
import { adaptiveCardItem } from '@/shared/testUtils/matrixFixtures'
import { chatStore } from '@/store/store'
import { act, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdaptiveCardActions } from './AdaptiveCardActions'

// Диспетчит в НАСТОЯЩИЙ стор — как реальный MatrixController.sendCardAction, а не мок с
// изолированным состоянием: только так воспроизводима гонка "кнопка гаснет до следующего клика".
const sendCardAction = vi.fn((cardEventId: string, action: CardAction) => {
  chatStore.getState().dispatch({ type: 'card.answering', cardEventId, actionId: action.id })
  return Promise.resolve()
})

vi.mock<unknown>(import('@/hooks/useChatActions'), () => ({
  useChatActions: () => ({ sendCardAction }),
}))

describe('AdaptiveCardActions', () => {
  beforeEach(() => {
    sendCardAction.mockClear()
    chatStore.getState().dispatch({ type: 'session.closed' })
  })

  afterEach(() => {
    chatStore.getState().dispatch({ type: 'session.closed' })
  })

  it('деградация (Input.* в карточке) — ничего не рендерит, кнопок нет', () => {
    const { container } = render(
      <AdaptiveCardActions
        item={adaptiveCardItem({
          card: {
            type: 'AdaptiveCard',
            body: [{ type: 'Input.Text', id: 'code' }],
            actions: [{ type: 'Action.Submit', id: 'ok', title: 'Ок' }],
          },
        })}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('рендерит кнопки Action.Submit из карточки', () => {
    render(<AdaptiveCardActions item={adaptiveCardItem()} />)

    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeEnabled()
  })

  it('игнорирует ответы чужой карточки и переключает подписку при смене сообщения', () => {
    const onRender = vi.fn()
    const view = (eventId: '$card' | '$other') => (
      <Profiler
        id="card"
        onRender={onRender}
      >
        <AdaptiveCardActions item={adaptiveCardItem({ eventId })} />
      </Profiler>
    )
    const { rerender } = render(view('$card'))
    onRender.mockClear()

    act(() =>
      chatStore
        .getState()
        .dispatch({ type: 'card.answering', cardEventId: '$other', actionId: 'confirm' }),
    )
    expect(onRender).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeEnabled()

    rerender(view('$other'))
    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeDisabled()
    onRender.mockClear()

    act(() => chatStore.getState().dispatch({ type: 'card.answerFailed', cardEventId: '$other' }))
    expect(onRender).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeEnabled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('двойной клик по кнопке шлёт действие один раз — после первого клика кнопка выключена', async () => {
    const user = userEvent.setup()
    render(<AdaptiveCardActions item={adaptiveCardItem()} />)

    const button = screen.getByRole('button', { name: 'Подтвердить' })
    await user.dblClick(button)

    expect(sendCardAction).toHaveBeenCalledTimes(1)
    expect(sendCardAction).toHaveBeenCalledWith('$card', {
      id: 'confirm',
      title: 'Подтвердить',
      data: { action: 'confirm' },
    })
    expect(button).toBeDisabled()
  })

  it('уже подтверждённый (sent) ответ рендерит кнопки отключёнными без нового клика', () => {
    chatStore
      .getState()
      .dispatch({ type: 'card.answering', cardEventId: '$card', actionId: 'confirm' })
    chatStore.getState().dispatch({ type: 'card.answered', cardEventId: '$card' })

    render(<AdaptiveCardActions item={adaptiveCardItem()} />)

    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeDisabled()
    expect(sendCardAction).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../i18n'
import { ReplyPreview } from './ReplyPreview'

describe('ReplyPreview', () => {
  it('без onClick — статичный блок, не кнопка (оригинал недоступен)', () => {
    render(
      <ReplyPreview
        author="Оля"
        text="вопрос"
      />,
    )

    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('вопрос')).toBeInTheDocument()
  })

  it('с onClick — кнопка, клик делегирует переход к оригиналу', () => {
    const onClick = vi.fn()
    render(
      <ReplyPreview
        author="Оля"
        text="вопрос"
        onClick={onClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: t('chat.reply.goToOriginal') }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

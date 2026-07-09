import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom')
  // eslint-disable-next-line i18next/no-literal-string -- тестовая фикстура, не UI-текст
  return <div>ok</div>
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        {/* eslint-disable-next-line i18next/no-literal-string -- тестовая фикстура, не UI-текст */}
        <div>ok</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('renders fallback instead of crashing when a child throws during render', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()
  })

  it('retry resets local state and lets the subtree render again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    // shouldThrow=false здесь — это лишь новые пропсы дерева после rerender;
    // сам ErrorBoundary не знает причину прошлого краша, он просто даёт дереву
    // ещё одну попытку рендера.
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument()

    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    await user.click(screen.getByRole('button', { name: 'Попробовать снова' }))

    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})

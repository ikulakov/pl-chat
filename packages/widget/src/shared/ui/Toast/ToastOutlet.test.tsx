import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { showToast as ShowToast } from './toastStore'

// Очередь тостов — модульный синглтон; между тестами её сбрасывает перезагрузка модуля.
async function mountOutlet(): Promise<typeof ShowToast> {
  vi.resetModules()
  const { showToast } = await import('./toastStore')
  const { ToastOutlet } = await import('./ToastOutlet')

  render(<ToastOutlet />)

  return showToast
}

describe('ToastOutlet', () => {
  it('оба живых региона висят в DOM, даже когда показывать нечего', async () => {
    await mountOutlet()

    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('ошибку объявляет assertive-регион', async () => {
    const showToast = await mountOutlet()

    act(() => showToast('файл не прошёл проверку', { tone: 'error' }))

    expect(screen.getByRole('alert')).toHaveTextContent('файл не прошёл проверку')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('успешное действие объявляет polite-регион — это тон по умолчанию', async () => {
    const showToast = await mountOutlet()

    act(() => showToast('сообщение скопировано'))

    expect(screen.getByRole('status')).toHaveTextContent('сообщение скопировано')
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })
})

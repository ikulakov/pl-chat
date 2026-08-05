import { describe, expect, it } from 'vitest'
import { MatrixError } from '../api/matrixError'
import { classifyUploadError } from './uploadError'

// Отказ fileguard'а детерминирован — повтор вернёт тот же ответ, поэтому UI предложит
// удалить черновик, а не «Повторить». Всё остальное повторять осмысленно.
describe('classifyUploadError', () => {
  it.each([
    ['M_INVALID_PARAM', 400],
    ['M_TOO_LARGE', 413],
    ['M_FORBIDDEN', 403],
  ])('%s — отказ сервера, повтор не предлагаем', (errcode, status) => {
    expect(classifyUploadError(new MatrixError(errcode, 'no', undefined, status))).toBe('rejected')
  })

  it('деактивированный аккаунт — не отказ файла: 403 приходит из слоя авторизации', () => {
    const err = new MatrixError('M_USER_DEACTIVATED', 'disabled', undefined, 403)

    expect(classifyUploadError(err)).toBe('network')
  })

  it('rate limit отделён от прочих сбоев — сообщение о нём другое', () => {
    const err = new MatrixError('M_LIMIT_EXCEEDED', 'slow down', 5000, 429)

    expect(classifyUploadError(err)).toBe('rateLimited')
  })

  it('обрыв сети (не MatrixError) и 5xx — повторяемые', () => {
    expect(classifyUploadError(new Error('network'))).toBe('network')
    expect(classifyUploadError(null)).toBe('network')
    expect(classifyUploadError(new MatrixError('M_UNKNOWN', 'boom', undefined, 500))).toBe(
      'network',
    )
  })
})

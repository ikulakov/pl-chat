import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatrixError } from '../../matrix/api/matrixError'
import { consoleDev } from './consoleDev'

describe('consoleDev', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('adds the PLChat prefix and preserves the error object in dev', () => {
    vi.stubEnv('DEV', true)
    const error = new Error('request failed')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    consoleDev.error('media download failed', error)

    expect(errorSpy).toHaveBeenCalledWith('[PLChat] media download failed', error)
  })

  it('supports warnings without an error object', () => {
    vi.stubEnv('DEV', true)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    consoleDev.warn('clipboard API unavailable — copy skipped')

    expect(warnSpy).toHaveBeenCalledWith('[PLChat] clipboard API unavailable — copy skipped')
  })

  // Прод-консоль хоста — единственная полевая диагностика виджета, поэтому строка печатается
  // и там. Класс сбоя при этом виден: имя ошибки, код протокола и HTTP-статус — наши значения.
  it('keeps the message and a whitelisted discriminator outside dev', () => {
    vi.stubEnv('DEV', false)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    consoleDev.error('sync error', new MatrixError('M_LIMIT_EXCEEDED', 'Слишком часто', 5000, 429))

    expect(errorSpy).toHaveBeenCalledWith('[PLChat] sync error MatrixError M_LIMIT_EXCEEDED 429')
  })

  // Ключевой инвариант: текст ошибки приходит с сервера и может содержать что угодно.
  it('never leaks the server-supplied error text outside dev', () => {
    vi.stubEnv('DEV', false)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    consoleDev.error(
      'send failed',
      new MatrixError('M_FORBIDDEN', 'Клиент +7 900 не найден', undefined, 403),
    )

    expect(errorSpy).toHaveBeenCalledOnce()
    expect(errorSpy.mock.calls[0]).toHaveLength(1)
    expect(String(errorSpy.mock.calls[0]![0])).not.toContain('+7 900')
  })

  it('never leaks a thrown value that is not an error object', () => {
    vi.stubEnv('DEV', false)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    consoleDev.error('upload failed', 'syt_secret_access_token')

    expect(errorSpy).toHaveBeenCalledWith('[PLChat] upload failed string')
  })
})

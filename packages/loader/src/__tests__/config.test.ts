import { describe, expect, it } from 'vitest'
import { validateConfig, widgetUrl } from '../config'

describe('widgetUrl', () => {
  const parentOrigin = 'https://host.example.com'

  it.each([
    'https://chat.example.com',
    'https://chat.example.com/',
    'https://chat.example.com/widget/',
  ])('uses /widget/ directly without a directory redirect for %s', (chatUrl) => {
    expect(widgetUrl({ chatUrl }, parentOrigin)).toBe(
      'https://chat.example.com/widget/?parentOrigin=https%3A%2F%2Fhost.example.com',
    )
  })

  it('preserves an explicitly configured HTTPS port', () => {
    const url = new URL(widgetUrl({ chatUrl: 'https://chat.example.com:8443' }, parentOrigin))
    expect(url.origin).toBe('https://chat.example.com:8443')
    expect(url.pathname).toBe('/widget/')
    expect(url.searchParams.get('parentOrigin')).toBe(parentOrigin)
  })

  it('preserves HTTP and the port for local development', () => {
    expect(widgetUrl({ chatUrl: 'http://localhost:5174' }, 'http://localhost:5173')).toBe(
      'http://localhost:5174/widget/?parentOrigin=http%3A%2F%2Flocalhost%3A5173',
    )
  })

  it('still rejects insecure remote chatUrl during initialization', () => {
    expect(() => validateConfig({ chatUrl: 'http://chat.example.com:8080' })).toThrow(
      'Plchat: chatUrl must use HTTPS',
    )
  })

  // Хост зовёт init() из нетипизированного JS: опечатка в режиме не должна
  // молча превращаться в дефолт — иначе «почему чат грузится сразу» ищут в бандле.
  it('rejects an unknown preload mode instead of silently falling back to the default', () => {
    expect(() =>
      validateConfig({ chatUrl: 'https://chat.example.com', preload: 'lazy' as never }),
    ).toThrow('preload must be one of idle, eager, on-open')
  })
})

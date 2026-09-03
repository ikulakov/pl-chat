import { describe, expect, it } from 'vitest'
import { isAllowedParentOrigin } from './bridge'

describe('isAllowedParentOrigin', () => {
  it('сам домен банка и любой его поддомен — свои', () => {
    expect(isAllowedParentOrigin('https://otpbank.ru')).toBe(true)
    expect(isAllowedParentOrigin('https://online.otpbank.ru')).toBe(true)
    expect(isAllowedParentOrigin('https://test.online.otpbank.ru')).toBe(true)
  })

  it('похожие домены не проходят', () => {
    // Классические подделки: свой домен с нужным хвостом и своя зона с нужным началом.
    expect(isAllowedParentOrigin('https://otpbank.ru.evil.com')).toBe(false)
    expect(isAllowedParentOrigin('https://evil-otpbank.ru')).toBe(false)
    expect(isAllowedParentOrigin('https://otpbank.ru.com')).toBe(false)
  })

  it('http не проходит даже на своём домене', () => {
    expect(isAllowedParentOrigin('http://otpbank.ru')).toBe(false)
  })

  // В прод-сборке `import.meta.env.DEV` ложно, и хост-демо становится чужим origin'ом.
  it('дев-хост разрешён только в дев-сборке', () => {
    expect(isAllowedParentOrigin('http://localhost:5173')).toBe(import.meta.env.DEV)
  })
})

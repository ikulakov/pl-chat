import { describe, expect, it } from 'vitest'
import { splitLinks } from './linkify'

describe('splitLinks', () => {
  it('текст без ссылок остаётся одним сегментом', () => {
    expect(splitLinks('добрый день, чем помочь?')).toEqual([
      { kind: 'text', text: 'добрый день, чем помочь?' },
    ])
  })

  it('точка предложения не попадает в адрес', () => {
    expect(splitLinks('зайдите на https://bank.ru/help.')).toEqual([
      { kind: 'text', text: 'зайдите на ' },
      { kind: 'link', text: 'https://bank.ru/help', href: 'https://bank.ru/help' },
      { kind: 'text', text: '.' },
    ])
  })

  it('непарная закрывающая скобка отрезается, парная остаётся в адресе', () => {
    expect(splitLinks('(см. https://bank.ru)')[1]).toEqual({
      kind: 'link',
      text: 'https://bank.ru',
      href: 'https://bank.ru',
    })
    expect(splitLinks('https://ru.wikipedia.org/wiki/Ключ_(значение)')[0]).toEqual({
      kind: 'link',
      text: 'https://ru.wikipedia.org/wiki/Ключ_(значение)',
      href: 'https://ru.wikipedia.org/wiki/Ключ_(значение)',
    })
  })

  it('адрес без схемы кликается по https, но показывается как есть', () => {
    expect(splitLinks('www.bank.ru')).toEqual([
      { kind: 'link', text: 'www.bank.ru', href: 'https://www.bank.ru' },
    ])
  })

  it('опасные схемы ссылкой не становятся', () => {
    const text = 'javascript:alert(1) data:text/html,<b>'

    expect(splitLinks(text)).toEqual([{ kind: 'text', text }])
  })

  it('схема без хоста ссылкой не становится', () => {
    expect(splitLinks('пример: https://')).toEqual([{ kind: 'text', text: 'пример: https://' }])
  })

  it('HTML-якорь показывается своей подписью и ведёт на href', () => {
    expect(splitLinks('вот <a href="https://google.com">google</a> держите')).toEqual([
      { kind: 'text', text: 'вот ' },
      { kind: 'link', text: 'google', href: 'https://google.com' },
      { kind: 'text', text: ' держите' },
    ])
  })

  it('сущности в подписи и адресе раскодируются', () => {
    expect(splitLinks('<a href="https://bank.ru/?a=1&amp;b=2">счёт &quot;мой&quot;</a>')).toEqual([
      { kind: 'link', text: 'счёт "мой"', href: 'https://bank.ru/?a=1&b=2' },
    ])
  })

  it('якорь с небезопасной схемой теряет ссылку, но не подпись', () => {
    expect(splitLinks('<a href="javascript:alert(1)">жми сюда</a>')).toEqual([
      { kind: 'text', text: 'жми сюда' },
    ])
  })

  it('схема, спрятанная за числовой сущностью, тоже не проходит', () => {
    expect(splitLinks('<a href="&#106;avascript:alert(1)">жми</a>')).toEqual([
      { kind: 'text', text: 'жми' },
    ])
  })

  it('несколько ссылок в одном сообщении разбираются по отдельности', () => {
    const segments = splitLinks('тут https://a.ru и тут http://b.ru конец')

    expect(segments.filter((segment) => segment.kind === 'link')).toHaveLength(2)
    expect(segments.map((segment) => segment.text).join('')).toBe(
      'тут https://a.ru и тут http://b.ru конец',
    )
  })
})

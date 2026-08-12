import { describe, expect, it } from 'vitest'
import { toEmojiCatalog, toEmojiCategory, toStickerPacks } from './emoji'

describe('toEmojiCatalog', () => {
  it('переносит вкладки со счётчиками, состав остаётся незагруженным', () => {
    const catalog = toEmojiCatalog({
      version: '2026-08-12',
      categories: [{ id: 'smileys', display_name: 'Смайлы и эмоции', count: 162 }],
    })

    expect(catalog.version).toBe('2026-08-12')
    expect(catalog.categories).toEqual([
      { id: 'smileys', title: 'Смайлы и эмоции', count: 162, items: null },
    ])
  })

  it('пустой каталог при выключенной фиче — не ошибка', () => {
    expect(toEmojiCatalog({ version: '', categories: [] }).categories).toEqual([])
  })
})

describe('toEmojiCategory', () => {
  it('собирает силуэт в data-URL', () => {
    const category = toEmojiCategory({
      id: 'smileys',
      display_name: 'Смайлы',
      count: 1,
      emoji: [{ codepoint: '1f600', e: '😀', p: 'iVBORw0KG' }],
    })

    expect(category.items).toEqual([
      { codepoint: '1f600', char: '😀', silhouette: 'data:image/png;base64,iVBORw0KG' },
    ])
  })

  it('позиция без силуэта остаётся без него, а не с битым URL', () => {
    const category = toEmojiCategory({
      id: 'smileys',
      display_name: 'Смайлы',
      count: 1,
      emoji: [{ codepoint: '2764', e: '❤' }],
    })

    expect(category.items?.[0]?.silhouette).toBeNull()
  })

  it('счётчик берётся из фактического состава, а не из поля count', () => {
    // Сервер не отдаёт позицию, у которой не записались байты: доверять count после
    // загрузки нельзя, иначе в сетке навсегда останутся пустые ячейки-заглушки.
    const category = toEmojiCategory({
      id: 'smileys',
      display_name: 'Смайлы',
      count: 162,
      emoji: [{ codepoint: '1f600', e: '😀' }],
    })

    expect(category.count).toBe(1)
  })
})

describe('toStickerPacks', () => {
  it('оставляет media_id для публичного адреса байтов', () => {
    const packs = toStickerPacks({
      packs: [
        {
          id: 'otp-default',
          display_name: 'OTP Bank',
          stickers: [
            {
              id: 'hello',
              body: 'Привет',
              info: { mimetype: 'image/png', w: 256, h: 256 },
              url: 'mxc://otpbank.ru/AbCd',
              media_id: 'AbCd',
            },
          ],
        },
      ],
    })

    expect(packs).toEqual([
      {
        id: 'otp-default',
        title: 'OTP Bank',
        stickers: [{ id: 'hello', body: 'Привет', mediaId: 'AbCd' }],
      },
    ])
  })

  it('выключенная фича — пустой список', () => {
    expect(toStickerPacks({ packs: [] })).toEqual([])
  })
})

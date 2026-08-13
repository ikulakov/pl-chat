import { describe, expect, it } from 'vitest'
import type { StickerWire } from '../wire/emoji'
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

function stickerPacks(...stickers: StickerWire[]) {
  return toStickerPacks({
    packs: [{ id: 'rubi_otp', display_name: 'Rubi OTP', stickers }],
  })
}

function stickerWire(overrides: Partial<StickerWire> = {}): StickerWire {
  return {
    id: '01_1fa77',
    body: '🩷',
    info: { mimetype: 'image/webp', w: 512, h: 512, size: 4096 },
    url: 'mxc://otpbank.ru/AbCdEfGhIjKlMnOpQrStUvWx',
    media_id: 'AbCdEfGhIjKlMnOpQrStUvWx',
    ...overrides,
  }
}

describe('toStickerPacks', () => {
  it('сохраняет url и info: из них собирается content события m.sticker', () => {
    const [pack] = stickerPacks(stickerWire({ p: 'iVBORw0KG' }))

    expect(pack).toEqual({
      id: 'rubi_otp',
      title: 'Rubi OTP',
      stickers: [
        {
          id: '01_1fa77',
          body: '🩷',
          mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx',
          url: 'mxc://otpbank.ru/AbCdEfGhIjKlMnOpQrStUvWx',
          info: { mimetype: 'image/webp', w: 512, h: 512, size: 4096 },
          silhouette: 'data:image/png;base64,iVBORw0KG',
          format: 'image',
        },
      ],
    })
  })

  it('формат выводится из mimetype, а не из адреса — расширения в url нет', () => {
    const formats = [
      'application/json',
      'video/webm',
      'image/webp',
      'image/avif',
      'application/octet-stream',
    ].map((mimetype) => stickerPacks(stickerWire({ info: { mimetype } }))[0]?.stickers[0]?.format)

    // неизвестный растр деградирует в <img>, а не в пустоту
    expect(formats).toEqual(['lottie', 'video', 'image', 'image', 'image'])
  })

  it('позиция без силуэта остаётся без него, а не с битым data-URL', () => {
    expect(stickerPacks(stickerWire())[0]?.stickers[0]?.silhouette).toBeNull()
  })

  it('выключенная фича — пустой список', () => {
    expect(toStickerPacks({ packs: [] })).toEqual([])
  })
})

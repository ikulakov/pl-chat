import { describe, expect, it } from 'vitest'
import { fileItem, stickerItem, textItem } from '../shared/testUtils/matrixFixtures'
import { replyQuoteOf, replyTargetOf } from './reply'

describe('replyQuoteOf', () => {
  it('обычное сообщение цитируется своим текстом', () => {
    expect(replyQuoteOf(textItem({ body: 'вопрос' }))).toEqual({ kind: 'text', text: 'вопрос' })
  })

  it('файл без подписи цитируется именем файла', () => {
    expect(replyQuoteOf(fileItem({ body: '' }))).toEqual({ kind: 'text', text: 'doc.pdf' })
  })

  it('стикер — описание, а не готовая подпись: перевод делается при рендере', () => {
    expect(replyQuoteOf(stickerItem({ body: '🐥' }))).toEqual({
      kind: 'sticker',
      preview: { mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx', body: '🐥', format: 'image' },
    })
  })

  it('стикер без разбираемого mxc всё равно цитируется — без превью', () => {
    expect(replyQuoteOf(stickerItem({ url: '' }))).toEqual({ kind: 'sticker' })
  })

  it('сообщение без текста цитировать нечем', () => {
    expect(replyQuoteOf(textItem({ body: '  ' }))).toBeUndefined()
  })
})

describe('replyTargetOf', () => {
  it('на черновик ответить нельзя: события на сервере ещё нет', () => {
    expect(replyTargetOf(textItem({ eventId: 'optimistic:abc', body: 'вопрос' }))).toBeUndefined()
  })
})

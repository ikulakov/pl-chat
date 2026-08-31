import { describe, expect, it } from 'vitest'
import { t } from '../i18n'
import { fileItem, stickerItem, textItem } from '../shared/testUtils/matrixFixtures'
import { replyStickerOf, replyText } from './reply'

describe('replyText', () => {
  it('обычное сообщение цитируется своим текстом', () => {
    expect(replyText(textItem({ body: 'вопрос' }))).toBe('вопрос')
  })

  it('файл без подписи цитируется именем файла', () => {
    expect(replyText(fileItem({ body: '' }))).toBe('doc.pdf')
  })

  it('стикер цитируется подписью «Стикер», а не своим эмодзи', () => {
    expect(replyText(stickerItem({ body: '🐥' }))).toBe(t('chat.reply.sticker'))
  })
})

describe('replyStickerOf', () => {
  it('у стикера отдаёт данные для отрисовки', () => {
    expect(replyStickerOf(stickerItem({ body: '🐥' }))).toEqual({
      mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx',
      body: '🐥',
      format: 'image',
    })
  })

  it('у не-стикера — ничего', () => {
    expect(replyStickerOf(textItem({ body: 'вопрос' }))).toBeUndefined()
  })

  it('черновик без загруженных байтов не даёт превью: mxc-адреса ещё нет', () => {
    expect(replyStickerOf(stickerItem({ url: '' }))).toBeUndefined()
  })
})

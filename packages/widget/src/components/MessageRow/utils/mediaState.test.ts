import { fileItem, imageItem } from '@/shared/testUtils/matrixFixtures'
import { describe, expect, it } from 'vitest'
import { getMediaState, isMediaMetaHidden } from './mediaState'

describe('isMediaMetaHidden', () => {
  it('прячет время на время отдачи байт — прогресс уже показан на вложении', () => {
    const upload = { file: new File([], 'doc.pdf'), pct: 40 }

    expect(isMediaMetaHidden(fileItem({ sendStatus: 'sending', upload }))).toBe(true)
    // upload снят редьюсером — байты доехали, пошёл PUT /send: время со спиннером уместно
    expect(isMediaMetaHidden(fileItem({ sendStatus: 'sending' }))).toBe(false)
  })

  it('прячет время у сорванной заливки, но не у упавшего /send', () => {
    const failedUpload = imageItem({
      sendStatus: 'failed',
      upload: { file: new File([], 'photo.png'), pct: null, error: 'network' },
    })

    expect(isMediaMetaHidden(failedUpload)).toBe(true)
    // упавший /send диспатчит message.failed без upload — крестик у времени и есть его ошибка
    expect(isMediaMetaHidden(imageItem({ sendStatus: 'failed' }))).toBe(false)
  })
})

describe('getMediaState', () => {
  // Сорванную заливку повторяют или убирают на самом вложении, а повтор /send живёт в меню
  // сообщения — перепутать их значит показать не то действие.
  it('отличает сорванную заливку от упавшего /send', () => {
    const failedUpload = fileItem({
      sendStatus: 'failed',
      upload: { file: new File([], 'doc.pdf'), pct: null, error: 'network' },
    })

    expect(getMediaState(failedUpload, false)).toEqual({ status: 'uploadFailed', retryable: true })
    expect(getMediaState(fileItem({ sendStatus: 'failed' }), false)).toEqual({
      status: 'sendFailed',
    })
  })

  it('показывает отбраковку и при упавшем /send — файл не скачается и после повтора', () => {
    expect(getMediaState(fileItem({ sendStatus: 'failed' }), true)).toEqual({ status: 'rejected' })
  })
})

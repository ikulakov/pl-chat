import { fileItem, imageItem } from '@/shared/testUtils/matrixFixtures'
import { describe, expect, it } from 'vitest'
import { getMediaUploadView } from './mediaUploadView'

describe('getMediaUploadView — isMetaHidden', () => {
  it('прячет время на время отдачи байт — прогресс уже показан на вложении', () => {
    const upload = { file: new File([], 'doc.pdf'), pct: 40 }

    expect(getMediaUploadView(fileItem({ sendStatus: 'sending', upload })).isMetaHidden).toBe(true)
    // upload снят редьюсером — байты доехали, пошёл PUT /send: время со спиннером уместно
    expect(getMediaUploadView(fileItem({ sendStatus: 'sending' })).isMetaHidden).toBe(false)
  })

  it('прячет время у сорванной заливки, но не у упавшего /send', () => {
    const failedUpload = imageItem({
      sendStatus: 'failed',
      upload: { file: new File([], 'photo.png'), pct: null, error: 'network' },
    })

    expect(getMediaUploadView(failedUpload).isMetaHidden).toBe(true)
    // упавший /send диспатчит message.failed без upload — крестик у времени и есть его ошибка
    expect(getMediaUploadView(imageItem({ sendStatus: 'failed' })).isMetaHidden).toBe(false)
  })
})

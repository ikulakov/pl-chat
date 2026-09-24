import { isPreviewableImage, validateFile } from '@/shared/utils/fileValidation'
import { readImageDimensions, type ImageDimensions } from '@/shared/utils/imageDimensions'
import { useCallback, useEffect, useState } from 'react'
import type { FileAttachment, PendingAttachment, SendOptions, SendAttachment } from '../types'

interface PendingState extends PendingAttachment {
  /** декодирование картинки, начатое при выборе; у обычных файлов размеров нет. Нужно только send */
  dimsPromise?: Promise<ImageDimensions | null>
}

export function useAttachmentState(sendFile: SendAttachment): FileAttachment {
  const [pending, setPending] = useState<PendingState | null>(null)

  // Освобождаем object-URL превью при смене вложения и при размонтировании.
  useEffect(() => {
    const url = pending?.previewUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [pending?.previewUrl])

  const pickFile = useCallback((file: File) => {
    const result = validateFile(file)
    const isImage = isPreviewableImage(file)

    setPending({
      file,
      ...(isImage ? { previewUrl: URL.createObjectURL(file) } : {}),
      ...(result.ok ? {} : { error: result.reason }),
      ...(isImage && result.ok ? { dimsPromise: readImageDimensions(file) } : {}),
    })
  }, [])

  const cancel = useCallback(() => setPending(null), [])

  const send = useCallback(
    (options?: SendOptions) => {
      if (!pending || pending.error) return

      const { file, dimsPromise } = pending
      // композер освобождаем сразу, не дожидаясь декодирования
      setPending(null)

      // не картинка
      if (!dimsPromise) {
        void sendFile(file, options)
        return
      }
      void dimsPromise.then((dims) => sendFile(file, { ...options, ...(dims ? { dims } : {}) }))
    },
    [pending, sendFile],
  )

  return {
    pending,
    pickFile,
    cancel,
    send,
  }
}

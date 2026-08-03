import { useCallback, useEffect, useState } from 'react'
import { useChatActions } from '../../hooks/useChatActions'
import { isPreviewableImage, validateFile } from '../../shared/utils/fileValidation'
import { readImageDimensions, type ImageDimensions } from '../../shared/utils/imageDimensions'

export interface PendingAttachment {
  file: File
  previewUrl?: string
  /** отбраковка при выборе (формат, размер): файл виден в композере, но отправить нельзя */
  error?: string
  /** декодирование картинки, начатое при выборе; у обычных файлов размеров нет */
  dimsPromise?: Promise<ImageDimensions | null>
}

export interface FileAttachment {
  pending: PendingAttachment | null
  pickFile: (file: File) => void
  cancel: () => void
  send: (options?: SendOptions) => void
}

interface SendOptions {
  caption?: string | undefined
  replyToEventId?: string | undefined
}

export function useAttachmentState(): FileAttachment {
  const [pending, setPending] = useState<PendingAttachment | null>(null)
  const { sendFile } = useChatActions()

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
      ...(result.ok ? {} : { error: result.message }),
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

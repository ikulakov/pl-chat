import { useCallback, useEffect, useState } from 'react'
import { useChatActions } from '../../hooks/useChatActions'
import { isPreviewableImage, validateFile } from '../../shared/utils/fileValidation'

export interface PendingAttachment {
  file: File
  previewUrl?: string
  /** отбраковка при выборе (формат, размер): файл виден в композере, но отправить нельзя */
  error?: string
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

    setPending({
      file,
      ...(isPreviewableImage(file) ? { previewUrl: URL.createObjectURL(file) } : {}),
      ...(result.ok ? {} : { error: result.message }),
    })
  }, [])

  const cancel = useCallback(() => setPending(null), [])

  const send = useCallback(
    (options?: SendOptions) => {
      if (!pending || pending.error) return

      void sendFile(pending.file, options)
      setPending(null)
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

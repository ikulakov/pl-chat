import { useCallback, useState } from 'react'
import type { MediaTimelineItem } from '../domain/timeline'
import { downloadBlob } from '../shared/utils/downloadBlob'
import { useChatActions } from './useChatActions'

interface MediaDownload {
  download: () => void
  isLoading: boolean
}

export function useMediaDownload(item: MediaTimelineItem): MediaDownload {
  const { downloadFile } = useChatActions()
  const [isLoading, setIsLoading] = useState(false)

  const { url, filename } = item.content

  const download = useCallback(() => {
    if (!url || isLoading) return

    setIsLoading(true)
    downloadFile(url)
      .then((blob) => downloadBlob(blob, filename))
      .catch((err: unknown) => console.error('[PLChat] media download failed:', err))
      .finally(() => setIsLoading(false))
  }, [url, filename, isLoading, downloadFile])

  return { download, isLoading }
}

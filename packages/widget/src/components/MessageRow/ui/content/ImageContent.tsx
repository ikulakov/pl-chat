import type { ImageTimelineItem } from '@/domain/timeline'
import { useChatActions } from '@/hooks/useChatActions'
import { useMediaDownload } from '../../hooks/useMediaDownload'
import { getMediaUploadView } from '../../utils/mediaUploadView'
import { MediaImage } from './MediaImage'

interface Props {
  item: ImageTimelineItem
}

/**
 * Кадр картинки с действиями заливки и скачивания. Без подписи он стоит сам по себе
 * (`UnboxedLayout`, время — пилюлей на кадре), с подписью — верх пузыря (`BubbleLayout`
 * со слотом `media`), а подпись и время под ним рисует ряд.
 */
export function ImageContent({ item }: Props) {
  const { cancelUpload, resendMessage } = useChatActions()
  const { download, isLoading } = useMediaDownload(item)
  const { uploadPct, failure } = getMediaUploadView(item)

  return (
    <MediaImage
      item={item}
      pct={uploadPct}
      busy={isLoading}
      failure={failure}
      onDownload={download}
      onCancel={() => cancelUpload(item.localId)}
      onRetry={() => resendMessage(item.localId)}
    />
  )
}

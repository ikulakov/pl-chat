import type { ImageTimelineItem } from '@/domain/timeline'
import { useChatActions } from '@/hooks/useChatActions'
import { useMediaDownload } from '../../hooks/useMediaDownload'
import { getMediaUploadView } from '../../utils/mediaUploadView'
import styles from './ImageContent.module.css'
import { MediaCaption } from './MediaCaption'
import { MediaImage } from './MediaImage'

interface Props {
  item: ImageTimelineItem
}

/**
 * Картинка в ленте — без плашки пузыря: кадр сам по себе прямоугольный и непрозрачный, и
 * тёмная рамка вокруг него ничего не отделяет, а только утяжеляет. Так же ведут себя стикер
 * и «большое эмодзи». Время — пилюля оболочки `UnboxedLayout`.
 */
export function ImageContent({ item }: Props) {
  const { cancelUpload, resendMessage } = useChatActions()
  const { download, isLoading } = useMediaDownload(item)
  const { uploadPct, failure } = getMediaUploadView(item)

  const { body } = item.content

  return (
    <div className={styles.content}>
      <MediaImage
        item={item}
        pct={uploadPct}
        busy={isLoading}
        failure={failure}
        onDownload={download}
        onCancel={() => cancelUpload(item.localId)}
        onRetry={() => resendMessage(item.localId)}
      />

      {body.length > 0 && <MediaCaption body={body} />}
    </div>
  )
}

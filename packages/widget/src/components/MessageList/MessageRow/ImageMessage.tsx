import type { ReactNode } from 'react'
import type { ImageTimelineItem } from '../../../domain/timeline'
import { useChatActions } from '../../../hooks/useChatActions'
import { useMediaDownload } from '../../../hooks/useMediaDownload'
import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './ImageMessage.module.css'
import { MediaCaption } from './MediaCaption'
import { MediaImage } from './MediaImage'
import { useMediaUploadView } from './useMediaUploadView'

interface Props {
  item: ImageTimelineItem
  meta: BubbleMetaData
  /** Цитата и реакции приходят слотами: пузыря, который держал бы их, у картинки нет. */
  reply?: ReactNode
  reactions?: ReactNode
}

/**
 * Картинка в ленте — без плашки пузыря: кадр сам по себе прямоугольный и непрозрачный, и
 * тёмная рамка вокруг него ничего не отделяет, а только утяжеляет. Так же ведут себя стикер
 * и «большое эмодзи».
 *
 * Без подписи время висит пилюлей поверх правого нижнего угла кадра; с подписью — уходит в её
 * последнюю строку под кадром, потому что на самой картинке текст читать негде.
 */
export function ImageMessage({ item, meta, reply, reactions }: Props) {
  const { cancelUpload, resendMessage } = useChatActions()
  const { download, isLoading } = useMediaDownload(item)
  const { uploadPct, failure, isStatusHidden } = useMediaUploadView(item)

  const { body } = item.content
  const hasCaption = body.length > 0

  return (
    <div className={styles.wrap}>
      {reply}

      <div className={styles.frame}>
        <MediaImage
          item={item}
          pct={uploadPct}
          busy={isLoading}
          failure={failure}
          onDownload={download}
          onCancel={() => cancelUpload(item.localId)}
          onRetry={() => resendMessage(item.localId)}
        />

        {!hasCaption && (
          <span className={styles.meta}>
            <BubbleMeta
              {...meta}
              isStatusHidden={isStatusHidden}
            />
          </span>
        )}
      </div>

      {hasCaption && (
        <MediaCaption
          body={body}
          meta={meta}
          isStatusHidden={isStatusHidden}
        />
      )}

      {reactions}
    </div>
  )
}

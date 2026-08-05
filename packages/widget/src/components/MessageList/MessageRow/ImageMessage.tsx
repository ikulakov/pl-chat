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
}

export function ImageMessage({ item, meta }: Props) {
  const { cancelUpload, resendMessage } = useChatActions()
  const { download, isLoading } = useMediaDownload(item)
  const { uploadPct, failure, isStatusHidden } = useMediaUploadView(item)

  const { body } = item.content

  return (
    <div className={styles.wrap}>
      <MediaImage
        item={item}
        pct={uploadPct}
        busy={isLoading}
        failure={failure}
        onDownload={download}
        onCancel={() => cancelUpload(item.localId)}
        onRetry={() => resendMessage(item.localId)}
      />
      {body.length > 0 ? (
        <MediaCaption
          body={body}
          meta={meta}
          isStatusHidden={isStatusHidden}
        />
      ) : (
        <BubbleMeta
          {...meta}
          isStatusHidden={isStatusHidden}
        />
      )}
    </div>
  )
}

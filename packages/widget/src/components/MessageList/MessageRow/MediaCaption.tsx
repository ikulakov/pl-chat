import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './MediaCaption.module.css'

interface Props {
  body: string
  meta: BubbleMetaData
  isStatusHidden: boolean
}

/**
 * Подпись к вложению. Время и статус живут внутри неё: подпись — последняя строка бабла,
 * и мета обязана обтекать её текст, а не висеть отдельной строкой под ним.
 */
export function MediaCaption({ body, meta, isStatusHidden }: Props) {
  return (
    <p className={styles.caption}>
      {body}
      <BubbleMeta
        {...meta}
        isStatusHidden={isStatusHidden}
      />
    </p>
  )
}

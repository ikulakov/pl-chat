import { EmojiText } from '../../Emoji/EmojiText'
import { BubbleMeta, type BubbleMetaData } from './BubbleMeta'
import styles from './TextContent.module.css'

interface Props {
  text: string
  meta: BubbleMetaData
}

export function TextContent({ text, meta }: Props) {
  return (
    <p className={styles.text}>
      <EmojiText text={text} />
      <BubbleMeta {...meta} />
    </p>
  )
}

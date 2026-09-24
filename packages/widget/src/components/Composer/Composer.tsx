import { useChatActions } from '@/hooks/useChatActions'
import { useChatStore } from '@/hooks/useChatStore'
import { t } from '@/i18n'
import { FEATURES } from '@/shared/constants/features'
import { IconButton } from '@/shared/ui/IconButton'
import { FailedIcon, SendIcon } from '@/shared/ui/icons'
import { cn } from '@/shared/utils/cn'
import { selectReplyTarget, selectUserId } from '@/store/selectors'
import { useEffect, useRef, useState } from 'react'
import { AttachmentPreview, FilePickerButton, useAttachment } from '../Attachment'
import { EmojiPickerButton } from '../Emoji'
import styles from './Composer.module.css'
import { MessageTextarea } from './MessageTextarea'
import { ReplyBanner } from './ReplyBanner'

export const MAX_MESSAGE_LENGTH = 2048

export function Composer() {
  const [text, setText] = useState('')

  const { sendMessage, cancelReply } = useChatActions()
  const attachment = useAttachment()
  const replyTarget = useChatStore(selectReplyTarget)
  const userId = useChatStore(selectUserId)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // фокус в поле ввода при выборе "Ответить" в ленте
  useEffect(() => {
    if (replyTarget) textareaRef.current?.focus()
  }, [replyTarget])

  const trimmed = text.trim()
  const charsOverLimit = trimmed.length - MAX_MESSAGE_LENGTH
  const isTooLong = charsOverLimit > 0
  const hasContent = trimmed.length > 0 || attachment.pending !== null

  const canSend = hasContent && !isTooLong && !attachment.pending?.error

  /**
   * Вставка эмодзи по каретке, а не в конец: пользователь мог поставить курсор в середину
   * набранного текста. Выделение при этом заменяется — как при обычном вводе.
   */
  function insertEmoji(char: string) {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.focus()
    textarea.setRangeText(char, textarea.selectionStart, textarea.selectionEnd, 'end')
    setText(textarea.value)
  }

  function submit() {
    if (!canSend) return

    setText('')
    if (attachment.pending) {
      attachment.send({ caption: trimmed, replyToEventId: replyTarget?.eventId })
    } else {
      void sendMessage(trimmed, replyTarget?.eventId)
    }
  }

  return (
    <div className={styles.wrap}>
      {attachment.pending && (
        <AttachmentPreview
          pending={attachment.pending}
          onCancel={attachment.cancel}
        />
      )}

      {replyTarget && (
        <ReplyBanner
          target={replyTarget}
          userId={userId}
          onCancel={cancelReply}
        />
      )}

      <div className={cn(styles.field, isTooLong && styles.error)}>
        <div className={styles.slot}>
          <FilePickerButton />
        </div>
        <div
          className={styles.inputArea}
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return

            event.preventDefault()
            textareaRef.current?.focus()
          }}
        >
          <MessageTextarea
            ref={textareaRef}
            value={text}
            placeholder={t('input.placeholder')}
            onChange={setText}
            onSubmit={submit}
            onEscape={replyTarget ? cancelReply : undefined}
          />
        </div>
        {FEATURES.emoji && (
          <div className={styles.slot}>
            <EmojiPickerButton onSelectEmoji={insertEmoji} />
          </div>
        )}
        <div className={styles.slot}>
          <IconButton
            variant="contrast"
            className={styles.sendBtn}
            aria-label={t('input.send')}
            onClick={submit}
            disabled={!canSend}
          >
            <SendIcon />
          </IconButton>
        </div>
      </div>

      {isTooLong && (
        <p
          className={styles.limitError}
          role="alert"
        >
          <FailedIcon />
          {t('composer.tooLong', { count: charsOverLimit })}
        </p>
      )}
    </div>
  )
}

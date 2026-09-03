import { useEffect, useRef, useState } from 'react'
import { replyAuthorLabel } from '../../domain/reply'
import { FEATURES } from '../../features'
import { useChatActions } from '../../hooks/useChatActions'
import { useChatStore } from '../../hooks/useChatStore'
import { t } from '../../i18n'
import { IconButton } from '../../shared/ui/IconButton'
import { CloseIcon, FailedIcon, SendIcon } from '../../shared/ui/icons'
import { cn } from '../../shared/utils/cn'
import { selectReplyTarget, selectUserId } from '../../store/selectors'
import { useAttachment } from '../Attachment/AttachmentContext'
import { ReplyPreview } from '../ReplyPreview'
import { AttachmentPreview } from './AttachmentPreview'
import styles from './Composer.module.css'
import { EmojiPickerButton } from './EmojiPicker/EmojiPickerButton'
import { FilePickerButton } from './FilePickerButton'
import { MAX_MESSAGE_LENGTH, MessageTextarea } from './MessageTextarea'

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
  // файл прикреплён и прошёл валидацию — второй пока нельзя выбрать
  const hasValidAttachment = attachment.pending !== null && !attachment.pending.error

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
        <div className={styles.replyRow}>
          <div className={styles.replyPreview}>
            <ReplyPreview
              author={replyAuthorLabel(replyTarget.sender, userId)}
              text={replyTarget.body}
              sticker={replyTarget.sticker}
            />
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('chat.reply.cancel')}
            onClick={cancelReply}
          >
            <CloseIcon size={16} />
          </IconButton>
        </div>
      )}

      <div className={cn(styles.field, isTooLong && styles.error)}>
        <div className={styles.main}>
          <FilePickerButton
            disabled={hasValidAttachment}
            onFileSelect={attachment.pickFile}
          />
          <MessageTextarea
            ref={textareaRef}
            value={text}
            placeholder={t('input.placeholder')}
            onChange={setText}
            onSubmit={submit}
            onEscape={replyTarget ? cancelReply : undefined}
          />
        </div>
        <div className={styles.rightBtns}>
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

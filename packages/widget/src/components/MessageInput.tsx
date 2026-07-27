import { useEffect, useRef, useState } from 'react'
import { quoteAuthorLabel } from '../domain/quote'
import { useChatActions } from '../hooks/useChatActions'
import { useChatStore } from '../hooks/useChatStore'
import { t } from '../i18n'
import { IconButton } from '../shared/ui/IconButton'
import { AttachIcon, CloseIcon, SendIcon } from '../shared/ui/icons'
import { selectOperatorName, selectReplyTarget, selectUserId } from '../store/selectors'
import styles from './MessageInput.module.css'
import { QuotedMessage } from './QuotedMessage'

interface Props {
  placeholder?: string
}

const LINE_HEIGHT = 20
const MAX_LINES = 10
const MAX_TEXTAREA_HEIGHT = LINE_HEIGHT * MAX_LINES

function resize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  const scrolled = el.scrollHeight > MAX_TEXTAREA_HEIGHT
  el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px'
  el.style.overflowY = scrolled ? 'auto' : 'hidden'
  if (scrolled) {
    el.scrollTop = el.scrollHeight - el.clientHeight
  }
}

export function MessageInput({ placeholder = t('input.placeholder') }: Props) {
  const [hasText, setHasText] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { sendMessage, cancelReply } = useChatActions()

  const replyTarget = useChatStore(selectReplyTarget)
  const userId = useChatStore(selectUserId)
  const operatorName = useChatStore(selectOperatorName)

  useEffect(() => {
    if (replyTarget) textareaRef.current?.focus()
  }, [replyTarget])

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    resize(el)
    setHasText(el.value.trim().length > 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === 'Escape' && replyTarget) {
      e.preventDefault()
      cancelReply()
    }
  }

  function submit() {
    const el = textareaRef.current
    if (!el) return
    const text = el.value.trim()
    if (!text) return

    el.value = ''
    resize(el)
    setHasText(false)

    void sendMessage(text, replyTarget?.eventId)
  }

  return (
    <div className={styles.wrap}>
      {replyTarget && (
        <div className={styles.replyRow}>
          <div className={styles.replyPreview}>
            <QuotedMessage
              author={quoteAuthorLabel(replyTarget.sender, userId, operatorName)}
              text={replyTarget.body}
            />
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('chat.reply.cancel')}
            onClick={cancelReply}
          >
            <CloseIcon size={18} />
          </IconButton>
        </div>
      )}

      <div className={styles.field}>
        <div className={styles.main}>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('input.attachFile')}
          >
            <AttachIcon />
          </IconButton>
          <textarea
            ref={textareaRef}
            className={styles.input}
            placeholder={placeholder}
            aria-label={placeholder}
            rows={1}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className={styles.rightBtns}>
          <div className={styles.slot}>
            <IconButton
              variant="contrast"
              className={styles.sendBtn}
              aria-label={t('input.send')}
              onClick={submit}
              disabled={!hasText}
            >
              <SendIcon />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

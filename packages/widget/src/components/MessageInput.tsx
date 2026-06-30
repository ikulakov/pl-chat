import { useRef, useState } from 'react'
import { useChatActions } from '../hooks/useChatActions'
import { t } from '../i18n'
import { AttachIcon, SendIcon } from './icons'
import styles from './MessageInput.module.css'

interface Props {
  placeholder?: string
}

const LINE_HEIGHT = 20
const MAX_LINES = 7
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
  const { sendMessage } = useChatActions()

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    resize(el)
    setHasText(el.value.trim().length > 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
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

    void sendMessage(text)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.field}>
        <button
          className={styles.attachBtn}
          aria-label={t('input.attachFile')}
        >
          <AttachIcon />
        </button>
        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.rightBtns}>
          {/* <button
            className={styles.iconBtn}
            aria-label={t('input.stickers')}
          >
            <StickerIcon />
          </button> */}
          {hasText && (
            <button
              className={styles.sendBtn}
              aria-label={t('input.send')}
              onClick={submit}
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

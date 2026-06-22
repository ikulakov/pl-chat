import { useState } from 'react'
import { AttachIcon, SendIcon, StickerIcon } from './icons'
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

export function MessageInput({ placeholder = 'Сообщение…' }: Props) {
  const [hasText, setHasText] = useState(false)

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    resize(el)
    setHasText(el.value.trim().length > 0)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.field}>
        <button
          className={styles.attachBtn}
          aria-label="Прикрепить файл"
        >
          <AttachIcon />
        </button>
        <textarea
          className={styles.input}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={1}
          onChange={handleInput}
        />
        <div className={styles.rightBtns}>
          <button
            className={styles.iconBtn}
            aria-label="Смайлы и стикеры"
          >
            <StickerIcon />
          </button>
          {hasText && (
            <button
              className={styles.sendBtn}
              aria-label="Отправить"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

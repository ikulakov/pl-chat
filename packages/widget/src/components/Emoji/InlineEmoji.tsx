import { useEmojiBitmap } from '../../hooks/useEmojiBitmap'
import styles from './Emoji.module.css'

interface Props {
  char: string
  codepoint: string
}

/**
 * Эмодзи размером со строчную букву. Анимации здесь нет намеренно: десятки плееров в ленте
 * стоят дороже, чем выглядят, — крутится только «большое эмодзи».
 */
export function InlineEmoji({ char, codepoint }: Props) {
  const src = useEmojiBitmap(codepoint, 64)

  // Пока кадра нет — сам символ шрифтом: та же ширина, строка не прыгает при подмене.
  if (!src) return <span className={styles.placeholder}>{char}</span>

  return (
    <img
      className={styles.inline}
      src={src}
      // alt — не только доступность: при копировании текста браузер подставит символ.
      alt={char}
      draggable={false}
    />
  )
}

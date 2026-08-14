import type { EmojiCategory } from '../../../domain/emoji'
import { t } from '../../../i18n'
import { cn } from '../../../shared/utils/cn'
import styles from './EmojiPicker.module.css'

/**
 * Значок вкладки. Идентификаторы категорий приходят с сервера и повторяют стандартные группы
 * Unicode, поэтому таблица стабильна; для незнакомой категории берём её первое эмодзи, а если
 * состав ещё не догружен — нейтральную звёздочку.
 */
const ICONS: Record<string, string> = {
  smileys: '😀',
  people: '👋',
  animals: '🐶',
  food: '🍔',
  travel: '🚗',
  activities: '⚽',
  objects: '💡',
  symbols: '❤️',
  flags: '🏁',
}

const FALLBACK_ICON = '⭐'

interface Props {
  categories: EmojiCategory[]
  activeId: string | null
  onSelect: (categoryId: string) => void
}

/**
 * Быстрый переход по категориям — полоска значков под вкладками, как в мессенджерах.
 *
 * Не `tablist`: панель не подменяет содержимое, а перематывает единую ленту, и вторая
 * ролевая группа вкладок внутри уже существующей сбивала бы навигацию с клавиатуры.
 * Текущая категория помечается `aria-current`.
 */
export function CategoryBar({ categories, activeId, onSelect }: Props) {
  if (categories.length < 2) return null

  return (
    <div
      role="toolbar"
      aria-label={t('picker.categories')}
      className={styles.categoryBar}
    >
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={cn(styles.categoryButton, category.id === activeId && styles.categoryActive)}
          aria-label={category.title}
          title={category.title}
          {...(category.id === activeId ? { 'aria-current': true } : {})}
          onClick={() => onSelect(category.id)}
        >
          <span aria-hidden>
            {ICONS[category.id] ?? category.items?.[0]?.char ?? FALLBACK_ICON}
          </span>
        </button>
      ))}
    </div>
  )
}

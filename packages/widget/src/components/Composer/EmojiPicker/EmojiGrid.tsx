import { useRef } from 'react'
import type { EmojiCategory } from '../../../domain/emoji'
import { useIntersectionObserver } from '../../../hooks/useIntersectionObserver'
import type { LottieCache } from '../../../shared/lottie/lottieCache'
import { EmojiCell } from './EmojiCell'
import styles from './EmojiPicker.module.css'

interface Props {
  categories: EmojiCategory[]
  version: string
  cache: LottieCache
  onLoadCategory: (categoryId: string) => void
  onSelect: (char: string) => void
}

/**
 * Одна непрерывная прокрутка по всем категориям — отдельной ленты вкладок в макете нет.
 * Виртуализации нет намеренно: 580 кнопок DOM держит спокойно, дорог только canvas,
 * а его заводят лишь видимые ячейки.
 */
export function EmojiGrid({ categories, version, cache, onLoadCategory, onSelect }: Props) {
  return (
    <div className={styles.grid}>
      {categories.map((category) => (
        <CategorySection
          key={category.id}
          category={category}
          version={version}
          cache={cache}
          onLoadCategory={onLoadCategory}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

interface SectionProps {
  category: EmojiCategory
  version: string
  cache: LottieCache
  onLoadCategory: (categoryId: string) => void
  onSelect: (char: string) => void
}

function CategorySection({ category, version, cache, onLoadCategory, onSelect }: SectionProps) {
  if (category.items === null) {
    return (
      <PendingSection
        category={category}
        onLoadCategory={onLoadCategory}
      />
    )
  }

  return category.items.map((item) => (
    <EmojiCell
      key={item.codepoint}
      item={item}
      version={version}
      cache={cache}
      onSelect={onSelect}
    />
  ))
}

/**
 * Незагруженная секция занимает место по счётчику из каталога: сетка не «прыгает», а
 * скроллбар не скачет по мере догрузки.
 *
 * Наблюдаем первую ячейку-заглушку, а не отдельный сентинел: в плоской сетке отдельному
 * элементу пришлось бы задавать нулевую высоту, чтобы он не занимал ячейку, а цель нулевой
 * площади — это ровно тот пограничный случай `IntersectionObserver`, на который лучше не
 * закладываться. Ячейка 36×36 наблюдается однозначно и не добавляет лишнего узла.
 */
function PendingSection({
  category,
  onLoadCategory,
}: {
  category: EmojiCategory
  onLoadCategory: (categoryId: string) => void
}) {
  const firstCellRef = useRef<HTMLDivElement>(null)

  useIntersectionObserver({
    triggerRef: firstCellRef,
    callback: (entry) => {
      if (entry.isIntersecting) onLoadCategory(category.id)
    },
    // Состав запрашиваем заранее — иначе пользователь доскроллит до пустого места.
    rootMargin: '200px',
  })

  return Array.from({ length: category.count }, (_, i) => (
    <div
      key={i}
      ref={i === 0 ? firstCellRef : undefined}
      className={styles.cell}
    />
  ))
}

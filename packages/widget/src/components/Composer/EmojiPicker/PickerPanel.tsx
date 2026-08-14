import { useId, useMemo, useRef, useState } from 'react'
import type { EmojiCategory } from '../../../domain/emoji'
import { useChatActions } from '../../../hooks/useChatActions'
import { t } from '../../../i18n'
import { getAnimationCache } from '../../../shared/lottie/animationCache'
import { CategoryBar } from './CategoryBar'
import { EmojiGrid } from './EmojiGrid'
import styles from './EmojiPicker.module.css'
import { PickerTabs, type PickerTab } from './PickerTabs'
import { StickerGrid } from './StickerGrid'
import { useCategoryNav } from './useCategoryNav'
import { useEmojiCatalog } from './useEmojiCatalog'

interface Props {
  ref: React.RefObject<HTMLDivElement | null>
  onSelectEmoji: (char: string) => void
  onStickerSent: () => void
}

export function PickerPanel({ ref, onSelectEmoji, onStickerSent }: Props) {
  const [tab, setTab] = useState<PickerTab>('emoji')
  const { loadEmojiAnimation } = useChatActions()
  const cache = useMemo(() => getAnimationCache('emoji', loadEmojiAnimation), [loadEmojiAnimation])

  const { state, loadCategory, retry } = useEmojiCatalog()

  const id = useId()
  const tabId = (name: PickerTab) => `${id}-tab-${name}`
  const panelId = (name: PickerTab) => `${id}-panel-${name}`

  // Скроллящийся контейнер сетки. Он же root для IntersectionObserver: `rootMargin` расширяет
  // только прямоугольник root'а и никак не влияет на промежуточный прямоугольник обрезки,
  // поэтому с root по умолчанию (вьюпорт) упреждающая загрузка не работала бы вовсе — цели
  // обрезаны этим контейнером раньше, чем попадут во вьюпорт.
  const scrollRef = useRef<HTMLDivElement>(null)

  const categories = state.status === 'ready' ? state.catalog.categories : EMPTY_CATEGORIES
  const categoryIds = useMemo(() => categories.map((category) => category.id), [categories])
  const { activeId, registerSection, scrollTo } = useCategoryNav(scrollRef, categoryIds)

  return (
    <div
      ref={ref}
      className={styles.panel}
      aria-label={t('picker.list')}
    >
      <PickerTabs
        active={tab}
        tabId={tabId}
        panelId={panelId}
        onChange={setTab}
      />

      {tab === 'emoji' && (
        <CategoryBar
          categories={categories}
          activeId={activeId}
          onSelect={scrollTo}
        />
      )}

      <div
        ref={scrollRef}
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        className={styles.scroll}
      >
        {tab === 'stickers' ? (
          <StickerGrid
            scrollRef={scrollRef}
            onStickerSent={onStickerSent}
          />
        ) : (
          <EmojiContent
            state={state}
            cache={cache}
            scrollRef={scrollRef}
            registerSection={registerSection}
            onLoadCategory={loadCategory}
            onSelect={onSelectEmoji}
            onRetry={retry}
          />
        )}
      </div>
    </div>
  )
}

/** Стабильная ссылка: пустой литерал в рендере сбрасывал бы мемоизацию списка категорий. */
const EMPTY_CATEGORIES: EmojiCategory[] = []

interface EmojiContentProps {
  state: ReturnType<typeof useEmojiCatalog>['state']
  cache: ReturnType<typeof getAnimationCache>
  scrollRef: React.RefObject<HTMLDivElement | null>
  registerSection: (categoryId: string, node: HTMLElement | null) => void
  onLoadCategory: (categoryId: string) => void
  onSelect: (char: string) => void
  onRetry: () => void
}

function EmojiContent({
  state,
  cache,
  scrollRef,
  registerSection,
  onLoadCategory,
  onSelect,
  onRetry,
}: EmojiContentProps) {
  if (state.status === 'loading') return <p className={styles.message}>{t('status.loading')}</p>

  if (state.status === 'error') {
    return (
      <p className={styles.message}>
        {t('picker.loadFailed')}{' '}
        <button
          type="button"
          className={styles.retry}
          onClick={onRetry}
        >
          {t('picker.retry')}
        </button>
      </p>
    )
  }

  // Пустой каталог — это выключенная на бэкенде фича (`matrixkc.emoji.enabled=false`):
  // сервер отдаёт пустые списки, а не 403, и вкладке нечего показать.
  if (state.catalog.categories.length === 0) {
    return <p className={styles.message}>{t('picker.empty')}</p>
  }

  return (
    <EmojiGrid
      categories={state.catalog.categories}
      version={state.catalog.version}
      cache={cache}
      scrollRef={scrollRef}
      registerSection={registerSection}
      onLoadCategory={onLoadCategory}
      onSelect={onSelect}
    />
  )
}

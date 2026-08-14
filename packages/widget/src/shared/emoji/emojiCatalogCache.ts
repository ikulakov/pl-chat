import type { EmojiCatalog, EmojiCategory, EmojiIndex, EmojiItem } from '../../domain/emoji'
import { readMeta, writeMeta } from './emojiDb'

/**
 * Каталог эмодзи в постоянном кэше.
 *
 * Каталог, состав вкладок и индекс пака меняются только вместе с `version`, а весят вместе с
 * силуэтами сотни килобайт. Держать их в IndexedDB — значит поднимать панель мгновенно и без
 * сети, а не ждать три запроса при каждом открытии.
 *
 * Проверка версии живёт в `emojiDb.readMeta`: запись чужой версии не отдаётся, даже если её ещё
 * не успела вычистить `syncPackVersion`.
 */

const CATEGORIES_KEY = 'categories'
const INDEX_KEY = 'pack-index'
const categoryKey = (categoryId: string): string => `category:${categoryId}`

/** Категории без состава: состав лежит отдельными записями, чтобы не переписывать всё целиком. */
type CategoryShell = Omit<EmojiCategory, 'items'>

export async function readCachedCatalog(): Promise<EmojiCatalog | null> {
  const record = await readMeta<CategoryShell[]>(CATEGORIES_KEY)
  if (!record) return null

  const categories = await Promise.all(
    record.data.map(async (shell): Promise<EmojiCategory> => {
      const items = await readMeta<EmojiItem[]>(categoryKey(shell.id), record.version)

      return items
        ? { ...shell, count: items.data.length, items: items.data }
        : { ...shell, items: null }
    }),
  )

  return { version: record.version, categories }
}

export function writeCachedCatalog(catalog: EmojiCatalog): void {
  const shells: CategoryShell[] = catalog.categories.map(({ id, title, count }) => ({
    id,
    title,
    count,
  }))

  void writeMeta(CATEGORIES_KEY, catalog.version, shells)
}

export function writeCachedCategory(version: string, category: EmojiCategory): void {
  if (!category.items) return

  void writeMeta(categoryKey(category.id), version, category.items)
}

/**
 * Индекс пака (символ → codepoint). `Map` кладётся в IndexedDB как есть: структурное
 * клонирование его поддерживает, и разбирать пак заново на старте не приходится.
 */
export async function readCachedEmojiIndex(): Promise<EmojiIndex | null> {
  const record = await readMeta<EmojiIndex>(INDEX_KEY)
  if (!record) return null

  // Пустой индекс кэшировать бессмысленно и вредно: он означает выключенную на бэкенде фичу,
  // а не готовые данные.
  return record.data.codepointByChar.size > 0 ? record.data : null
}

export function writeCachedEmojiIndex(index: EmojiIndex): void {
  if (index.codepointByChar.size === 0) return

  void writeMeta(INDEX_KEY, index.version, index)
}

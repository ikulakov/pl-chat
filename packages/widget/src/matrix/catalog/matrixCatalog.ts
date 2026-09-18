import type {
  EmojiAnimation,
  EmojiCatalog,
  EmojiCategory,
  EmojiIndex,
  StickerPack,
} from '@/domain/emoji'
import type { MediaId } from '@/shared/types/ids'
import { createBatchedLoader } from '@/shared/lottie/animationBatcher'
import type { MatrixApi } from '../api/matrixApi'
import { toEmojiCatalog, toEmojiCategory, toEmojiIndex, toStickerPacks } from '../mappers/emoji'

/**
 * Справочники эмодзи и стикеров: каталог вкладок пикера, индекс пака для ленты и байты анимаций.
 *
 * Отделён от `MatrixService` не по размеру, а по владению состоянием: у каталогов нет ни сессии,
 * ни комнаты, ни поколения жизненного цикла — это server-managed данные, одинаковые для всех и
 * переживающие переподключение. В стор они не попадают и `nextLifecycle()` их не обесценивает,
 * поэтому в контроллере диалога им было нечего делать: единственное, что их с ним связывало, —
 * общий `api`.
 */
export interface CatalogService {
  loadEmojiCatalog: () => Promise<EmojiCatalog>
  loadEmojiCategory: (categoryId: string) => Promise<EmojiCategory>
  loadEmojiIndex: () => Promise<EmojiIndex>
  loadEmojiAnimation: (codepoint: string, version: string) => Promise<EmojiAnimation>
  loadStickerPacks: () => Promise<StickerPack[]>
  loadStickerAnimation: (mediaId: MediaId) => Promise<EmojiAnimation>
}

type CatalogApi = Pick<
  MatrixApi,
  | 'getEmojiCategories'
  | 'getEmojiCategory'
  | 'getEmojiPacks'
  | 'getEmojiAnimation'
  | 'getEmojiAnimations'
  | 'getStickerPacks'
  | 'getStickerAnimation'
>

export class MatrixCatalog implements CatalogService {
  private readonly api: CatalogApi

  // Индекс пака. Справочник server-managed — один и тот же ответ для всех, поэтому смена сессии
  // его не обесценивает. Хранится промис: он же дедуп параллельных запросов, пока первый в полёте.
  private emojiIndex: Promise<EmojiIndex> | null = null

  // Склейка загрузок эмодзи в пачки. Заводится в конструкторе: батчер держит окно сбора заявок,
  // и общий он должен быть на весь каталог, а не на вызов.
  private readonly emojiAnimations: (codepoint: string, version: string) => Promise<EmojiAnimation>

  constructor(api: CatalogApi) {
    this.api = api
    this.emojiAnimations = createBatchedLoader({
      loadBatch: (codepoints, version) =>
        api.getEmojiAnimations(codepoints, version).then((response) => response.emoji ?? {}),
      loadOne: (codepoint, version) => api.getEmojiAnimation(codepoint, version),
    })
  }

  async loadEmojiCatalog(): Promise<EmojiCatalog> {
    return toEmojiCatalog(await this.api.getEmojiCategories())
  }

  async loadEmojiCategory(categoryId: string): Promise<EmojiCategory> {
    return toEmojiCategory(await this.api.getEmojiCategory(categoryId))
  }

  /**
   * Индекс пака для ленты. В отличие от каталога вкладок, запрашивается один раз за жизнь
   * вкладки: он нужен на каждое текстовое сообщение, а меняется только с версией пака.
   */
  loadEmojiIndex(): Promise<EmojiIndex> {
    this.emojiIndex ??= this.api
      .getEmojiPacks()
      .then(toEmojiIndex)
      .catch((err: unknown) => {
        // Упавший запрос в кэше не держим: следующая попытка начнёт заново.
        this.emojiIndex = null
        throw err
      })

    return this.emojiIndex
  }

  /**
   * Анимация одного эмодзи — но в сеть уходит пачка: заявки соседних ячеек пикера и соседних
   * сообщений ленты склеиваются в один запрос к `/bundle`, см. `animationBatcher`.
   */
  loadEmojiAnimation(codepoint: string, version: string): Promise<EmojiAnimation> {
    return this.emojiAnimations(codepoint, version)
  }

  async loadStickerPacks(): Promise<StickerPack[]> {
    return toStickerPacks(await this.api.getStickerPacks())
  }

  loadStickerAnimation(mediaId: MediaId): Promise<EmojiAnimation> {
    return this.api.getStickerAnimation(mediaId)
  }
}

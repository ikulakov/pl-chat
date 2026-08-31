/**
 * Постоянный слой кэша эмодзи — IndexedDB.
 *
 * Зачем он вообще нужен при `Cache-Control: immutable` на байтах: HTTP-кэш снимает только
 * загрузку. Разбор JSON и отрисовка первого кадра (lottie → SVG → `<img>` → canvas) остаются, а
 * это самая дорогая часть показа — и она повторяется в каждой новой сессии. Здесь лежит уже
 * готовый результат: PNG-кадр и каталог.
 *
 * Модуль обязан деградировать молча. Приватный режим, забитая квота, отключённое хранилище —
 * всё это отдаёт `null`, и виджет работает как раньше: из памяти и из сети. IndexedDB тут
 * ускоряет, но ни от чего не зависит.
 */

const DB_NAME = 'plchat-emoji'
const DB_VERSION = 1

const FRAMES = 'frames'
const META = 'meta'

/** Отрисованный первый кадр. `url` — PNG в виде data-URL, см. решение о формате в плане. */
interface FrameRecord {
  url: string
  version: string
}

interface MetaRecord<T> {
  version: string
  data: T
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    // `indexedDB` может отсутствовать вовсе (jsdom, встраивание в песочницу без storage),
    // а сам вызов open() — бросить прямо здесь: Firefox так делает в приватном окне.
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(FRAMES)) db.createObjectStore(FRAMES)
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      // Открытие висит, пока другая вкладка держит базу старой версии. Ждать нечего —
      // работаем без постоянного слоя.
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })

  return dbPromise
}

function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest | null,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null)
          return
        }

        try {
          const tx = db.transaction(store, mode)
          const request = run(tx.objectStore(store))

          if (!request) {
            tx.oncomplete = () => resolve(null)
            tx.onerror = () => resolve(null)
            tx.onabort = () => resolve(null)
            return
          }

          request.onsuccess = () => resolve((request.result as T) ?? null)
          request.onerror = () => resolve(null)
        } catch {
          // InvalidStateError после закрытия базы (её мог снести другой контекст) и всё
          // остальное лечится одинаково: считаем, что кэша нет.
          resolve(null)
        }
      }),
  )
}

/** Кадр нужной версии. `null` — кадра нет, версия чужая или хранилище недоступно. */
export async function readFrame(key: string, version: string): Promise<string | null> {
  const record = await withStore<FrameRecord>(FRAMES, 'readonly', (store) => store.get(key))

  return record?.version === version ? record.url : null
}

export function writeFrame(key: string, version: string, url: string): Promise<void> {
  const record: FrameRecord = { url, version }

  // Результат не ждём и ошибку не поднимаем: запись — побочный эффект, картинка уже отдана.
  return withStore(FRAMES, 'readwrite', (store) => store.put(record, key)).then(() => {})
}

export async function readMeta<T>(key: string, version?: string): Promise<MetaRecord<T> | null> {
  const record = await withStore<MetaRecord<T>>(META, 'readonly', (store) => store.get(key))
  if (!record) return null

  return version === undefined || record.version === version ? record : null
}

export function writeMeta<T>(key: string, version: string, data: T): Promise<void> {
  const record: MetaRecord<T> = { version, data }

  return withStore(META, 'readwrite', (store) => store.put(record, key)).then(() => {})
}

const synced = new Set<string>()

/**
 * Вычищает всё, что относится к прошлым версиям пака.
 *
 * Курсором с проверкой версии, а не `clear()`: чистка идёт параллельно с уже начавшейся записью
 * кадров новой версии (её запускает та же панель), и `clear()` в этой гонке стёр бы свежее.
 *
 * Однократно на версию за жизнь вкладки: зовут и каталог пикера, и индекс пака для ленты.
 */
export function syncPackVersion(version: string): void {
  if (!version || synced.has(version)) return
  synced.add(version)

  void purgeOtherVersions(FRAMES, version)
  void purgeOtherVersions(META, version)
}

function purgeOtherVersions(store: string, version: string): Promise<null> {
  return withStore<null>(store, 'readwrite', (objectStore) => {
    const cursorRequest = objectStore.openCursor()

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return

      const record = cursor.value as { version?: string } | undefined
      if (record?.version !== version) cursor.delete()

      cursor.continue()
    }

    // Транзакцию ведёт курсор, поэтому ждём не запрос, а её завершение.
    return null
  })
}

/** Нужен тестам: отметки о вычищенных версиях — модульное состояние. */
export function resetEmojiDb(): void {
  dbPromise = null
  synced.clear()
}

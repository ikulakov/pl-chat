import { useCallback, useEffect, useState } from 'react'
import { toMediaFailure } from '../../../domain/mediaError'
import type { ThumbnailSize } from '../../../matrix/api/matrixApi'
import { useChatActions } from '../../../hooks/useChatActions'
import { useChatStore } from '../../../hooks/useChatStore'
import { parseMxcUrl } from '../../../shared/utils/mxc'
import { selectMediaVerdicts } from '../../../store/selectors'

/**
 * `checking` и `rejected` — состояния конвейера проверки файла на сервере. Два источника:
 * код ответа download'а (504 / 404) — фолбэк, пока вердикта не было; и `kc.media.status` из
 * `/sync` — как только он приходит, читаем его напрямую (для `rejected` — вообще без сети) и
 * подталкиваем застрявший `checking` к повторной попытке.
 */
export type MediaSource =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'checking' }
  | { status: 'ready'; url: string }
  | { status: 'rejected' }
  | { status: 'error'; retry: () => void }

interface Options {
  mxcUrl: string
  size: ThumbnailSize
}

const IDLE: MediaSource = { status: 'idle' }
const LOADING: MediaSource = { status: 'loading' }
const CHECKING: MediaSource = { status: 'checking' }
const REJECTED: MediaSource = { status: 'rejected' }

/**
 * Байты держит кэш контроллера (общий на все ряды), а object-URL — этот хук: он живёт ровно
 * столько, сколько компонент, поэтому revoke всегда безопасен и не бьёт по чужой картинке.
 */
export function useMediaSource({ mxcUrl, size }: Options): MediaSource {
  const { width, height } = size

  const { loadPreview } = useChatActions()

  const verdicts = useChatStore(selectMediaVerdicts)
  const mediaId = mxcUrl ? parseMxcUrl(mxcUrl)?.mediaId : undefined
  const verdict = mediaId ? verdicts[mediaId] : undefined

  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  // Результат хранится вместе с ключом запроса: смена ключа сама возвращает нас в loading,
  // без setState в теле эффекта и лишнего рендера.
  const [result, setResult] = useState<{ key: string; source: MediaSource } | null>(null)
  const key = mxcUrl ? `${mxcUrl}#${width}x${height}#${attempt}` : ''

  useEffect(() => {
    // Вердикт уже отрицателен — сеть не нужна вовсе, сервер уже вынес финальное «нет».
    // Сам REJECTED вернётся ниже как производное значение — эффекту тут делать нечего.
    if (!key || verdict?.status === 'rejected') return

    let cancelled = false
    let objectUrl: string | null = null

    void loadPreview(mxcUrl, { width, height })
      .then((blob) => {
        if (cancelled) return

        objectUrl = URL.createObjectURL(blob)
        setResult({ key, source: { status: 'ready', url: objectUrl } })
      })
      .catch((err: unknown) => {
        if (cancelled) return

        const failure = toMediaFailure(err)
        const source =
          failure === 'pending'
            ? CHECKING
            : failure === 'rejected'
              ? REJECTED
              : { status: 'error' as const, retry }

        setResult({ key, source })
      })

    return () => {
      cancelled = true
      if (!objectUrl) return

      // Результат выбрасываем вместе с URL: `<Activity mode="hidden">` размонтирует эффекты,
      // но сохраняет состояние — иначе при возврате в панель первый рендер отдал бы в <img>
      // уже отозванный blob. Кэш контроллера вернёт байты микротактом, скелетон не заметен.
      URL.revokeObjectURL(objectUrl)
      setResult(null)
    }
    // verdict?.status — намеренно в зависимостях: переход undefined → ready/rejected
    // перезапускает эффект и берёт вердикт как второй источник тех же состояний (см. шапку
    // файла), не дожидаясь, пока пользователь сам спровоцирует повторный рендер.
  }, [key, mxcUrl, width, height, loadPreview, retry, verdict?.status])

  if (!key) return IDLE
  // Вердикт приоритетнее любого сетевого результата — актуален и тогда, когда он пришёл
  // уже после того, как сеть успела вернуть что-то другое (например, ещё не 404).
  if (verdict?.status === 'rejected') return REJECTED

  return result?.key === key ? result.source : LOADING
}

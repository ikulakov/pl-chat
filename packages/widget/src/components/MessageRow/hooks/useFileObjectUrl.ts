import { useEffect, useState } from 'react'

/**
 * Локальное превью своего файла. Живёт дольше, чем сам `File` в сообщении: `settled`
 * говорит, что сервер вынес вердикт и байты можно отпустить. Пока вердикта нет, URL
 * держим — иначе картинка на секунды сменяется пустым фоном.
 *
 * Создаём именно в эффекте, а не в useMemo: мемо не гарантирует однократного выполнения —
 * StrictMode прогоняет рендер дважды, а прерванный конкурентный рендер вообще не коммитится,
 * и созданный в нём URL не увидит ни один cleanup (утечка байтов файла на весь сеанс).
 */
export function useFileObjectUrl(file: File | undefined, settled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null)

  // Сообщение теряет File сразу после заливки (message.uploaded), а превью нужно дольше —
  // до прихода серверной версии. Поэтому файл запоминаем и не отпускаем вместе с сообщением.
  const [held, setHeld] = useState(file)
  if (file && file !== held) setHeld(file)

  useEffect(() => {
    if (!held || settled) return

    const objectUrl = URL.createObjectURL(held)
    // set-state-in-effect: правило про синхронизацию с внешним стейтом, а здесь эффект
    // СОЗДАЁТ ресурс — узнать URL до коммита неоткуда. Цена — лишний рендер на монтирование;
    // альтернатива (useMemo) течёт байтами файла на прерванном рендере.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl)

    // Освобождаем по вердикту сервера и на размонтировании ряда. Потеря File самим
    // сообщением сюда не относится — на неё эффект не перезапускается, URL живёт дальше.
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [held, settled])

  return url
}

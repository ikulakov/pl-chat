/** Когда виджет попадает в сеть. Публичная опция хоста — см. LoaderConfig.preload. */
export type PreloadMode = 'idle' | 'eager' | 'on-open'

// Потолок ожидания простоя: на нагруженной странице requestIdleCallback может не
// позвать колбэк долго, а прогрев нужен до того, как пользователь нажмёт кнопку.
const IDLE_LOAD_TIMEOUT_MS = 2000

// Фолбэк для браузеров без requestIdleCallback: просто уступаем несколько кадров
// после load, чтобы не мешать хосту доотрисоваться.
const IDLE_LOAD_FALLBACK_MS = 200

// Потолок ожидания события load хоста. На реальных страницах load может не наступить
// вовсе: один зависший сторонний ресурс держит документ в readyState=interactive
// (проверено на otpbank.ru — 30+ секунд). Ждать его бесконечно нельзя, иначе прогрев
// не случится никогда и первое открытие всегда будет холодным.
const HOST_LOAD_MAX_WAIT_MS = 5000

/**
 * Зовёт `load` в момент, заданный режимом. Отменять запланированное не нужно и нечем:
 * `load` обязан быть идемпотентным, поэтому ранний вызов (пользователь открыл панель
 * раньше прогрева) делает отложенный холостым.
 */
export function schedulePreload(mode: PreloadMode, load: () => void): void {
  if (mode === 'eager') {
    load()
    return
  }
  if (mode === 'on-open') return

  // idle: ждём load хоста (чтобы не отбирать полосу у его критического пути),
  // потом первого простоя.
  afterHostLoad(() => whenIdle(load))
}

function afterHostLoad(run: () => void): void {
  if (document.readyState === 'complete') {
    run()
    return
  }

  // Что наступит раньше — load хоста или потолок ожидания.
  let timer = 0
  const fire = (): void => {
    window.clearTimeout(timer)
    run()
  }

  timer = window.setTimeout(fire, HOST_LOAD_MAX_WAIT_MS)
  window.addEventListener('load', fire, { once: true })
}

function whenIdle(run: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: IDLE_LOAD_TIMEOUT_MS })
    return
  }

  window.setTimeout(run, IDLE_LOAD_FALLBACK_MS)
}

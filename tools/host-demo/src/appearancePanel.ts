import { ChatSDK, type PanelAppearance, type PanelCorner } from '@bankchat/loader'

// Демонстрация host-controlled appearance API (@bankchat/loader).
// «Применить» бьёт в ChatSDK.setAppearance() — смена без перезагрузки; выбор попутно
// кладётся в localStorage, чтобы после reload отработал и init-путь (LoaderConfig.appearance).
// «Сбросить» идёт через перезагрузку: setAppearance мержит, снять поле им нельзя.
const STORAGE_KEY = 'bankchat-demo-appearance'

export function loadStoredAppearance(): PanelAppearance | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as PanelAppearance
  } catch {
    return undefined
  }
}

export function initAppearancePanel(append: (msg: string) => void): void {
  const cornerEl = document.getElementById('ap-corner') as HTMLSelectElement
  const offsetXEl = document.getElementById('ap-offset-x') as HTMLInputElement
  const offsetYEl = document.getElementById('ap-offset-y') as HTMLInputElement
  const zIndexEl = document.getElementById('ap-zindex') as HTMLInputElement

  const stored = loadStoredAppearance()
  if (stored) {
    cornerEl.value = stored.corner ?? 'bottom-right'
    offsetXEl.value = stored.offsetX?.toString() ?? ''
    offsetYEl.value = stored.offsetY?.toString() ?? ''
    zIndexEl.value = stored.zIndex?.toString() ?? ''
  }

  document.getElementById('ap-apply')?.addEventListener('click', () => {
    const next: PanelAppearance = {
      corner: cornerEl.value as PanelCorner,
      ...(offsetXEl.value !== '' && { offsetX: Number(offsetXEl.value) }),
      ...(offsetYEl.value !== '' && { offsetY: Number(offsetYEl.value) }),
      ...(zIndexEl.value !== '' && { zIndex: Number(zIndexEl.value) }),
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    ChatSDK.setAppearance(next)
    append(`→ setAppearance(${JSON.stringify(next)})`)
  })

  document.getElementById('ap-reset')?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY)
    location.reload()
  })
}

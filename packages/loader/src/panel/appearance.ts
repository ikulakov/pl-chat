import type { ViewportMode } from '@bankchat/protocol'

export type Style = Partial<CSSStyleDeclaration>

export type PanelCorner = 'bottom-right' | 'bottom-left'

export interface PanelAppearance {
  corner?: PanelCorner
  offsetX?: number
  offsetY?: number
  zIndex?: number
}

const DEFAULTS = {
  corner: 'bottom-right',
  offsetX: 17,
  offsetY: 80,
  zIndex: 2147483000,
} as const satisfies Required<PanelAppearance>

const BASE_STYLE: Style = {
  position: 'fixed',
  border: '0',
  colorScheme: 'normal',
}

const DOCKED_LOOK: Style = {
  width: '444px',
  height: '656px',
  borderRadius: '20px',
  boxShadow: '0px 0px 56px 0px rgba(0,0,0,0.1)',
}
const DOCKED_TOP_GAP_PX = 16

const DOCKED_MIN_HEIGHT_PX = 452

const DOCKED_TRANSITION = 'opacity 0.18s ease, transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)'

const FULLSCREEN_LOOK: Style = {
  width: '100%',
  // 100dvh не сжимается при открытии экранной клавиатуры на iOS
  height: '100dvh',
  borderRadius: '0px',
  boxShadow: 'none',
}

// bottom:auto, а не inset:0 — иначе bottom:0 конкурировал бы с height:100dvh.
const FULLSCREEN_INSET = '0 0 auto 0'

function resolveDockedInset(appearance: PanelAppearance, collapsed = false): string {
  const x = collapsed ? '0px' : `${appearance.offsetX ?? DEFAULTS.offsetX}px`
  const y = collapsed ? '0px' : `${appearance.offsetY ?? DEFAULTS.offsetY}px`

  return (appearance.corner ?? DEFAULTS.corner) === 'bottom-left'
    ? `auto auto ${y} ${x}`
    : `auto ${x} ${y} auto`
}

function resolveDockedMaxHeight(appearance: PanelAppearance): string {
  const y = appearance.offsetY ?? DEFAULTS.offsetY

  return `calc(100dvh - ${y + DOCKED_TOP_GAP_PX}px)`
}

function resolveZIndex(appearance: PanelAppearance): string {
  return String(appearance.zIndex ?? DEFAULTS.zIndex)
}

export function resolveContainerStyle(mode: ViewportMode, appearance: PanelAppearance = {}): Style {
  // Fullscreen: corner/offset из appearance НЕ применяются (иначе corner:left
  // утаскивает панель из полного экрана). Работает только z-index.
  if (mode === 'fullscreen') {
    return {
      ...BASE_STYLE,
      ...FULLSCREEN_LOOK,
      zIndex: resolveZIndex(appearance),
      transition: 'none',
      inset: FULLSCREEN_INSET,
    }
  }

  return {
    ...BASE_STYLE,
    ...DOCKED_LOOK,
    maxHeight: resolveDockedMaxHeight(appearance),
    minHeight: `${DOCKED_MIN_HEIGHT_PX}px`,
    zIndex: resolveZIndex(appearance),
    transition: DOCKED_TRANSITION,
    inset: resolveDockedInset(appearance),
  }
}

// Свёрнутая панель — нулевой бокс в углу.
export function resolveCollapsedStyle(mode: ViewportMode, appearance: PanelAppearance = {}): Style {
  const base: Style = {
    ...BASE_STYLE,
    zIndex: resolveZIndex(appearance),
    width: '0',
    height: '0',
    opacity: '0',
    pointerEvents: 'none',
  }

  if (mode === 'fullscreen') {
    return { ...base, inset: FULLSCREEN_INSET, transform: 'none', transition: 'none' }
  }

  return {
    ...base,
    inset: resolveDockedInset(appearance, true),
    transform: 'scale(0.95)',
    transition: DOCKED_TRANSITION,
  }
}

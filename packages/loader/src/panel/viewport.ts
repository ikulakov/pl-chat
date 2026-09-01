import type { ViewportMode } from '@bankchat/protocol'

export const MOBILE_BREAKPOINT_PX = 480

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`

export function resolveViewportMode(isMobile: boolean): ViewportMode {
  return isMobile ? 'fullscreen' : 'docked'
}

import type { ViewportMode } from '@bankchat/protocol'

export const MOBILE_BREAKPOINT_PX = 480

export function resolveViewportMode(hostWidth: number): ViewportMode {
  return hostWidth < MOBILE_BREAKPOINT_PX ? 'fullscreen' : 'docked'
}

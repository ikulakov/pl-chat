import { describe, expect, it } from 'vitest'
import { GAP, VIEWPORT_MARGIN, computeDropdownPosition } from './computeDropdownPosition'

const VIEWPORT = { width: 400, height: 600 }

describe('computeDropdownPosition', () => {
  it('flips above the trigger when the menu does not fit below', () => {
    // триггер у нижнего края — под ним меню не помещается
    const trigger = { top: 560, bottom: 580, left: 300, right: 340 }
    const menu = { width: 160, height: 120 }

    const { top } = computeDropdownPosition(trigger, menu, VIEWPORT)

    expect(top).toBe(trigger.top - GAP - menu.height)
  })

  it('pins to the bottom margin when the menu fits neither below nor above', () => {
    // меню выше вьюпорта — некуда ни вниз, ни вверх
    const trigger = { top: 300, bottom: 320, left: 300, right: 340 }
    const menu = { width: 160, height: 700 }

    const { top } = computeDropdownPosition(trigger, menu, VIEWPORT)

    expect(top).toBe(VIEWPORT_MARGIN)
  })

  it('aligns the menu right edge to the trigger right edge by default', () => {
    const trigger = { top: 100, bottom: 120, left: 300, right: 340 }
    const menu = { width: 160, height: 120 }

    const { left } = computeDropdownPosition(trigger, menu, VIEWPORT)

    expect(left).toBe(trigger.right - menu.width)
  })

  it('falls back to left-edge alignment when right-alignment overflows the left margin', () => {
    // узкий триггер у левого края: right - width уехало бы за левый край
    const trigger = { top: 100, bottom: 120, left: 10, right: 40 }
    const menu = { width: 160, height: 120 }

    const { left } = computeDropdownPosition(trigger, menu, VIEWPORT)

    expect(left).toBe(trigger.left)
  })

  it('clamps left within both viewport margins', () => {
    const trigger = { top: 100, bottom: 120, left: 380, right: 396 }
    const menu = { width: 160, height: 120 }

    const { left } = computeDropdownPosition(trigger, menu, VIEWPORT)

    expect(left).toBeLessThanOrEqual(VIEWPORT.width - VIEWPORT_MARGIN - menu.width)
    expect(left).toBeGreaterThanOrEqual(VIEWPORT_MARGIN)
  })
})

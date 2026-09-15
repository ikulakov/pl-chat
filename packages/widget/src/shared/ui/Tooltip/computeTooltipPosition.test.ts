import { describe, expect, it } from 'vitest'
import { ARROW_INSET, GAP, VIEWPORT_MARGIN, computeTooltipPosition } from './computeTooltipPosition'

const VIEWPORT = { width: 400, height: 600 }
const TOOLTIP = { width: 120, height: 22 }

describe('computeTooltipPosition', () => {
  it('prefers the space above the trigger', () => {
    const trigger = { top: 300, bottom: 320, left: 180, right: 220 }

    const { top, side } = computeTooltipPosition(trigger, TOOLTIP, VIEWPORT)

    expect(side).toBe('top')
    expect(top).toBe(trigger.top - GAP - TOOLTIP.height)
  })

  it('flips below the trigger when there is no room above', () => {
    const trigger = { top: 10, bottom: 30, left: 180, right: 220 }

    const { top, side } = computeTooltipPosition(trigger, TOOLTIP, VIEWPORT)

    expect(side).toBe('bottom')
    expect(top).toBe(trigger.bottom + GAP)
  })

  it('centers the tooltip on the trigger', () => {
    const trigger = { top: 300, bottom: 320, left: 180, right: 220 }

    const { left, arrowLeft } = computeTooltipPosition(trigger, TOOLTIP, VIEWPORT)

    expect(left).toBe(200 - TOOLTIP.width / 2)
    // стрелка ровно посередине тултипа, раз он центрирован
    expect(arrowLeft).toBe(TOOLTIP.width / 2)
  })

  it('keeps the arrow over the trigger after clamping to the viewport edge', () => {
    // триггер у левого края: центрированный тултип уехал бы за границу
    const trigger = { top: 300, bottom: 320, left: 12, right: 52 }

    const { left, arrowLeft } = computeTooltipPosition(trigger, TOOLTIP, VIEWPORT)

    expect(left).toBe(VIEWPORT_MARGIN)
    // тултип сдвинут, стрелка осталась над центром триггера
    expect(left + arrowLeft).toBe(32)
  })

  it('never lets the arrow reach the rounded corners', () => {
    // триггер вплотную к левому краю — центр триггера левее, чем допустимо для стрелки
    const trigger = { top: 300, bottom: 320, left: 0, right: 8 }

    const { arrowLeft } = computeTooltipPosition(trigger, TOOLTIP, VIEWPORT)

    expect(arrowLeft).toBe(ARROW_INSET)
  })
})

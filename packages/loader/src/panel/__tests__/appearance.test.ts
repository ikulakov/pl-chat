import { describe, expect, it } from 'vitest'
import { resolveCollapsedStyle, resolveContainerStyle } from '../appearance'

describe('resolveContainerStyle — defaults', () => {
  it('docked: falls back to the documented default geometry', () => {
    const style = resolveContainerStyle('docked')

    expect(style.width).toBe('444px')
    expect(style.height).toBe('656px')
    expect(style.borderRadius).toBe('20px')
    expect(style.inset).toBe('auto 17px 80px auto')
    expect(style.zIndex).toBe('2147483000')
  })

  it('fullscreen: height is the sole authority (bottom:auto, no inset:0/dvh conflict)', () => {
    const style = resolveContainerStyle('fullscreen')

    expect(style.height).toBe('100dvh')
    // inset шорткатом: top/right/left:0, bottom:auto — чтобы 100dvh был единственным
    // авторитетом высоты (bottom:0 конкурировал бы с height).
    expect(style.inset).toBe('0 0 auto 0')
    expect(style.borderRadius).toBe('0px')
  })
})

describe('resolveContainerStyle — host appearance overrides', () => {
  it('applies semantic fields (corner, offsets, zIndex)', () => {
    const style = resolveContainerStyle('docked', {
      corner: 'bottom-left',
      offsetX: 24,
      offsetY: 40,
      zIndex: 100,
    })

    expect(style.inset).toBe('auto auto 40px 24px')
    expect(style.zIndex).toBe('100')
  })

  // Размер, скругление и тень принадлежат виджету и в API не выносятся.
  it("keeps the panel's own look out of the semantic API", () => {
    const style = resolveContainerStyle('docked')

    expect(style.width).toBe('444px')
    expect(style.height).toBe('656px')
    expect(style.borderRadius).toBe('20px')
  })

  // Инвариант из Integration.md §5: в fullscreen из appearance применяется ТОЛЬКО
  // zIndex — иначе corner:'bottom-left' утащил бы панель из полного экрана.
  it('fullscreen ignores geometry fields but still honours zIndex', () => {
    const style = resolveContainerStyle('fullscreen', {
      corner: 'bottom-left',
      offsetX: 24,
      offsetY: 40,
      zIndex: 100,
    })

    expect(style.inset).toBe('0 0 auto 0')
    expect(style.width).toBe('100%')
    expect(style.borderRadius).toBe('0px')
    expect(style.boxShadow).toBe('none')
    expect(style.zIndex).toBe('100')
  })
})

describe('resolveCollapsedStyle', () => {
  it('anchors the zero-size box to the configured corner', () => {
    expect(resolveCollapsedStyle('docked', { corner: 'bottom-left' }).inset).toBe(
      'auto auto 0px 0px',
    )
    expect(resolveCollapsedStyle('docked').inset).toBe('auto 0px 0px auto')
  })
})

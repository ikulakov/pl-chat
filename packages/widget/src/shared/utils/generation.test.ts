import { describe, expect, it } from 'vitest'
import { Generation } from './generation'

describe('Generation', () => {
  it('begin гасит прежнее поколение и отдаёт живой сигнал нового', () => {
    const generation = new Generation()
    const first = generation.begin()
    const second = generation.begin()

    expect(first.aborted).toBe(true)
    expect(second.aborted).toBe(false)
  })

  it('end гасит текущее поколение, и снимок до следующего begin остаётся погашенным', () => {
    const generation = new Generation()
    generation.begin()
    generation.end()

    expect(generation.signal.aborted).toBe(true)
    expect(generation.begin().aborted).toBe(false)
  })

  it('снимок signal не начинает нового поколения', () => {
    const generation = new Generation()
    const started = generation.begin()

    expect(generation.signal).toBe(started)
    expect(started.aborted).toBe(false)
  })
})

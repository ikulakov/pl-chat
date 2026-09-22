import { describe, expect, it } from 'vitest'
import { evictOldest } from './evictOldest'

describe('evictOldest', () => {
  it('с весом урезает по сумме, выбрасывая самые старые', () => {
    const entries = new Map([
      ['a', 4],
      ['b', 4],
      ['c', 4],
    ])

    evictOldest(entries, 10, (size) => size)

    expect([...entries.keys()]).toEqual(['b', 'c'])
  })

  it('самую свежую запись не выбрасывает, даже если она одна тяжелее потолка', () => {
    const entries = new Map([
      ['a', 4],
      ['big', 20],
    ])

    evictOldest(entries, 10, (size) => size)

    expect([...entries.keys()]).toEqual(['big'])
  })
})

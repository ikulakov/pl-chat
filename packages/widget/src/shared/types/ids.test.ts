import { describe, expectTypeOf, it } from 'vitest'
import type { EventId, LocalId, MediaId, RoomId, TxnId, UserId } from './ids'

// Эти проверки выполняет tsc в pnpm typecheck. Один vitest не проверяет типы.
describe('ID — совместимость типов', () => {
  it('разрешает строки на внешних границах и использование ID как строки', () => {
    expectTypeOf<string>().toMatchTypeOf<EventId & LocalId & TxnId & UserId & RoomId & MediaId>()
    expectTypeOf<EventId | LocalId | TxnId | UserId | RoomId | MediaId>().toMatchTypeOf<string>()
  })

  it('не позволяет подменять один вид ID другим', () => {
    expectTypeOf<EventId>().not.toMatchTypeOf<TxnId | UserId | RoomId | MediaId>()
    expectTypeOf<LocalId>().not.toMatchTypeOf<EventId | TxnId | UserId | RoomId | MediaId>()
    expectTypeOf<TxnId>().not.toMatchTypeOf<EventId | LocalId | UserId | RoomId | MediaId>()
    expectTypeOf<UserId>().not.toMatchTypeOf<EventId | LocalId | TxnId | RoomId | MediaId>()
    expectTypeOf<RoomId>().not.toMatchTypeOf<EventId | LocalId | TxnId | UserId | MediaId>()
    expectTypeOf<MediaId>().not.toMatchTypeOf<EventId | LocalId | TxnId | UserId | RoomId>()
  })

  it('позволяет использовать ID события как ключ ленты только в одном направлении', () => {
    expectTypeOf<EventId>().toMatchTypeOf<LocalId>()
    expectTypeOf<LocalId>().not.toMatchTypeOf<EventId>()
  })
})

import type { ChatActions } from '../../chatController'
import type { FileAttachment } from '@/components/Attachment/useAttachmentState'
import type {
  indexMessagesByEventId,
  ReplyPreviewData,
} from '@/components/MessageList/MessageList.helpers'
import type { StickerItem } from '@/domain/emoji'
import type { createOptimisticTextMessage } from '@/domain/optimistic'
import type { MessageTimelineItem } from '@/domain/timeline'
import type { MatrixApi } from '@/matrix/api/matrixApi'
import type { MatrixController, SendFileOptions } from '@/matrix/matrixController'
import type { LocalStorageSessionStore } from '@/matrix/session/localStorageSessionStore'
import type * as Matrix from '@/matrix/wire'
import { describe, expectTypeOf, it } from 'vitest'
import type { EventId, LocalId, MediaId, RoomId, TxnId, UserId } from '../types/ids'
import type { ParsedMxcUrl } from '../utils/mxc'

// Проверяем конкретные реализации: implements не запрещает расширить параметр до string.
// Отрицательные вызовы ниже только компилируются и никогда не выполняются.
describe('ID — сохранение брендов между слоями (pnpm typecheck)', () => {
  it('сохраняет тип ответа в контроллерах и при отправке файла', () => {
    expectTypeOf<MatrixController['sendMessage']>().toEqualTypeOf<ChatActions['sendMessage']>()
    expectTypeOf<SendFileOptions['replyToEventId']>().toEqualTypeOf<EventId | undefined>()
    type AttachmentOptions = NonNullable<Parameters<FileAttachment['send']>[0]>
    expectTypeOf<AttachmentOptions['replyToEventId']>().toEqualTypeOf<EventId | undefined>()
  })

  it('сохраняет типы в ответах API, сессии и медиа', () => {
    expectTypeOf<Matrix.SendEventResponse['event_id']>().toEqualTypeOf<EventId>()
    expectTypeOf<Matrix.RegisterResponse['user_id']>().toEqualTypeOf<UserId>()
    type JoinedRooms = NonNullable<NonNullable<Matrix.SyncResponse['rooms']>['join']>
    expectTypeOf<keyof JoinedRooms>().toEqualTypeOf<RoomId>()
    expectTypeOf<ReturnType<LocalStorageSessionStore['getUserId']>>().toEqualTypeOf<UserId | null>()
    expectTypeOf<StickerItem['mediaId']>().toEqualTypeOf<MediaId>()
    expectTypeOf<Matrix.StickerWire['media_id']>().toEqualTypeOf<MediaId>()
    expectTypeOf<ParsedMxcUrl['mediaId']>().toEqualTypeOf<MediaId>()
  })

  it('различает ключ поиска события, якорь цитаты и ключ идемпотентности', () => {
    expectTypeOf<ReturnType<typeof indexMessagesByEventId>>().toEqualTypeOf<
      Map<EventId, MessageTimelineItem>
    >()
    expectTypeOf<ReplyPreviewData['targetId']>().toEqualTypeOf<LocalId | undefined>()
    type Draft = ReturnType<typeof createOptimisticTextMessage>
    expectTypeOf<Draft['localId']>().toEqualTypeOf<LocalId>()
    expectTypeOf<Draft['txnId']>().toEqualTypeOf<TxnId>()
  })

  it('отклоняет неправильные ID на реальных границах вызовов', () => {
    const checkCalls = (
      actions: ChatActions,
      matrix: MatrixController,
      api: MatrixApi,
      localId: LocalId,
      eventId: EventId,
      txnId: TxnId,
      userId: UserId,
      roomId: RoomId,
      messages: ReturnType<typeof indexMessagesByEventId>,
    ) => {
      // @ts-expect-error — ответ адресует событие, а не локальный черновик
      void actions.sendMessage('reply', localId)
      // @ts-expect-error — конкретная реализация также не должна принимать LocalId
      void matrix.sendMessage('reply', localId)
      // @ts-expect-error — вложение сохраняет ту же семантику ответа
      const options: SendFileOptions = { replyToEventId: localId }
      // @ts-expect-error — ID события не является ключом идемпотентности
      void api.sendReaction({ roomId, txnId: eventId, targetEventId: eventId, key: '👍' })
      // @ts-expect-error — ID пользователя не является ID комнаты
      void api.sendReadReceipt(userId, eventId)
      // @ts-expect-error — индекс событий нельзя читать по transaction ID
      messages.get(txnId)
      // @ts-expect-error — серверный ответ не может содержать ID транзакции вместо события
      const response: Matrix.SendEventResponse = { event_id: txnId }
      return { options, response }
    }
    expectTypeOf(checkCalls).toBeFunction()
  })
})

/**
 * В jsdom нет PointerEvent: без него fireEvent шлёт голый Event без pointerType, и жесты молча
 * игнорируют все касания — отрицательные тесты проходили бы вхолостую.
 * Подключать через `vi.stubGlobal('PointerEvent', TestPointerEvent)`.
 */
export class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string
  readonly isPrimary: boolean

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
    this.pointerType = init.pointerType ?? ''
    this.isPrimary = init.isPrimary ?? false
  }
}

export const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true }

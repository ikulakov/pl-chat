import type { OperatorState } from '../../domain/operator'
import { OperatorStatus } from '../wire/consts'
import { isOperatorCurrent } from '../wire/guards'
import type * as Matrix from '../wire/types'

export function toOperatorState(events: Matrix.ClientEvent[]): OperatorState | undefined {
  const operatorEvent = events.findLast(isOperatorCurrent)
  if (!operatorEvent) return undefined

  const isActive = operatorEvent.content.status === OperatorStatus.Active

  return {
    isActive,
    id: isActive ? (operatorEvent.content.operator_id ?? operatorEvent.sender) : null,
    displayName: isActive ? (operatorEvent.content.displayname ?? null) : null,
  }
}

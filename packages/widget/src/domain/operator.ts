import { MatrixEventType, OperatorStatus } from '../matrix/consts'
import type * as Matrix from '../matrix/types'

export interface OperatorState {
  isActive: boolean
  id: string | null
  displayName: string | null
}

export function reduceOperator(
  current: OperatorState,
  events: Matrix.ClientEvent[],
): OperatorState {
  const operatorEvent = events.findLast(
    (event): event is Matrix.OperatorCurrentEvent =>
      event.type === MatrixEventType.OperatorCurrent && event.state_key === '',
  )
  if (!operatorEvent) return current

  const isActive = operatorEvent.content.status === OperatorStatus.Active

  return {
    isActive,
    id: isActive ? (operatorEvent.content.operator_id ?? operatorEvent.sender) : null,
    displayName: isActive ? (operatorEvent.content.displayname ?? null) : null,
  }
}

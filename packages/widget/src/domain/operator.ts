import type { UserId } from './ids'

export interface OperatorState {
  isActive: boolean
  id: UserId | null
  displayName: string | null
}

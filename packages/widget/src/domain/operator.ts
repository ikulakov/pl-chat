import type { UserId } from '@/shared/types/ids'

export interface OperatorState {
  isActive: boolean
  id: UserId | null
  displayName: string | null
}

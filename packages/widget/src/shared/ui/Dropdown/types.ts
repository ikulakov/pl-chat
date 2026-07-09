import type { Ref } from 'react'

export interface DropdownTriggerProps {
  ref: Ref<HTMLButtonElement>
  onClick: () => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
}

export interface TriggerRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface Dimensions {
  width: number
  height: number
}

export interface Position {
  top: number
  left: number
}

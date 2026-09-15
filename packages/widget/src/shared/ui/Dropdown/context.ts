import { createContext, useContext } from 'react'
import type { DropdownCloseOptions } from './types'

type Close = (options?: DropdownCloseOptions) => void

interface DropdownContextValue {
  close: Close
}

export const DropdownContext = createContext<DropdownContextValue | null>(null)

export function useDropdownClose(): Close {
  const ctx = useContext(DropdownContext)
  if (!ctx) throw new Error('[PLChat] DropdownItem must be used within Dropdown')

  return ctx.close
}

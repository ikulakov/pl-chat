import { createContext, useContext } from 'react'

interface DropdownContextValue {
  close: () => void
}

export const DropdownContext = createContext<DropdownContextValue | null>(null)

export function useDropdownClose(): () => void {
  const ctx = useContext(DropdownContext)
  if (!ctx) throw new Error('[PLChat] DropdownItem must be used within Dropdown')

  return ctx.close
}

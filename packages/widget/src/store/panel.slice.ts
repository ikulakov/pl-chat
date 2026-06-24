import type { HostCommand } from '@bankchat/protocol'
import type { StateCreator } from 'zustand'
import type { HostBridge } from '../bridge'
import type { ConnectionSlice } from './connection.slice'

export interface PanelSlice {
  isOpen: boolean
  handleCommand: (cmd: HostCommand) => void
  closePanel: () => void
}

type BoundStore = PanelSlice & ConnectionSlice

export const createPanelSlice =
  (bridge: HostBridge): StateCreator<BoundStore, [], [], PanelSlice> =>
  (set, get) => ({
    isOpen: false,

    handleCommand: (cmd) => {
      switch (cmd.type) {
        case 'OPEN':
          if (!get().isOpen) {
            set({ isOpen: true })
            bridge.send({ type: 'OPENED' })
            void get().startSession()
          }
          break
        case 'CLOSE':
          if (get().isOpen) {
            set({ isOpen: false })
            bridge.send({ type: 'CLOSED' })
          }
          break
        case 'TOGGLE':
          get().handleCommand(get().isOpen ? { type: 'CLOSE' } : { type: 'OPEN' })
          break
        case 'INIT':
          break
      }
    },

    closePanel: () => get().handleCommand({ type: 'CLOSE' }),
  })

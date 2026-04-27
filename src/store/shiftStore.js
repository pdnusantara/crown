import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useShiftStore = create(persist(
  (set, get) => ({
    currentShift: null,
    closedShifts: [],

    openShift: (kasirId, branchId) => set({
      currentShift: {
        id: `shift-${Date.now()}`,
        kasirId,
        branchId,
        openedAt: new Date().toISOString(),
        status: 'open',
        transactions: []
      }
    }),

    closeShift: (summary) => {
      const { currentShift } = get()
      if (!currentShift) return
      set(state => ({
        closedShifts: [
          ...state.closedShifts,
          { ...state.currentShift, closedAt: new Date().toISOString(), status: 'closed', summary }
        ],
        currentShift: null
      }))
    },

    addTransaction: (tx) => set(state => ({
      currentShift: state.currentShift
        ? { ...state.currentShift, transactions: [...state.currentShift.transactions, tx] }
        : state.currentShift
    }))
  }),
  { name: 'barberos-shift' }
))

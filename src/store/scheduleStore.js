import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addDays, format } from 'date-fns'

export const useScheduleStore = create(persist(
  (set, get) => ({
    schedules: [],
    addSchedule: (schedule) => set(state => ({
      schedules: [...state.schedules, { ...schedule, id: `sch-${Date.now()}` }]
    })),
    updateSchedule: (id, updates) => set(state => ({
      schedules: state.schedules.map(s => s.id === id ? { ...s, ...updates } : s)
    })),
    deleteSchedule: (id) => set(state => ({
      schedules: state.schedules.filter(s => s.id !== id)
    })),
    getSchedulesByWeek: (tenantId, weekStart) => {
      const days = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), 'yyyy-MM-dd'))
      return get().schedules.filter(s => s.tenantId === tenantId && days.includes(s.date))
    }
  }),
  { name: 'barberos-schedule' }
))

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { initialBookings } from '../data/seed.js'

export const useBookingStore = create(
  persist(
    (set, get) => ({
      bookings: initialBookings,

      addBooking: (booking) => {
        const newBooking = {
          ...booking,
          id: `book-${Date.now()}`,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        set(state => ({ bookings: [newBooking, ...state.bookings] }))
        return newBooking
      },

      updateBooking: (id, updates) => {
        set(state => ({
          bookings: state.bookings.map(b => b.id === id ? { ...b, ...updates } : b)
        }))
      },

      cancelBooking: (id) => {
        set(state => ({
          bookings: state.bookings.map(b => b.id === id ? { ...b, status: 'cancelled' } : b)
        }))
      },

      confirmBooking: (id) => {
        set(state => ({
          bookings: state.bookings.map(b => b.id === id ? { ...b, status: 'confirmed' } : b)
        }))
      },

      getByTenant: (tenantId) => get().bookings.filter(b => b.tenantId === tenantId),
      getByBranch: (branchId) => get().bookings.filter(b => b.branchId === branchId),
      getByDate: (date) => get().bookings.filter(b => b.date === date),
      getUpcoming: () => {
        const today = new Date().toISOString().split('T')[0]
        return get().bookings.filter(b => b.date >= today && b.status !== 'cancelled')
      },
    }),
    {
      name: 'barberos-booking',
    }
  )
)

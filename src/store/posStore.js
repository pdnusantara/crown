import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const usePosStore = create(
  persist(
    (set, get) => ({
      cartItems: [],
      selectedCustomer: null,
      discountType: 'percentage', // 'percentage' | 'flat' | 'voucher'
      discountValue: 0,
      voucherCode: '',
      paymentMethod: 'cash',
      cashReceived: 0,
      lastTransaction: null,
      transactions: [],

      // Cart actions
      addToCart: (service) => {
        set(state => {
          const existing = state.cartItems.find(item => item.serviceId === service.id)
          if (existing) return state
          return {
            cartItems: [...state.cartItems, {
              id: `cart-${Date.now()}`,
              serviceId: service.id,
              name: service.name,
              price: service.price,
              duration: service.duration,
              barberId: null,
              barberName: null,
            }]
          }
        })
      },

      removeFromCart: (itemId) => {
        set(state => ({ cartItems: state.cartItems.filter(item => item.id !== itemId) }))
      },

      updateCartItemBarber: (itemId, barberId, barberName) => {
        set(state => ({
          cartItems: state.cartItems.map(item =>
            item.id === itemId ? { ...item, barberId, barberName } : item
          )
        }))
      },

      clearCart: () => {
        set({
          cartItems: [],
          selectedCustomer: null,
          discountType: 'percentage',
          discountValue: 0,
          voucherCode: '',
          paymentMethod: 'cash',
          cashReceived: 0,
        })
      },

      setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),

      setDiscount: (type, value) => set({ discountType: type, discountValue: value }),

      setVoucherCode: (code) => set({ voucherCode: code }),

      setPaymentMethod: (method) => set({ paymentMethod: method }),

      setCashReceived: (amount) => set({ cashReceived: amount }),

      // Calculations
      getSubtotal: () => get().cartItems.reduce((sum, item) => sum + item.price, 0),

      getDiscountAmount: () => {
        const subtotal = get().getSubtotal()
        const { discountType, discountValue } = get()
        if (discountType === 'percentage') return Math.round(subtotal * discountValue / 100)
        if (discountType === 'flat') return Math.min(discountValue, subtotal)
        return 0
      },

      getTax: () => {
        const subtotal = get().getSubtotal()
        const discount = get().getDiscountAmount()
        return Math.round((subtotal - discount) * 0.1)
      },

      getTotal: () => {
        const subtotal = get().getSubtotal()
        const discount = get().getDiscountAmount()
        const tax = get().getTax()
        return subtotal - discount + tax
      },

      getChange: () => {
        const total = get().getTotal()
        const cash = get().cashReceived
        return Math.max(0, cash - total)
      },

      // Complete transaction
      completeTransaction: async (tenantId, branchId, shiftId = null) => {
        const state = get()
        const payload = {
          tenantId,
          branchId,
          shiftId,
          customerId: state.selectedCustomer?.id || null,
          subtotal: state.getSubtotal(),
          discountType: state.discountType,
          discountValue: state.discountValue,
          tax: state.getTax(),
          total: state.getTotal(),
          paymentMethod: state.paymentMethod,
          cashReceived: state.cashReceived,
          change: state.getChange(),
          items: state.cartItems.map(item => ({
            serviceId: item.serviceId,
            barberId: item.barberId || null,
            name: item.name,
            price: item.price,
          })),
        }

        // Call API (non-blocking, don't fail if offline)
        let txnId = `txn-${Date.now()}`
        try {
          const res = await import('../lib/api.js').then(m => m.default.post('/transactions', payload))
          txnId = res.data.data.id
        } catch (e) {
          console.warn('Transaction API call failed, using local ID', e.message)
        }

        const transaction = {
          id: txnId,
          ...payload,
          customer: state.selectedCustomer,
          customerName: state.selectedCustomer?.name || 'Walk-in Customer',
          services: state.cartItems.map(item => ({
            serviceId: item.serviceId,
            name: item.name,
            price: item.price,
            barberId: item.barberId,
            barberName: item.barberName,
          })),
          discountAmount: state.getDiscountAmount(),
          createdAt: new Date().toISOString(),
          status: 'completed',
        }

        set(s => ({ lastTransaction: transaction, transactions: [transaction, ...s.transactions] }))
        return transaction
      },
    }),
    {
      name: 'barberos-pos',
      partialize: (state) => ({
        transactions: state.transactions,
        lastTransaction: state.lastTransaction,
      }),
    }
  )
)

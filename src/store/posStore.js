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
      // Barber yang melayani transaksi — satu pilihan untuk semua layanan dalam
      // 1 transaksi. Persisted supaya kasir tidak ulang pilih tiap transaksi.
      defaultBarberId: null,
      defaultBarberName: null,

      // Set barber default + update SEMUA item di cart sekaligus.
      setDefaultBarber: (barberId, barberName) => {
        set(state => ({
          defaultBarberId:   barberId   || null,
          defaultBarberName: barberName || null,
          cartItems: state.cartItems.map(item => ({
            ...item,
            barberId:   barberId   || null,
            barberName: barberName || null,
          })),
        }))
      },

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
              barberId:   state.defaultBarberId   || null,
              barberName: state.defaultBarberName || null,
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

      // Pre-load a queue item into the cart — called when kasir clicks "Bayar" on a queue ticket
      loadFromQueue: (queueItem, allServices) => {
        const cartItems = (queueItem.services || [])
          .map((svcName, i) => {
            const svc = allServices.find(s => s.name === svcName)
            if (!svc) return null
            return {
              id: `cart-q-${i}-${Date.now()}`,
              serviceId: svc.id,
              name: svc.name,
              price: svc.price,
              duration: svc.duration,
              barberId: queueItem.staffId || null,
              barberName: queueItem.staffName || null,
            }
          })
          .filter(Boolean)

        set({
          cartItems,
          selectedCustomer: queueItem.customerId
            ? { id: queueItem.customerId, name: queueItem.customerName, phone: queueItem.phone }
            : null,
          discountType: 'percentage',
          discountValue: 0,
          voucherCode: '',
          paymentMethod: 'cash',
          cashReceived: 0,
          defaultBarberId:   queueItem.staffId   || null,
          defaultBarberName: queueItem.staffName || null,
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

      getTax: () => 0,

      getTotal: () => {
        const subtotal = get().getSubtotal()
        const discount = get().getDiscountAmount()
        return subtotal - discount
      },

      getChange: () => {
        const total = get().getTotal()
        const cash = get().cashReceived
        return Math.max(0, cash - total)
      },

      // Complete transaction
      // opts: { queueId, customerName, customerPhone } — opsional. queueId
      // dipakai backend untuk auto-link ke booking + auto-upsert customer agar
      // walk-in dari kasir juga tercatat di /admin/customers.
      completeTransaction: async (tenantId, branchId, shiftId = null, opts = {}) => {
        const state = get()
        const payload = {
          tenantId,
          branchId,
          shiftId,
          queueId: opts.queueId || null,
          customerId: state.selectedCustomer?.id || null,
          // Snapshot nama/telp pelanggan — penting untuk walk-in tanpa
          // selectedCustomer agar backend bisa upsert ke daftar pelanggan.
          customerName: state.selectedCustomer?.name || opts.customerName || null,
          customerPhone: state.selectedCustomer?.phone || opts.customerPhone || null,
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

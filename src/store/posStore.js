import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { calcRedeemValue, maxRedeemablePoints, validateRedeem } from '../utils/loyalty.js'

export const usePosStore = create(
  persist(
    (set, get) => ({
      cartItems: [],
      selectedCustomer: null,
      discountType: 'percentage', // 'percentage' | 'flat' | 'voucher'
      discountValue: 0,
      voucherCode: '',
      pointsToRedeem: 0, // poin yang akan ditukar pada transaksi ini
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
        // Clamp redeem points kalau subtotal jadi lebih kecil dari yang ditukar
        get().setPointsToRedeem(get().pointsToRedeem)
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
          pointsToRedeem: 0,
          paymentMethod: 'cash',
          cashReceived: 0,
        })
      },

      // Pulihkan draft tersimpan. Set cartItems APA ADANYA (jaga serviceId asli) —
      // JANGAN lewat addToCart yang memperlakukan argumen sbg service (bikin
      // serviceId tertimpa id cart). Ikut pulihkan customer & diskon.
      restoreDraft: ({ cartItems = [], customer = null, discount = null } = {}) => {
        set({
          cartItems: (Array.isArray(cartItems) ? cartItems : []).map((it, i) => ({
            id: it.id || `cart-${Date.now()}-${i}`,
            serviceId: it.serviceId,
            name: it.name,
            price: it.price,
            duration: it.duration,
            barberId: it.barberId || null,
            barberName: it.barberName || null,
          })),
          selectedCustomer: customer || null,
          ...(discount && discount.type
            ? { discountType: discount.type, discountValue: Math.max(0, Math.floor(Number(discount.value) || 0)) }
            : {}),
        })
      },

      // Pre-load a queue item into the cart — called when kasir clicks "Bayar" on a queue ticket.
      // Booking bisa >1 layanan: utamakan cocokkan via serviceIds (paling akurat);
      // fallback ke nama, dan pecah entri lama yang tergabung ("A + B") supaya
      // antrian booking lama tetap terisi penuh.
      loadFromQueue: (queueItem, allServices) => {
        const byId = new Map(allServices.map(s => [s.id, s]))
        const byName = new Map(allServices.map(s => [s.name, s]))

        let matched = []
        const ids = Array.isArray(queueItem.serviceIds) ? queueItem.serviceIds.filter(Boolean) : []
        if (ids.length) {
          matched = ids.map(id => byId.get(id)).filter(Boolean)
        }
        if (!matched.length) {
          const names = (queueItem.services || [])
            .flatMap(n => (byName.has(n) ? [n] : String(n).split(' + ')))
            .map(n => n.trim())
            .filter(Boolean)
          matched = names.map(n => byName.get(n)).filter(Boolean)
        }

        const cartItems = matched.map((svc, i) => ({
          id: `cart-q-${i}-${Date.now()}`,
          serviceId: svc.id,
          name: svc.name,
          price: svc.price,
          duration: svc.duration,
          barberId: queueItem.staffId || null,
          barberName: queueItem.staffName || null,
        }))

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

      setSelectedCustomer: (customer) => set({ selectedCustomer: customer, pointsToRedeem: 0 }),

      // Clamp di sumber: persentase 0–100, nominal ≥0. Cegah nilai >100% (atau
      // negatif) tersimpan & terkirim ke backend → laporan/struk tak ngawur.
      setDiscount: (type, value) => {
        const v = Math.max(0, Math.floor(Number(value) || 0))
        set({ discountType: type, discountValue: type === 'percentage' ? Math.min(100, v) : v })
      },

      setVoucherCode: (code) => set({ voucherCode: code }),

      setPaymentMethod: (method) => set({ paymentMethod: method }),

      setCashReceived: (amount) => set({ cashReceived: amount }),

      /**
       * Set jumlah poin yang akan ditukar.
       * Auto-clamp ke `maxRedeemablePoints` berdasarkan saldo customer & subtotal.
       * Kalau customer belum dipilih atau saldo tidak cukup → di-reset ke 0.
       */
      setPointsToRedeem: (points) => {
        const { selectedCustomer } = get()
        const subtotal = get().getSubtotal()
        const balance  = selectedCustomer?.loyaltyPoints || 0
        const requested = Math.max(0, Math.floor(Number(points) || 0))
        const cap = maxRedeemablePoints({ balance, subtotal })
        set({ pointsToRedeem: Math.min(requested, cap) })
      },

      /** Validasi sisi client — pesan error string atau null. */
      getRedeemError: () => {
        const { selectedCustomer, pointsToRedeem } = get()
        return validateRedeem({
          points: pointsToRedeem,
          balance: selectedCustomer?.loyaltyPoints || 0,
          subtotal: get().getSubtotal(),
        })
      },

      // Calculations
      getSubtotal: () => get().cartItems.reduce((sum, item) => sum + item.price, 0),

      // Diskon dari discount manual/persentase/flat — terpisah dari diskon poin.
      getManualDiscountAmount: () => {
        const subtotal = get().getSubtotal()
        const { discountType, discountValue } = get()
        if (discountType === 'percentage') return Math.round(subtotal * discountValue / 100)
        if (discountType === 'flat') return Math.min(discountValue, subtotal)
        return 0
      },

      /** Nilai rupiah diskon dari poin yang ditukar. */
      getPointsDiscountAmount: () => calcRedeemValue(get().pointsToRedeem),

      /**
       * Total diskon (manual + poin), capped agar tidak melebihi subtotal.
       * Ini yang dikirim sebagai `discountAmount` ke backend.
       */
      getDiscountAmount: () => {
        const subtotal = get().getSubtotal()
        const manual = get().getManualDiscountAmount()
        const points = get().getPointsDiscountAmount()
        return Math.min(subtotal, manual + points)
      },

      getTax: () => 0,

      getTotal: () => {
        const subtotal = get().getSubtotal()
        const discount = get().getDiscountAmount()
        return Math.max(0, subtotal - discount)
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
          discountAmount: state.getDiscountAmount(),
          // Backend yang validasi + naikkan usedCount voucher (atomik) & balikkan
          // saat refund. JANGAN naikkan dari klien lagi → cegah hitung ganda.
          voucherCode: state.voucherCode || null,
          pointsRedeemed: state.pointsToRedeem || 0,
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

        // Transaksi WAJIB tersimpan di server. Kalau POST gagal, lempar error
        // apa adanya — JANGAN palsukan id lokal. Id palsu (`txn-...`) bikin
        // struk & rating mengacu transaksi yang tidak ada di DB → muncul
        // "transaksi tidak ditemukan", dan penjualan gagal terlihat sukses.
        const api = (await import('../lib/api.js')).default
        const res = await api.post('/transactions', payload)
        const saved = res.data.data

        const transaction = {
          id: saved.id,
          ...payload,
          customer: state.selectedCustomer,
          customerName: state.selectedCustomer?.name || 'Walk-in Customer',
          // Notifikasi WA otomatis ke pelanggan sudah/akan dikirim server →
          // struk tak perlu tampilkan tombol "Share WA" manual.
          customerWhatsappQueued: !!res.data.customerWhatsappQueued,
          // Penutup kustom untuk pesan WA share manual (null = pakai default).
          waShareMessage: res.data.waShareMessage || null,
          services: state.cartItems.map(item => ({
            serviceId: item.serviceId,
            name: item.name,
            price: item.price,
            barberId: item.barberId,
            barberName: item.barberName,
          })),
          discountAmount: state.getDiscountAmount(),
          createdAt: saved.createdAt || new Date().toISOString(),
          status: saved.status || 'completed',
        }

        // Batasi 20 transaksi terakhir agar localStorage tak tumbuh tanpa batas
        // (QuotaExceeded bisa diam-diam merusak autosave draft).
        set(s => ({ lastTransaction: transaction, transactions: [transaction, ...s.transactions].slice(0, 20) }))
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

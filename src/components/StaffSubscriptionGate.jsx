import React from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Lock, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { useSubscription } from '../hooks/useSubscription.js'
import { isSubscriptionLocked } from './SubscriptionGate.jsx'
import LoadingScreen from './ui/LoadingScreen.jsx'

// Untuk kasir & barber: bila langganan toko berakhir, blokir seluruh aplikasi
// dengan lock screen. Mereka tak punya halaman Billing, jadi diarahkan
// menghubungi pemilik toko. Pemilik (tenant_admin) ditangani SubscriptionGate
// yang mengunci ke /admin/billing.
export default function StaffSubscriptionGate() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { data: sub, isLoading, isError } = useSubscription(user?.tenantId)

  if (isLoading) return <LoadingScreen />

  // Fail-open: gagal dimuat / tenant belum punya subscription (404) → jangan
  // blokir, hindari mengunci staf karena error transien.
  if (isError || !sub || !isSubscriptionLocked(sub)) return <Outlet />

  const handleLogout = async () => {
    await useAuthStore.getState().logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-semibold text-off-white mb-2">
          Langganan Toko Berakhir
        </h1>
        <p className="text-muted text-sm mb-2">
          Aplikasi tidak bisa digunakan untuk transaksi, antrian, maupun booking
          karena masa langganan toko telah berakhir.
        </p>
        <p className="text-muted text-sm mb-6">
          Silakan hubungi <span className="text-brand font-medium">pemilik toko</span> untuk
          memperpanjang langganan.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-dark-border rounded-xl text-muted hover:text-off-white hover:border-brand/30 transition-colors text-sm"
        >
          <LogOut size={14} />
          Keluar
        </button>
      </div>
    </div>
  )
}

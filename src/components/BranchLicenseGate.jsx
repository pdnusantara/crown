import React from 'react'
import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { Lock, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { useBranches } from '../hooks/useBranches.js'
import LoadingScreen from './ui/LoadingScreen.jsx'

// Memblokir halaman ber-scope cabang (kasir / barber) ketika cabangnya belum
// berlisensi. Sumber branchId: param URL (kasir pakai `/:branchId/kasir/...`)
// atau `user.branchId` untuk barber yang terikat ke satu cabang.
//
// super_admin & tenant_admin dilewati — mereka butuh akses penuh untuk melihat
// & mengelola cabang yang belum berlisensi (badge "Belum berlisensi" muncul di
// halaman cabang).
export default function BranchLicenseGate() {
  const { user } = useAuthStore()
  const { branchId: paramBranchId } = useParams()
  const navigate = useNavigate()
  const branchId = paramBranchId || user?.branchId
  const { data: branches = [], isLoading } = useBranches(user?.tenantId)

  if (user?.role === 'super_admin' || user?.role === 'tenant_admin') {
    return <Outlet />
  }

  if (isLoading) return <LoadingScreen />

  const branch = branches.find((b) => b.id === branchId || b.code === branchId)
  if (!branch || branch.isLicensed !== false) return <Outlet />

  const handleLogout = async () => {
    await useAuthStore.getState().logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Lock className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-semibold text-off-white mb-2">
          Cabang Belum Berlisensi
        </h1>
        <p className="text-muted text-sm mb-2">
          Cabang <span className="text-off-white font-medium">{branch.name}</span> belum
          memiliki lisensi aktif sehingga tidak bisa digunakan untuk transaksi, antrian,
          maupun booking.
        </p>
        <p className="text-muted text-sm mb-6">
          Silakan hubungi <span className="text-brand font-medium">super admin</span> untuk
          membeli lisensi cabang tambahan.
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

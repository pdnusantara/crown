import React from 'react'
import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore.js'
import { useSubscription } from '../hooks/useSubscription.js'

// Saat langganan tenant berakhir, kunci tenant_admin ke halaman Billing —
// hanya /admin/billing (termasuk cetak invoice) yang boleh dibuka sampai
// langganan dibayar. Dipasang sebagai layout route pembungkus halaman /admin.
const ALLOWED_PREFIXES = ['/admin/billing']

// Langganan dianggap terkunci bila:
//  - status overdue / expired, ATAU
//  - status trial / active tapi endDate sudah lewat — efektif berakhir walau
//    cron harian belum sempat memperbarui statusnya.
// Status 'paused' tidak pernah mengunci (tenant sengaja menjeda).
export function isSubscriptionLocked(sub) {
  if (!sub) return false
  if (sub.status === 'paused') return false
  if (sub.status === 'overdue' || sub.status === 'expired') return true
  if ((sub.status === 'trial' || sub.status === 'active') && sub.endDate) {
    return new Date(sub.endDate).getTime() < Date.now()
  }
  return false
}

export default function SubscriptionGate() {
  const { user } = useAuthStore()
  const { data: sub, isLoading, isError } = useSubscription(user?.tenantId)
  const location = useLocation()

  // Fail-open: jangan kunci saat data belum siap, gagal dimuat, atau tenant
  // belum punya subscription (404) — hindari mengunci karena error transien.
  if (isLoading || isError || !sub) return <Outlet />

  if (!isSubscriptionLocked(sub)) return <Outlet />

  const onBillingPage = ALLOWED_PREFIXES.some(p => location.pathname.startsWith(p))
  if (onBillingPage) return <Outlet />

  return <Navigate to="/admin/billing?locked=1" replace />
}

import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { LogOut, DollarSign, Receipt, TrendingUp, CheckCircle, Download, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useShiftStore } from '../../store/shiftStore.js'
import { usePosStore } from '../../store/posStore.js'
import { useActiveShift, useCloseShift } from '../../hooks/useShifts.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import { Card, CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah } from '../../utils/format.js'

// Shift summary derived from posStore local transactions + API shift data
function useShiftSummary(branchId, t) {
  const { transactions } = usePosStore()
  const { currentShift }  = useShiftStore()

  return useMemo(() => {
    const today    = new Date().toDateString()
    const todayTxn = transactions.filter(t =>
      new Date(t.createdAt).toDateString() === today &&
      (!branchId || t.branchId === branchId)
    )

    const paymentBreakdown = {
      cash:     { label: t('pos.cash'),     amount: 0, count: 0, icon: '💵' },
      transfer: { label: t('pos.transfer'), amount: 0, count: 0, icon: '🏦' },
      qris:     { label: t('pos.qris'),     amount: 0, count: 0, icon: '📱' },
      card:     { label: t('pos.card'),     amount: 0, count: 0, icon: '💳' },
    }
    todayTxn.forEach(t => {
      const method = t.paymentMethod || 'cash'
      if (paymentBreakdown[method]) {
        paymentBreakdown[method].amount += t.total || 0
        paymentBreakdown[method].count  += 1
      }
    })

    const totalRevenue      = todayTxn.reduce((s, t) => s + (t.total || 0), 0)
    const totalTransactions = todayTxn.length

    const serviceMap = {}
    todayTxn.forEach(t => {
      t.services?.forEach(s => {
        if (!serviceMap[s.name]) serviceMap[s.name] = { name: s.name, count: 0, revenue: 0 }
        serviceMap[s.name].count   += 1
        serviceMap[s.name].revenue += s.price || 0
      })
    })
    const topServices = Object.values(serviceMap).sort((a, b) => b.count - a.count).slice(0, 5)

    const barberMap = {}
    todayTxn.forEach(t => {
      t.services?.forEach(s => {
        if (!s.barberId || !s.barberName) return
        if (!barberMap[s.barberId]) barberMap[s.barberId] = { name: s.barberName, transactions: 0, revenue: 0, commission: 0 }
        barberMap[s.barberId].transactions += 1
        barberMap[s.barberId].revenue      += s.price || 0
        barberMap[s.barberId].commission   += Math.round((s.price || 0) * 0.3)
      })
    })
    const barberSummary = Object.values(barberMap).sort((a, b) => b.revenue - a.revenue)

    const openedAt = currentShift
      ? new Date(currentShift.openedAt)
      : (() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d })()

    return { paymentBreakdown, totalRevenue, totalTransactions, topServices, barberSummary, openedAt }
  }, [transactions, branchId, currentShift, t])
}

export default function ShiftClosingPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { closeShift, currentShift } = useShiftStore()
  const { data: activeShift } = useActiveShift(user?.branchId)
  const closeShiftMutation = useCloseShift()
  const toast = useToast()
  const [showConfirm, setShowConfirm] = useState(false)
  const [closed, setClosed] = useState(false)
  const [closedAt, setClosedAt] = useState(null)

  const summary = useShiftSummary(user?.branchId, t)

  const handleClose = async () => {
    const now = new Date()
    try {
      // Close via API if we have an active shift ID
      const shiftId = activeShift?.id || currentShift?.id
      if (shiftId) {
        await closeShiftMutation.mutateAsync({ id: shiftId, branchId: user?.branchId })
      }
    } catch (e) {
      console.warn('Shift close API failed:', e.message)
    }
    // Always close locally too
    closeShift(summary)
    setClosed(true)
    setClosedAt(now)
    setShowConfirm(false)
    toast.success(t('shift.closedSuccessToast'))
  }

  const handleExport = () => {
    const lines = [
      t('shift.exportTitle'),
      t('shift.exportDate', { date: format(new Date(), 'dd MMMM yyyy', { locale: idLocale }) }),
      t('shift.exportCashier', { name: user?.name }),
      t('shift.exportOpened', { time: format(summary.openedAt, 'HH:mm') }),
      closedAt ? t('shift.exportClosed', { time: format(closedAt, 'HH:mm') }) : '',
      '',
      t('shift.exportSummaryHeader'),
      t('shift.exportTotalTx', { count: summary.totalTransactions }),
      t('shift.exportTotalRevenue', { amount: formatRupiah(summary.totalRevenue) }),
      '',
      t('shift.exportPaymentHeader'),
      ...Object.values(summary.paymentBreakdown).map(p => t('shift.exportPaymentLine', { label: p.label, amount: formatRupiah(p.amount), count: p.count })),
      '',
      t('shift.exportTopServicesHeader'),
      ...summary.topServices.map((s, i) => t('shift.exportServiceLine', { rank: i + 1, name: s.name, count: s.count, revenue: formatRupiah(s.revenue) })),
      '',
      t('shift.exportBarberHeader'),
      ...summary.barberSummary.map(b => t('shift.exportBarberLine', { name: b.name, transactions: b.transactions, revenue: formatRupiah(b.revenue), commission: formatRupiah(b.commission) })),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shift-closing-${format(new Date(), 'yyyy-MM-dd-HHmm')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('shift.recapDownloadedToast'))
  }

  if (closed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center min-h-[60vh] text-center"
      >
        <div className="w-20 h-20 rounded-full bg-green-950/50 border border-green-500/30 flex items-center justify-center mb-4">
          <CheckCircle size={36} className="text-green-400" />
        </div>
        <h2 className="text-2xl font-display font-bold text-off-white mb-2">{t('shift.shiftClosedHeading')}</h2>
        <p className="text-muted mb-1">
          {t('shift.closedByAt', { time: closedAt ? format(closedAt, 'HH:mm') : '-', name: user?.name })}
        </p>
        <p className="text-muted mb-6">
          {t('shift.totalShiftRevenue')} <span className="text-gold font-semibold">{formatRupiah(summary.totalRevenue)}</span>
        </p>
        <div className="flex gap-3">
          <Button icon={Download} onClick={handleExport}>{t('shift.downloadRecap')}</Button>
          <Button variant="secondary" onClick={() => window.location.href = '/'}>{t('shift.backToLogin')}</Button>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('shift.closingTitle')}</h1>
          <p className="text-muted text-sm mt-1">
            {format(new Date(), 'EEEE, dd MMMM yyyy', { locale: idLocale })} •
            {' '}{t('shift.openedAt', { time: format(summary.openedAt, 'HH:mm') })} •
            {' '}{t('shift.cashier', { name: user?.name })}
          </p>
        </div>
        <Badge variant="warning" dot>{t('shift.activeShift')}</Badge>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('shift.totalTransactions'), value: summary.totalTransactions, icon: Receipt, color: 'text-blue-400' },
          { label: t('shift.totalRevenue'), value: formatRupiah(summary.totalRevenue), icon: DollarSign, color: 'text-gold' },
          { label: t('shift.avgPerTx'), value: formatRupiah(Math.round(summary.totalRevenue / summary.totalTransactions)), icon: TrendingUp, color: 'text-green-400' },
          { label: t('shift.shiftDuration'), value: t('shift.durationFormat', { hours: Math.floor((Date.now() - summary.openedAt.getTime()) / 3600000), minutes: Math.floor(((Date.now() - summary.openedAt.getTime()) % 3600000) / 60000) }), icon: Clock, color: 'text-purple-400' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon size={16} className={kpi.color} />
                <span className="text-xs text-muted">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold text-off-white">{kpi.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Payment breakdown */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-off-white">{t('shift.paymentBreakdown')}</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {Object.values(summary.paymentBreakdown).map((p) => (
              <div key={p.label} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{p.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-off-white">{p.label}</p>
                    <p className="text-xs text-muted">{t('shift.transactionCount', { count: p.count })}</p>
                  </div>
                </div>
                <span className="font-semibold text-gold">{formatRupiah(p.amount)}</span>
              </div>
            ))}
            <div className="border-t border-dark-border pt-3 flex justify-between">
              <span className="font-semibold text-off-white">{t('common.total')}</span>
              <span className="font-bold text-gold text-lg">{formatRupiah(summary.totalRevenue)}</span>
            </div>
          </CardBody>
        </Card>

        {/* Top services */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-off-white">{t('shift.topServices')}</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {summary.topServices.map((s, i) => (
              <div key={s.name} className="flex items-center gap-3">
                <span className={`w-6 text-center font-bold text-sm ${i === 0 ? 'text-gold' : i === 1 ? 'text-gray-300' : 'text-muted'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-off-white truncate">{s.name}</p>
                  <div className="w-full bg-dark-card rounded-full h-1.5 mt-1">
                    <div
                      className="h-1.5 rounded-full bg-gold"
                      style={{ width: `${(s.count / summary.topServices[0].count) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-muted">{s.count}x</p>
                  <p className="text-xs font-medium text-gold">{formatRupiah(s.revenue)}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Barber summary */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-off-white">{t('shift.barberPerformance')}</h3>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border text-xs text-muted">
                <th className="px-4 py-3 text-left">{t('shift.tableBarber')}</th>
                <th className="px-4 py-3 text-right">{t('shift.tableTransactions')}</th>
                <th className="px-4 py-3 text-right">{t('shift.tableRevenue')}</th>
                <th className="px-4 py-3 text-right">{t('shift.tableCommission')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.barberSummary.map((b) => (
                <tr key={b.name} className="border-b border-dark-border/50">
                  <td className="px-4 py-3 text-off-white font-medium">{b.name}</td>
                  <td className="px-4 py-3 text-right text-off-white">{b.transactions}</td>
                  <td className="px-4 py-3 text-right text-gold">{formatRupiah(b.revenue)}</td>
                  <td className="px-4 py-3 text-right text-green-400 font-medium">{formatRupiah(b.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="secondary" icon={Download} onClick={handleExport}>{t('shift.downloadRecap')}</Button>
        <Button
          icon={LogOut}
          onClick={() => setShowConfirm(true)}
          className="bg-red-600 hover:bg-red-500 text-white border-0"
        >
          {t('shift.closeShift')}
        </Button>
      </div>

      {/* Confirmation modal */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title={t('shift.confirmCloseTitle')}>
        <div className="space-y-4">
          <p className="text-muted text-sm">
            {t('shift.confirmCloseDesc')}
          </p>
          <div className="bg-dark-card rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-gold">{formatRupiah(summary.totalRevenue)}</p>
            <p className="text-muted text-sm mt-1">{t('shift.transactionCount', { count: summary.totalTransactions })}</p>
          </div>
          <p className="text-xs text-muted">
            {t('shift.confirmCloseWarning')}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setShowConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              fullWidth
              onClick={handleClose}
              className="bg-red-600 hover:bg-red-500 text-white border-0"
            >
              {t('shift.confirmCloseButton')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

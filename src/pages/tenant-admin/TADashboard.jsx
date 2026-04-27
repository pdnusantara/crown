import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  DollarSign, Receipt, UserPlus, ArrowUpRight, ArrowDownRight,
  Crown, Minus, CalendarDays, Users, BarChart3, MapPin, Tag, Clock,
  TrendingUp, Zap, Building2,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useBranches } from '../../hooks/useBranches.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useReportSummary, useYesterdayStats, useDailyReport, useBarberReport, useServiceReport } from '../../hooks/useReports.js'
import { useActiveShift } from '../../hooks/useShifts.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah } from '../../utils/format.js'

// ── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 11) return 'Selamat Pagi'
  if (h < 15) return 'Selamat Siang'
  if (h < 18) return 'Selamat Sore'
  return 'Selamat Malam'
}

function todayLabel() {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function calcTrend(cur, prev) {
  if (prev == null || prev === 0) return null
  const pct = ((cur - prev) / prev * 100)
  return { pct: Math.abs(pct).toFixed(1), dir: cur >= prev ? 'up' : 'down' }
}

function shiftDuration(openedAt) {
  if (!openedAt) return null
  const diff = Date.now() - new Date(openedAt).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}j ${m}m` : `${m} menit`
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({ className }) {
  return <div className={`bg-dark-card animate-pulse rounded-xl ${className}`} />
}

// ── Animated number ───────────────────────────────────────────────────────────
function AnimNum({ value, prefix = '', suffix = '' }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView) return
    const end = typeof value === 'number' ? value : 0
    if (end === 0) { setDisplay(0); return }
    let start = 0
    const step = end / (900 / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= end) { setDisplay(end); clearInterval(timer) }
      else setDisplay(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [inView, value])

  return <span ref={ref}>{prefix}{new Intl.NumberFormat('id-ID').format(display)}{suffix}</span>
}

// ── Trend chip ────────────────────────────────────────────────────────────────
function TrendChip({ trend }) {
  if (!trend) return null
  if (trend.dir === 'up') return (
    <span className="inline-flex items-center gap-0.5 text-xs text-green-400">
      <ArrowUpRight size={13} />+{trend.pct}%
    </span>
  )
  if (trend.dir === 'down') return (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-400">
      <ArrowDownRight size={13} />-{trend.pct}%
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted">
      <Minus size={11} />0%
    </span>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, trend, loading, delay = 0 }) {
  const { t } = useTranslation()
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-5">
        {loading ? (
          <div className="space-y-2">
            <Sk className="h-4 w-24" />
            <Sk className="h-7 w-32" />
            <Sk className="h-3 w-16" />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted mb-1">{title}</p>
              <p className="text-2xl font-bold text-off-white">{value}</p>
              {trend && (
                <div className="flex items-center gap-1 mt-1">
                  <TrendChip trend={trend} />
                  <span className="text-xs text-muted">vs kemarin</span>
                </div>
              )}
            </div>
            <div className="w-11 h-11 rounded-xl bg-gold/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-6 h-6 text-gold" />
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  )
}

// ── Quick Action ──────────────────────────────────────────────────────────────
function QuickAction({ icon: Icon, label, to, color = 'text-gold', bg = 'bg-gold/10' }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-dark-border hover:border-gold/30 hover:bg-dark-surface/60 transition-all group"
    >
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
        <Icon size={18} className={color} />
      </div>
      <span className="text-xs text-muted group-hover:text-off-white transition-colors text-center leading-tight">{label}</span>
    </button>
  )
}

// ── Branch card (calls useActiveShift per-branch — must be a component) ──────
function BranchCard({ branch, staffList }) {
  const { t } = useTranslation()
  const { data: shift, isLoading: shiftLoading } = useActiveShift(branch.id)
  const staffCount = staffList.filter(s => s.branchId === branch.id).length
  const isActive   = branch.isActive !== false && !branch.deletedAt
  const dur        = shift?.openedAt ? shiftDuration(shift.openedAt) : null

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={15} className="text-muted flex-shrink-0" />
          <h4 className="font-medium text-off-white truncate">{branch.name}</h4>
        </div>
        <Badge variant={isActive ? 'success' : 'default'} dot>
          {isActive ? t('common.active') : t('common.inactive')}
        </Badge>
      </div>
      <div className="space-y-2.5 text-sm">
        {/* Shift status */}
        <div className="flex items-center justify-between">
          <span className="text-muted">Shift</span>
          {shiftLoading ? (
            <Sk className="h-3.5 w-20" />
          ) : shift ? (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
              <span className="text-green-400 font-medium">Buka</span>
              {dur && <span className="text-muted text-xs">· {dur}</span>}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-dark-border flex-shrink-0" />
              <span className="text-muted">Tutup</span>
            </div>
          )}
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{t('tenantAdmin.branches.openTime')}</span>
          <span className="text-off-white">
            {branch.openTime && branch.closeTime
              ? `${branch.openTime} – ${branch.closeTime}`
              : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{t('tenantAdmin.dashboard.activeStaff')}</span>
          <span className="text-off-white">{staffCount} orang</span>
        </div>
      </div>
    </Card>
  )
}

// ── Leaderboard row ──────────────────────────────────────────────────────────
function LeaderboardRow({ barber, index, maxRevenue, branchName }) {
  const medals = ['🥇', '🥈', '🥉']
  return (
    <motion.tr
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35 }}
      className="border-b border-dark-border/50 hover:bg-dark-surface/50 transition-colors"
    >
      <td className="px-4 py-3 w-10">
        <span className={`font-bold text-lg ${index === 0 ? 'text-gold' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-amber-700' : 'text-muted'}`}>
          {index < 3 ? medals[index] : index + 1}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar src={barber.photo} name={barber.barberName || barber.name} size="sm" />
          <div>
            <p className="font-medium text-off-white text-sm">{barber.barberName || barber.name}</p>
            {barber.averageRating && (
              <p className="text-xs text-muted">⭐ {barber.averageRating.toFixed(1)}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted text-sm hidden md:table-cell">{branchName}</td>
      <td className="px-4 py-3 text-off-white text-sm text-center">{barber.servicesCount || barber.todayTxns || 0}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-16 bg-dark-card rounded-full h-1.5 hidden lg:block">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((barber.revenue || 0) / maxRevenue) * 100}%` }}
              transition={{ delay: index * 0.07 + 0.3, duration: 0.5 }}
              className="h-1.5 rounded-full bg-gold"
            />
          </div>
          <span className="font-semibold text-gold text-sm">
            Rp <AnimNum value={barber.revenue || 0} />
          </span>
        </div>
      </td>
    </motion.tr>
  )
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      <p className="font-semibold text-gold">{formatRupiah(payload[0].value)}</p>
      {payload[1] && <p className="text-muted">{payload[1].value} transaksi</p>}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function TADashboard() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const tenantId = user?.tenantId

  const { data: tenantBranches = [], isLoading: loadingBranches } = useBranches(tenantId)
  const { data: tenantStaff   = []                               } = useUsers({ tenantId })
  const { data: todayRaw,  isLoading: loadingToday } = useReportSummary(tenantId)
  const { data: yestRaw                             } = useYesterdayStats(tenantId)
  const { data: dailyData  = []                     } = useDailyReport(tenantId, 7)
  const { data: barberReport = []                   } = useBarberReport(tenantId)
  const { data: serviceReport = []                  } = useServiceReport(tenantId)

  // ── Flatten summary data ─────────────────────────────────────────────────
  const today = todayRaw?.summary  ?? {}
  const yest  = yestRaw?.summary   ?? {}

  const revenue      = today.totalRevenue            ?? 0
  const transactions = today.totalTransactions       ?? 0
  const newCustomers = today.totalNewCustomers       ?? 0
  const avgTx        = today.averageTransactionValue ?? 0

  const trendRevenue = calcTrend(revenue,      yest.totalRevenue)
  const trendTxns    = calcTrend(transactions, yest.totalTransactions)
  const trendCusts   = calcTrend(newCustomers, yest.totalNewCustomers)
  const trendAvg     = calcTrend(avgTx,        yest.averageTransactionValue)

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() =>
    dailyData.map(d => ({
      name:         new Date(d.date).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' }),
      revenue:      d.revenue      ?? 0,
      transactions: d.transactions ?? 0,
      isToday:      d.date === new Date().toISOString().split('T')[0],
    })),
    [dailyData]
  )
  const maxChartRevenue = Math.max(...chartData.map(d => d.revenue), 1)

  // ── Top slices ────────────────────────────────────────────────────────────
  const topServices = serviceReport.slice(0, 5)
  const topBarbers  = barberReport.slice(0, 5)
  const maxBarberRev = topBarbers[0]?.revenue || 1

  // ── Quick actions config ──────────────────────────────────────────────────
  const quickActions = [
    { icon: Users,      label: 'Pelanggan Baru',   to: '/admin/customers',      bg: 'bg-blue-400/10',   color: 'text-blue-400'   },
    { icon: BarChart3,  label: 'Laporan',           to: '/admin/reports',        bg: 'bg-gold/10',       color: 'text-gold'       },
    { icon: CalendarDays, label: 'Jadwal',          to: '/admin/schedule',       bg: 'bg-purple-400/10', color: 'text-purple-400' },
    { icon: MapPin,     label: 'Laporan Wilayah',   to: '/admin/wilayah-report', bg: 'bg-green-400/10',  color: 'text-green-400'  },
    { icon: Tag,        label: 'Voucher',           to: '/admin/vouchers',       bg: 'bg-pink-400/10',   color: 'text-pink-400'   },
    { icon: TrendingUp, label: 'Perbandingan',      to: '/admin/comparison',     bg: 'bg-orange-400/10', color: 'text-orange-400' },
  ]

  return (
    <div className="space-y-6">

      {/* Greeting header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{todayLabel()}</p>
          <h1 className="font-display text-2xl font-bold text-off-white mt-0.5">
            {getGreeting()}, <span className="gold-text">{user?.name?.split(' ')[0] || 'Admin'}</span> 👋
          </h1>
          <p className="text-sm text-muted mt-1">{t('tenantAdmin.dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted px-3 py-1.5 rounded-xl bg-dark-card border border-dark-border">
          <Clock size={12} />
          <span>Data diperbarui real-time</span>
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-gold" />
          <p className="text-sm font-medium text-off-white">Aksi Cepat</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {quickActions.map(qa => (
            <QuickAction key={qa.to} {...qa} />
          ))}
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('tenantAdmin.dashboard.todayRevenue')}
          value={formatRupiah(revenue)}
          icon={DollarSign}
          trend={trendRevenue}
          loading={loadingToday}
          delay={0.1}
        />
        <StatCard
          title={t('common.transactions')}
          value={transactions}
          icon={Receipt}
          trend={trendTxns}
          loading={loadingToday}
          delay={0.15}
        />
        <StatCard
          title={t('tenantAdmin.dashboard.newCustomers')}
          value={newCustomers}
          icon={UserPlus}
          trend={trendCusts}
          loading={loadingToday}
          delay={0.2}
        />
        <StatCard
          title="Rata-rata Transaksi"
          value={formatRupiah(avgTx)}
          icon={TrendingUp}
          trend={trendAvg}
          loading={loadingToday}
          delay={0.25}
        />
      </div>

      {/* Revenue chart + Top Services */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-off-white">Tren Pendapatan (7 Hari)</h3>
                {chartData.length > 0 && (
                  <span className="text-xs text-muted">
                    Total: <span className="text-gold font-medium">{formatRupiah(chartData.reduce((s, d) => s + d.revenue, 0))}</span>
                  </span>
                )}
              </div>
            </CardHeader>
            <CardBody>
              {dailyData.length === 0 ? (
                <div className="h-[240px] flex items-center justify-center">
                  <Sk className="h-[220px] w-full" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.isToday ? '#E5C87E' : '#C9A84C'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="h-full">
            <CardHeader>
              <h3 className="font-semibold text-off-white">{t('tenantAdmin.dashboard.topServices')}</h3>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {topServices.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Sk key={i} className="h-8" />)}
                </div>
              ) : topServices.map((svc, i) => {
                const maxCount = Math.max(...topServices.map(s => s.count || 1), 1)
                const pct = ((svc.count || 0) / maxCount) * 100
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`text-sm w-5 font-medium ${i === 0 ? 'text-gold' : 'text-muted'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-off-white truncate">{svc.name}</p>
                      <div className="mt-1 h-1.5 bg-dark-surface rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ delay: i * 0.07 + 0.4, duration: 0.5 }}
                          className="h-full bg-gold rounded-full"
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted flex-shrink-0">{svc.count || 0}x</span>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* Leaderboard */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-gold" />
              <h3 className="font-semibold text-off-white">{t('tenantAdmin.dashboard.leaderboardToday')}</h3>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border text-xs text-muted">
                  <th className="px-4 py-3 text-left font-medium w-10">#</th>
                  <th className="px-4 py-3 text-left font-medium">{t('tenantAdmin.dashboard.colBarber')}</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">{t('nav.branches')}</th>
                  <th className="px-4 py-3 text-center font-medium">Layanan</th>
                  <th className="px-4 py-3 text-left font-medium">{t('common.revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {topBarbers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">
                      {t('tenantAdmin.dashboard.noBarberData')}
                    </td>
                  </tr>
                ) : topBarbers.map((barber, i) => (
                  <LeaderboardRow
                    key={barber.barberId || i}
                    barber={barber}
                    index={i}
                    maxRevenue={maxBarberRev}
                    branchName={tenantBranches.find(b => b.id === barber.branchId)?.name || '—'}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* Branch Performance */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-off-white">{t('tenantAdmin.dashboard.branchPerformance')}</h3>
          <span className="text-xs text-muted">{tenantBranches.length} cabang</span>
        </div>
        {loadingBranches ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Sk key={i} className="h-36" />)}
          </div>
        ) : tenantBranches.length === 0 ? (
          <Card className="p-8 text-center">
            <Building2 size={32} className="text-muted mx-auto mb-2" />
            <p className="text-muted text-sm">Belum ada cabang terdaftar</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenantBranches.map(branch => (
              <BranchCard key={branch.id} branch={branch} staffList={tenantStaff} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}

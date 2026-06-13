import React, { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  MapPin, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, Users, TrendingUp,
  DollarSign, Repeat2, Settings2, AlertCircle, RefreshCw, Download,
  Building2, Home, Sparkles, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale, enUS as enLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useIsFeatureEnabled } from '../../hooks/useFeatureFlags.js'
import { Link } from 'react-router-dom'
import api from '../../lib/api.js'
import { useWilayahReport } from '../../hooks/useWilayahReport.js'
import { useProvinces, useRegencies } from '../../hooks/useWilayah.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { useChartTheme } from '../../utils/chartTheme.js'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIODS = (t) => [
  { value: 'yesterday', label: t('common.yesterday') },
  { value: 'today',     label: t('common.today') },
  { value: 'month',     label: t('common.thisMonth') },
  { value: 'all',       label: t('tenantAdmin.wilayahReport.periodAll') },
]

// Label pembanding chip perubahan — per periode kalender. 'all' tanpa pembanding.
const PREV_LABELS = (t) => ({
  today:     t('tenantAdmin.wilayahReport.vsYesterday'),
  yesterday: t('tenantAdmin.wilayahReport.vsDayBefore'),
  month:     t('tenantAdmin.wilayahReport.vsLastMonth'),
})

const BAR_COLORS = [
  '#E0A82E', '#10B981', '#F59E0B', '#EBC877', '#34D399',
  '#A07830', '#8C6820', '#705018', '#BFA060', '#D9C090',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function pctChange(cur, prev) {
  if (!prev || prev === 0) return null
  if (typeof cur !== 'number') return null
  return +((cur - prev) / prev * 100).toFixed(1)
}

// Kelas badge peringkat — light-mode safe (hanya class ber-override).
function rankBadgeClass(rank) {
  if (rank === 1) return 'bg-brand/20 text-brand'
  if (rank === 2 || rank === 3) return 'bg-dark-surface text-off-white'
  return 'bg-dark-surface text-muted'
}

function ChangeChip({ cur, prev }) {
  const pct = pctChange(cur, prev)
  if (pct === null) return null
  if (pct > 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded-full">
      <ArrowUpRight size={11} />+{pct}%
    </span>
  )
  if (pct < 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded-full">
      <ArrowDownRight size={11} />{pct}%
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted bg-dark-card px-1.5 py-0.5 rounded-full">
      <Minus size={10} />0%
    </span>
  )
}

// Deteksi viewport mobile — dipakai untuk menyusutkan sumbu chart agar batang
// tetap terbaca di layar sempit.
function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < bp
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${bp - 1}px)`)
    const onChange = e => setMobile(e.matches)
    setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [bp])
  return mobile
}

// ── Sortable table header cell ─────────────────────────────────────────────────
function SortHeader({ label, sortKey, sort, onSort, align = 'center' }) {
  const active   = sort.key === sortKey
  const alignCls = align === 'right' ? 'text-right' : align === 'left' ? 'text-left' : 'text-center'
  const justify  = align === 'right' ? 'justify-end' : align === 'left' ? 'justify-start' : 'justify-center'
  return (
    <th className={`py-3 px-4 font-medium ${alignCls}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 w-full ${justify} ${active ? 'text-brand' : 'text-muted'} hover:text-off-white transition-colors`}
      >
        {label}
        {active
          ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
          : <ChevronsUpDown size={12} className="opacity-40" />}
      </button>
    </th>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
// `changeValue` = angka mentah untuk chip perubahan. WAJIB diisi terpisah saat
// `value` sudah ter-format jadi string (mis. rupiah) — kalau tidak, chip salah
// hitung (mengira nilai sekarang 0 → selalu -100%).
function StatCard({ icon: Icon, label, value, prev, changeValue, color = 'text-brand', sub }) {
  const cur = typeof changeValue === 'number' ? changeValue
            : typeof value === 'number' ? value : null
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-dark-surface flex items-center justify-center flex-shrink-0">
          <Icon size={18} className={color} />
        </div>
        {cur !== null && <ChangeChip cur={cur} prev={prev} />}
      </div>
      <p className="mt-3 text-xl sm:text-2xl font-bold text-off-white leading-tight break-words">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
      {sub && <p className="text-xs text-muted/60 mt-0.5">{sub}</p>}
    </Card>
  )
}

// ── Config Panel ──────────────────────────────────────────────────────────────
// Wilayah fokus toko disimpan SERVER-SIDE (Tenant.wilayah) — dipakai bersama
// oleh laporan ini, pemilih kecamatan di kasir, dan halaman booking.
function ConfigPanel({ initial, onSaved, onCancel }) {
  const { t } = useTranslation()
  const { data: provinces = [] } = useProvinces()
  const patchTenant = useAuthStore(s => s.patchTenant)
  const toast = useToast()
  const [provinsiId, setProvinsiId]   = useState(initial?.provinsiId || '')
  const [kabupatenId, setKabupatenId] = useState(initial?.kabupatenId || '')
  const [saving, setSaving]           = useState(false)
  const { data: regencies = [] } = useRegencies(provinsiId)

  function handleProvinsi(e) {
    setProvinsiId(e.target.value)
    setKabupatenId('')
  }

  async function handleSave() {
    if (!kabupatenId || !provinsiId || saving) return
    const prov = provinces.find(p => p.id === provinsiId)
    const kab  = regencies.find(r => r.id === kabupatenId)
    const cfg  = { provinsiId, provinsi: prov?.name || '', kabupatenId, kabupaten: kab?.name || '' }
    setSaving(true)
    try {
      await api.patch('/tenants/me', { wilayah: cfg })
      patchTenant({ wilayah: cfg })
      toast.success(t('tenantAdmin.wilayahReport.areaSaved'))
      onSaved(cfg)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.wilayahReport.areaSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-6 border-brand/20">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
          <MapPin size={18} className="text-brand" />
        </div>
        <div>
          <h3 className="font-semibold text-off-white">
            {initial ? t('tenantAdmin.wilayahReport.changeRegency') : t('tenantAdmin.wilayahReport.pickRegency')}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            {t('tenantAdmin.wilayahReport.regencyHint')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">{t('tenantAdmin.wilayahReport.province')}</label>
          <div className="relative">
            <select
              value={provinsiId}
              onChange={handleProvinsi}
              className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 pr-8 text-sm outline-none focus:border-brand/60 transition-all"
            >
              <option value="">{t('tenantAdmin.wilayahReport.selectProvince')}</option>
              {provinces.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">{t('tenantAdmin.wilayahReport.regency')}</label>
          <div className="relative">
            <select
              value={kabupatenId}
              onChange={e => setKabupatenId(e.target.value)}
              disabled={!provinsiId}
              className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 pr-8 text-sm outline-none focus:border-brand/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <option value="">{provinsiId ? t('tenantAdmin.wilayahReport.selectRegency') : t('tenantAdmin.wilayahReport.selectProvinceFirst')}</option>
              {regencies.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={!kabupatenId || saving}
          className="flex-1 sm:flex-none"
        >
          {saving ? t('tenantAdmin.wilayahReport.saving') : initial ? t('tenantAdmin.wilayahReport.saveChanges') : t('tenantAdmin.wilayahReport.startAnalysis')}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>{t('common.cancel')}</Button>
        )}
      </div>
    </Card>
  )
}

// ── Custom Tooltip for recharts ────────────────────────────────────────────────
function CustomTooltip({ active, payload }) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-off-white mb-1">{d.kecamatan}</p>
      <p className="text-muted">{t('tenantAdmin.wilayahReport.visits')}: <span className="text-off-white font-medium">{d.visitCount}</span></p>
      <p className="text-muted">{t('tenantAdmin.wilayahReport.customers')}: <span className="text-off-white font-medium">{d.customerCount}</span></p>
      <p className="text-muted">{t('tenantAdmin.wilayahReport.revenue')}: <span className="text-brand font-medium">{formatRupiah(d.revenue)}</span></p>
    </div>
  )
}

// ── Kecamatan Row ─────────────────────────────────────────────────────────────
function KecamatanRow({ kec, rank, totalVisits, isExpanded, onToggle }) {
  const { t } = useTranslation()
  const pct = totalVisits > 0 ? (kec.visitCount / totalVisits * 100).toFixed(1) : 0

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-dark-border hover:bg-dark-surface/40 cursor-pointer transition-colors"
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${rankBadgeClass(rank)}`}>
              {rank}
            </span>
            <div>
              <p className="text-sm font-medium text-off-white leading-none">{kec.kecamatan}</p>
              <p className="text-xs text-muted mt-0.5">{t('tenantAdmin.wilayahReport.villagesCount', { count: kec.kelurahan.length })}</p>
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-center">
          <span className="font-semibold text-off-white">{kec.customerCount}</span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-dark-surface rounded-full overflow-hidden min-w-[60px]">
              <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-semibold text-off-white w-8 text-right">{kec.visitCount}</span>
            <ChangeChip cur={kec.visitCount} prev={kec.prevVisitCount} />
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-right text-brand font-medium">
          {formatRupiah(kec.revenue)}
        </td>
        <td className="py-3 px-4 text-sm text-center text-muted">
          {kec.avgVisitPerCustomer}x
        </td>
        <td className="py-3 px-4 text-center">
          {kec.kelurahan.length > 0 && (
            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} className="inline-block">
              <ChevronRight size={14} className="text-muted" />
            </motion.div>
          )}
        </td>
      </tr>

      <AnimatePresence>
        {isExpanded && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <td colSpan={6} className="p-0">
              <div className="bg-dark-surface/30 border-b border-dark-border">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-muted border-b border-dark-border/50">
                      <th className="py-2 px-8 text-left font-medium">{t('tenantAdmin.wilayahReport.village')}</th>
                      <th className="py-2 px-4 text-center font-medium">{t('tenantAdmin.wilayahReport.customers')}</th>
                      <th className="py-2 px-4 text-center font-medium">{t('tenantAdmin.wilayahReport.visits')}</th>
                      <th className="py-2 px-4 text-right font-medium">{t('tenantAdmin.wilayahReport.revenue')}</th>
                      <th className="py-2 px-4 text-center font-medium">{t('tenantAdmin.wilayahReport.average')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kec.kelurahan.map((kel, i) => (
                      <tr key={kel.kelurahanId} className="border-b border-dark-border/30 last:border-0">
                        <td className="py-2.5 px-8">
                          <div className="flex items-center gap-2">
                            <Home size={12} className="text-muted flex-shrink-0" />
                            <span className="text-sm text-off-white">{kel.kelurahan}</span>
                            {i === 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-brand/10 text-brand border border-brand/20 rounded-full">{t('tenantAdmin.wilayahReport.highest')}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-sm text-center text-off-white">{kel.customerCount}</td>
                        <td className="py-2.5 px-4 text-sm text-center font-semibold text-off-white">{kel.visitCount}</td>
                        <td className="py-2.5 px-4 text-sm text-right text-brand">{formatRupiah(kel.revenue)}</td>
                        <td className="py-2.5 px-4 text-sm text-center text-muted">{kel.avgVisitPerCustomer}x</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  )
}

// ── Insights ──────────────────────────────────────────────────────────────────
function InsightsPanel({ byKecamatan }) {
  const { t } = useTranslation()
  if (!byKecamatan?.length) return null

  const top        = byKecamatan[0]
  const topKel     = top?.kelurahan?.[0]
  const highestRev = [...byKecamatan].sort((a, b) => b.revenue - a.revenue)[0]
  const mostLoyal  = [...byKecamatan].sort((a, b) => b.avgVisitPerCustomer - a.avgVisitPerCustomer)[0]

  const insights = [
    {
      icon: TrendingUp,
      color: 'text-brand',
      bg: 'bg-brand/10',
      title: t('tenantAdmin.wilayahReport.insightMostActive'),
      value: top?.kecamatan,
      sub: t('tenantAdmin.wilayahReport.insightMostActiveSub', { visits: top?.visitCount, customers: top?.customerCount }),
    },
    {
      icon: DollarSign,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
      title: t('tenantAdmin.wilayahReport.insightHighestRevenue'),
      value: highestRev?.kecamatan,
      sub: formatRupiah(highestRev?.revenue),
    },
    {
      icon: Repeat2,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
      title: t('tenantAdmin.wilayahReport.insightMostLoyal'),
      value: mostLoyal?.kecamatan,
      sub: t('tenantAdmin.wilayahReport.insightMostLoyalSub', { avg: mostLoyal?.avgVisitPerCustomer }),
    },
    {
      icon: Home,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      title: t('tenantAdmin.wilayahReport.insightBusiestVillage'),
      value: topKel?.kelurahan || '—',
      sub: topKel ? t('tenantAdmin.wilayahReport.insightBusiestVillageSub', { visits: topKel.visitCount, kecamatan: top?.kecamatan }) : t('tenantAdmin.wilayahReport.noKecamatanData'),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-brand" />
          <h3 className="font-semibold text-off-white">{t('tenantAdmin.wilayahReport.areaInsights')}</h3>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {insights.map(ins => (
            <div key={ins.title} className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-xl ${ins.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <ins.icon size={15} className={ins.color} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">{ins.title}</p>
                <p className="text-sm font-semibold text-off-white truncate">{ins.value}</p>
                <p className="text-xs text-muted/70 truncate">{ins.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}

// ── Mobile Kecamatan Card ─────────────────────────────────────────────────────
function KecamatanMobileCard({ kec, rank, totalVisits, isExpanded, onToggle }) {
  const { t } = useTranslation()
  const pct = totalVisits > 0 ? (kec.visitCount / totalVisits * 100).toFixed(1) : 0

  return (
    <div className="border border-dark-border rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-start gap-3 hover:bg-dark-surface/40 transition-colors text-left"
      >
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${rankBadgeClass(rank)}`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-off-white truncate">{kec.kecamatan}</p>
            <ChangeChip cur={kec.visitCount} prev={kec.prevVisitCount} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
            <span><span className="text-off-white font-medium">{kec.visitCount}</span> {t('tenantAdmin.wilayahReport.visitsLower')}</span>
            <span><span className="text-off-white font-medium">{kec.customerCount}</span> {t('tenantAdmin.wilayahReport.customersLower')}</span>
            <span className="text-brand font-medium">{formatRupiahShort(kec.revenue)}</span>
          </div>
          <div className="mt-2 h-1.5 bg-dark-surface rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} className="flex-shrink-0 mt-0.5">
          <ChevronRight size={16} className="text-muted" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && kec.kelurahan.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-dark-border bg-dark-surface/20 divide-y divide-dark-border/50">
              {kec.kelurahan.map((kel, i) => (
                <div key={kel.kelurahanId} className="px-4 py-2.5 flex items-center gap-2">
                  <Home size={12} className="text-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-off-white truncate">{kel.kelurahan}</span>
                      {i === 0 && <span className="text-[10px] px-1 py-0.5 bg-brand/10 text-brand border border-brand/20 rounded">{t('tenantAdmin.wilayahReport.top')}</span>}
                    </div>
                    <p className="text-xs text-muted">{t('tenantAdmin.wilayahReport.visitsCustomersLine', { visits: kel.visitCount, customers: kel.customerCount })}</p>
                  </div>
                  <span className="text-xs text-brand flex-shrink-0">{formatRupiahShort(kel.revenue)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Empty / No Data ───────────────────────────────────────────────────────────
function EmptyData({ kabupaten }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center mb-4">
        <MapPin size={24} className="text-muted" />
      </div>
      <h3 className="font-semibold text-off-white mb-1">{t('tenantAdmin.wilayahReport.noData')}</h3>
      <p className="text-sm text-muted max-w-xs">
        {t('tenantAdmin.wilayahReport.noDataDescPart1')} <span className="text-off-white">{kabupaten}</span> {t('tenantAdmin.wilayahReport.noDataDescPart2')}
      </p>
      <p className="text-xs text-muted mt-2">
        {t('tenantAdmin.wilayahReport.noDataHint')}
      </p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
// Wrapper feature-gate: Laporan Wilayah = fitur Pro+ (flag `wilayah_report`).
// Akses langsung via URL pada paket tanpa fitur ini → layar "belum aktif",
// bukan kebocoran fitur. Inner di-render hanya saat flag aktif (rule-of-hooks aman).
export default function TAWilayahReportPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const enabled = useIsFeatureEnabled(user?.tenantId, 'wilayah_report')
  if (!enabled) {
    return (
      <div className="max-w-lg mx-auto mt-10 px-4">
        <Card>
          <CardBody className="text-center py-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 mb-4">
              <MapPin className="w-7 h-7 text-brand" />
            </div>
            <h2 className="font-display text-xl font-semibold text-off-white mb-2">{t('tenantAdmin.wilayahReport.featureOffTitle')}</h2>
            <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
              {t('tenantAdmin.wilayahReport.featureOffDesc')}
            </p>
            <Link to="/admin/billing" className="inline-flex mt-5">
              <Button>{t('tenantAdmin.wilayahReport.viewPackagesUpgrade')}</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    )
  }
  return <WilayahReportInner />
}

function WilayahReportInner() {
  const { t, i18n } = useTranslation()
  const dfLocale = i18n.language === 'en' ? enLocale : idLocale
  const { user } = useAuthStore()
  const toast = useToast()
  const chart = useChartTheme()

  // Wilayah fokus toko dibaca dari sesi (Tenant.wilayah) — server-side, jadi
  // konsisten lintas-perangkat & dipakai bersama kasir/booking.
  const wilayah = user?.tenant?.wilayah
  const config = wilayah?.kabupatenId ? wilayah : null

  const [period, setPeriod]           = useState('month')
  const [showConfig, setShowConfig]   = useState(false)
  const [expandedKec, setExpandedKec] = useState(null)
  const [sort, setSort]               = useState({ key: 'visitCount', dir: 'desc' })
  const isMobile = useIsMobile()

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useWilayahReport({
    kabupatenId: config?.kabupatenId,
    period,
  })

  const summary      = data?.summary
  const byKecamatan  = data?.byKecamatan || []
  const prevLabel    = PREV_LABELS(t)[period]

  // Daftar kecamatan ter-sort untuk tabel & kartu (chart tetap urut kunjungan).
  const sortedKecamatan = useMemo(() => {
    const arr = [...byKecamatan]
    arr.sort((a, b) => {
      const av = Number(a[sort.key]) || 0
      const bv = Number(b[sort.key]) || 0
      return sort.dir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [byKecamatan, sort])

  function toggleSort(key) {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'desc' })
  }

  const chartData = useMemo(() =>
    byKecamatan
      .slice(0, 10)
      .map(k => ({
        kecamatan:     k.kecamatan.replace(/^KECAMATAN\s+/i, ''),
        visitCount:    k.visitCount,
        customerCount: k.customerCount,
        revenue:       k.revenue,
      })),
    [byKecamatan]
  )

  // Config sudah tersimpan server-side oleh ConfigPanel & ter-merge ke sesi
  // (patchTenant) — di sini cukup tutup panel & reset ekspansi.
  function handleConfigSave() {
    setShowConfig(false)
    setExpandedKec(null)
  }

  function toggleKec(id) {
    setExpandedKec(prev => prev === id ? null : id)
  }

  // Ekspor breakdown wilayah ke CSV — satu baris ringkasan per kecamatan,
  // diikuti baris tiap desa/kelurahan di bawahnya.
  function handleExport() {
    if (!byKecamatan.length) {
      toast.error(t('tenantAdmin.wilayahReport.noDataToExport'))
      return
    }
    const header = [t('tenantAdmin.wilayahReport.csvKecamatan'), t('tenantAdmin.wilayahReport.csvVillage'), t('tenantAdmin.wilayahReport.csvCustomers'), t('tenantAdmin.wilayahReport.csvVisits'), t('tenantAdmin.wilayahReport.csvRevenue'), t('tenantAdmin.wilayahReport.csvAvgVisits')]
    const rows = []
    byKecamatan.forEach(kec => {
      rows.push([kec.kecamatan, t('tenantAdmin.wilayahReport.csvKecamatanTotal'), kec.customerCount, kec.visitCount, kec.revenue, kec.avgVisitPerCustomer])
      kec.kelurahan.forEach(kel => {
        rows.push([kec.kecamatan, kel.kelurahan, kel.customerCount, kel.visitCount, kel.revenue, kel.avgVisitPerCustomer])
      })
    })
    const escape = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\r\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `laporan-wilayah-${config?.kabupaten || 'area'}-${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('tenantAdmin.wilayahReport.exportSuccess', { count: byKecamatan.length }))
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!config) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold brand-text">{t('tenantAdmin.wilayahReport.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.wilayahReport.pageSubtitle')}</p>
        </div>

        <div className="max-w-2xl">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 mb-6">
            <AlertCircle size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-off-white mb-1">{t('tenantAdmin.wilayahReport.configOnceTitle')}</p>
              <p className="text-muted">
                {t('tenantAdmin.wilayahReport.configOnceDesc')}
              </p>
            </div>
          </div>
          <ConfigPanel initial={null} onSaved={handleConfigSave} />
        </div>
      </div>
    )
  }

  // ── Analytics screen ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold brand-text">{t('tenantAdmin.wilayahReport.pageTitle')}</h1>
          <div className="flex items-center gap-2 mt-1">
            <MapPin size={13} className="text-brand" />
            <p className="text-sm text-muted">
              <span className="text-off-white font-medium">{config.kabupaten}</span>
              {config.provinsi && <span>, {config.provinsi}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dataUpdatedAt > 0 && !isLoading && (
            <span className="text-[11px] text-muted/70 self-center mr-0.5">
              {t('tenantAdmin.wilayahReport.updatedPrefix')} {formatDistanceToNow(dataUpdatedAt, { addSuffix: true, locale: dfLocale })}
            </span>
          )}
          <button
            onClick={() => setShowConfig(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border text-xs text-muted hover:border-brand/30 hover:text-off-white transition-all"
          >
            <Settings2 size={13} />
            {t('tenantAdmin.wilayahReport.changeRegencyShort')}
          </button>
          <button
            onClick={handleExport}
            disabled={isLoading || byKecamatan.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border text-xs text-muted hover:border-brand/30 hover:text-off-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} />
            {t('tenantAdmin.wilayahReport.exportCsv')}
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border text-xs text-muted hover:border-brand/30 hover:text-off-white transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            {t('tenantAdmin.wilayahReport.refresh')}
          </button>
        </div>
      </div>

      {/* Config panel (inline, collapsible) */}
      <AnimatePresence>
        {showConfig && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <ConfigPanel
              initial={config}
              onSaved={handleConfigSave}
              onCancel={() => setShowConfig(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Period selector */}
      <div className="flex flex-wrap gap-1 p-1 bg-dark-card border border-dark-border rounded-xl w-fit max-w-full">
        {PERIODS(t).map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              period === p.value
                ? 'bg-brand text-dark'
                : 'text-muted hover:text-off-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <AlertCircle size={16} />
          <span>{t('tenantAdmin.wilayahReport.loadFailed')} <button onClick={() => refetch()} className="underline">{t('common.retry')}</button></span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label={t('tenantAdmin.wilayahReport.totalCustomers')}
          value={isLoading ? '—' : (summary?.totalCustomers ?? 0)}
          color="text-blue-400"
        />
        <StatCard
          icon={Repeat2}
          label={t('tenantAdmin.wilayahReport.totalVisits')}
          value={isLoading ? '—' : (summary?.totalVisits ?? 0)}
          changeValue={summary?.totalVisits ?? 0}
          prev={prevLabel ? summary?.prevVisits : undefined}
          color="text-brand"
          sub={prevLabel}
        />
        <StatCard
          icon={DollarSign}
          label={t('tenantAdmin.wilayahReport.totalRevenue')}
          value={isLoading ? '—' : (
            <>
              <span className="sm:hidden">{formatRupiahShort(summary?.totalRevenue ?? 0)}</span>
              <span className="hidden sm:inline">{formatRupiah(summary?.totalRevenue ?? 0)}</span>
            </>
          )}
          changeValue={summary?.totalRevenue ?? 0}
          prev={prevLabel ? summary?.prevRevenue : undefined}
          color="text-green-400"
          sub={prevLabel}
        />
        <StatCard
          icon={TrendingUp}
          label={t('tenantAdmin.wilayahReport.avgVisits')}
          value={isLoading ? '—' : `${summary?.avgVisitPerCustomer ?? 0}x`}
          color="text-purple-400"
          sub={t('tenantAdmin.wilayahReport.perCustomer')}
        />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-dark-card animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && !isError && byKecamatan.length === 0 && (
        <EmptyData kabupaten={config.kabupaten} />
      )}

      {!isLoading && !isError && byKecamatan.length > 0 && (
        <>
          {/* Insights */}
          <InsightsPanel byKecamatan={byKecamatan} />

          {/* Bar chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 size={15} className="text-brand" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.wilayahReport.visitsPerKecamatan')}</h3>
                <span className="text-xs text-muted">{t('tenantAdmin.wilayahReport.topN', { count: Math.min(chartData.length, 10) })}</span>
              </div>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: isMobile ? 14 : 30, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke={chart.grid} />
                  <XAxis type="number" tick={{ fontSize: isMobile ? 9 : 11, fill: chart.axisTick }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="kecamatan"
                    width={isMobile ? 78 : 120}
                    tick={{ fontSize: isMobile ? 9 : 11, fill: chart.axisTick }}
                    tickFormatter={isMobile ? (v) => (v.length > 11 ? `${v.slice(0, 10)}…` : v) : undefined}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: chart.isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="visitCount" radius={[0, 6, 6, 0]} maxBarSize={28}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          {/* Kecamatan Table — desktop */}
          <Card className="hidden md:block">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-brand" />
                  <h3 className="font-semibold text-off-white">{t('tenantAdmin.wilayahReport.detailPerKecamatan')}</h3>
                </div>
                <p className="text-xs text-muted">{t('tenantAdmin.wilayahReport.kecamatanFoundHint', { count: byKecamatan.length })}</p>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border text-xs text-muted">
                    <th className="py-3 px-4 text-left font-medium">{t('tenantAdmin.wilayahReport.kecamatan')}</th>
                    <SortHeader label={t('tenantAdmin.wilayahReport.customers')}  sortKey="customerCount"       sort={sort} onSort={toggleSort} align="center" />
                    <SortHeader label={t('tenantAdmin.wilayahReport.visits')}  sortKey="visitCount"          sort={sort} onSort={toggleSort} align="left" />
                    <SortHeader label={t('tenantAdmin.wilayahReport.revenue')} sortKey="revenue"             sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label={t('tenantAdmin.wilayahReport.average')}  sortKey="avgVisitPerCustomer" sort={sort} onSort={toggleSort} align="center" />
                    <th className="py-3 px-4 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sortedKecamatan.map((kec, i) => (
                    <KecamatanRow
                      key={kec.kecamatanId}
                      kec={kec}
                      rank={i + 1}
                      totalVisits={summary?.totalVisits || 0}
                      isExpanded={expandedKec === kec.kecamatanId}
                      onToggle={() => toggleKec(kec.kecamatanId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Kecamatan Cards — mobile */}
          <div className="md:hidden space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-off-white">{t('tenantAdmin.wilayahReport.detailPerKecamatan')}</h3>
              <div className="relative flex-shrink-0">
                <select
                  value={sort.key}
                  onChange={e => setSort({ key: e.target.value, dir: 'desc' })}
                  className="appearance-none bg-dark-card border border-dark-border text-muted rounded-lg pl-2.5 pr-7 py-1.5 text-xs outline-none focus:border-brand/40"
                  aria-label={t('tenantAdmin.wilayahReport.sortKecamatan')}
                >
                  <option value="visitCount">{t('tenantAdmin.wilayahReport.sortVisits')}</option>
                  <option value="customerCount">{t('tenantAdmin.wilayahReport.sortCustomers')}</option>
                  <option value="revenue">{t('tenantAdmin.wilayahReport.sortRevenue')}</option>
                  <option value="avgVisitPerCustomer">{t('tenantAdmin.wilayahReport.sortLoyalty')}</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </div>
            {sortedKecamatan.map((kec, i) => (
              <KecamatanMobileCard
                key={kec.kecamatanId}
                kec={kec}
                rank={i + 1}
                totalVisits={summary?.totalVisits || 0}
                isExpanded={expandedKec === kec.kecamatanId}
                onToggle={() => toggleKec(kec.kecamatanId)}
              />
            ))}
          </div>

          {/* Summary footer */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-xs text-muted">
            <span>{t('tenantAdmin.wilayahReport.totalKecamatan')}: <span className="text-off-white">{summary?.kecamatanCount}</span></span>
            <span>{t('tenantAdmin.wilayahReport.totalVillages')}: <span className="text-off-white">{byKecamatan.reduce((s, k) => s + k.kelurahan.length, 0)}</span></span>
            <span>{t('tenantAdmin.wilayahReport.avgVisitsLabel')}: <span className="text-off-white">{summary?.avgVisitPerCustomer}x</span> {t('tenantAdmin.wilayahReport.perCustomer')}</span>
          </div>
        </>
      )}
    </div>
  )
}

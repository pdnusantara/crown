import React, { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  MapPin, ChevronRight, ChevronDown, Users, TrendingUp, TrendingDown,
  DollarSign, Repeat2, Settings2, Star, AlertCircle, RefreshCw,
  Building2, Home, Sparkles, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useWilayahReport } from '../../hooks/useWilayahReport.js'
import { useProvinces, useRegencies } from '../../hooks/useWilayah.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import { formatRupiah } from '../../utils/format.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const PERIODS = [
  { value: '30d', label: '30 Hari' },
  { value: '90d', label: '90 Hari' },
  { value: '1y',  label: '1 Tahun' },
  { value: 'all', label: 'Semua' },
]

const BAR_COLORS = [
  '#C9A84C', '#D4B96A', '#B8943A', '#E5C87E', '#F0D898',
  '#A07830', '#8C6820', '#705018', '#BFA060', '#D9C090',
]

const CONFIG_KEY = (tenantId) => `wilayah_config_${tenantId}`

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadConfig(tenantId) {
  try {
    const raw = localStorage.getItem(CONFIG_KEY(tenantId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveConfig(tenantId, config) {
  localStorage.setItem(CONFIG_KEY(tenantId), JSON.stringify(config))
}

function pctChange(cur, prev) {
  if (!prev || prev === 0) return null
  return +((cur - prev) / prev * 100).toFixed(1)
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

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, prev, color = 'text-gold', sub }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-dark-surface flex items-center justify-center flex-shrink-0">
          <Icon size={18} className={color} />
        </div>
        <ChangeChip cur={typeof value === 'number' ? value : 0} prev={prev} />
      </div>
      <p className="mt-3 text-2xl font-bold text-off-white leading-none">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
      {sub && <p className="text-xs text-muted/60 mt-0.5">{sub}</p>}
    </Card>
  )
}

// ── Config Panel ──────────────────────────────────────────────────────────────
function ConfigPanel({ tenantId, initial, onSave, onCancel }) {
  const { data: provinces = [] } = useProvinces()
  const [provinsiId, setProvinsiId]   = useState(initial?.provinsiId || '')
  const [kabupatenId, setKabupatenId] = useState(initial?.kabupatenId || '')
  const { data: regencies = [] } = useRegencies(provinsiId)

  function handleProvinsi(e) {
    setProvinsiId(e.target.value)
    setKabupatenId('')
  }

  function handleSave() {
    if (!kabupatenId || !provinsiId) return
    const prov = provinces.find(p => p.id === provinsiId)
    const kab  = regencies.find(r => r.id === kabupatenId)
    const cfg  = { provinsiId, provinsi: prov?.name || '', kabupatenId, kabupaten: kab?.name || '' }
    saveConfig(tenantId, cfg)
    onSave(cfg)
  }

  return (
    <Card className="p-6 border-gold/20">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <MapPin size={18} className="text-gold" />
        </div>
        <div>
          <h3 className="font-semibold text-off-white">
            {initial ? 'Ganti Kabupaten/Kota' : 'Pilih Kabupaten/Kota Fokus'}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Laporan akan menampilkan kunjungan per kecamatan dan desa dalam area ini
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Provinsi</label>
          <div className="relative">
            <select
              value={provinsiId}
              onChange={handleProvinsi}
              className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 pr-8 text-sm outline-none focus:border-gold/60 transition-all"
            >
              <option value="">Pilih Provinsi</option>
              {provinces.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Kabupaten / Kota</label>
          <div className="relative">
            <select
              value={kabupatenId}
              onChange={e => setKabupatenId(e.target.value)}
              disabled={!provinsiId}
              className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 pr-8 text-sm outline-none focus:border-gold/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <option value="">{provinsiId ? 'Pilih Kabupaten/Kota' : 'Pilih provinsi dulu'}</option>
              {regencies.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={!kabupatenId}
          className="flex-1 sm:flex-none"
        >
          {initial ? 'Simpan Perubahan' : 'Mulai Analisis'}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>Batal</Button>
        )}
      </div>
    </Card>
  )
}

// ── Custom Tooltip for recharts ────────────────────────────────────────────────
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-dark-card border border-dark-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-off-white mb-1">{d.kecamatan}</p>
      <p className="text-muted">Kunjungan: <span className="text-off-white font-medium">{d.visitCount}</span></p>
      <p className="text-muted">Pelanggan: <span className="text-off-white font-medium">{d.customerCount}</span></p>
      <p className="text-muted">Pendapatan: <span className="text-gold font-medium">{formatRupiah(d.revenue)}</span></p>
    </div>
  )
}

// ── Kecamatan Row ─────────────────────────────────────────────────────────────
function KecamatanRow({ kec, rank, totalVisits, isExpanded, onToggle }) {
  const pct = totalVisits > 0 ? (kec.visitCount / totalVisits * 100).toFixed(1) : 0

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-dark-border hover:bg-dark-surface/40 cursor-pointer transition-colors"
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
              ${rank === 1 ? 'bg-gold/20 text-gold' : rank === 2 ? 'bg-gray-400/20 text-gray-400' : rank === 3 ? 'bg-amber-700/20 text-amber-600' : 'bg-dark-surface text-muted'}`}>
              {rank}
            </span>
            <div>
              <p className="text-sm font-medium text-off-white leading-none">{kec.kecamatan}</p>
              <p className="text-xs text-muted mt-0.5">{kec.kelurahan.length} desa/kel</p>
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-center">
          <span className="font-semibold text-off-white">{kec.customerCount}</span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-dark-surface rounded-full overflow-hidden min-w-[60px]">
              <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm font-semibold text-off-white w-8 text-right">{kec.visitCount}</span>
            <ChangeChip cur={kec.visitCount} prev={kec.prevVisitCount} />
          </div>
        </td>
        <td className="py-3 px-4 text-sm text-right text-gold font-medium">
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
                      <th className="py-2 px-8 text-left font-medium">Desa / Kelurahan</th>
                      <th className="py-2 px-4 text-center font-medium">Pelanggan</th>
                      <th className="py-2 px-4 text-center font-medium">Kunjungan</th>
                      <th className="py-2 px-4 text-right font-medium">Pendapatan</th>
                      <th className="py-2 px-4 text-center font-medium">Rata-rata</th>
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
                              <span className="text-[10px] px-1.5 py-0.5 bg-gold/10 text-gold border border-gold/20 rounded-full">Terbanyak</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-sm text-center text-off-white">{kel.customerCount}</td>
                        <td className="py-2.5 px-4 text-sm text-center font-semibold text-off-white">{kel.visitCount}</td>
                        <td className="py-2.5 px-4 text-sm text-right text-gold">{formatRupiah(kel.revenue)}</td>
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
function InsightsPanel({ byKecamatan, summary }) {
  if (!byKecamatan?.length) return null

  const top        = byKecamatan[0]
  const topKel     = top?.kelurahan?.[0]
  const highestRev = [...byKecamatan].sort((a, b) => b.revenue - a.revenue)[0]
  const mostLoyal  = [...byKecamatan].sort((a, b) => b.avgVisitPerCustomer - a.avgVisitPerCustomer)[0]

  const insights = [
    {
      icon: TrendingUp,
      color: 'text-gold',
      bg: 'bg-gold/10',
      title: 'Area Paling Aktif',
      value: top?.kecamatan,
      sub: `${top?.visitCount} kunjungan dari ${top?.customerCount} pelanggan`,
    },
    {
      icon: DollarSign,
      color: 'text-green-400',
      bg: 'bg-green-400/10',
      title: 'Area Pendapatan Tertinggi',
      value: highestRev?.kecamatan,
      sub: formatRupiah(highestRev?.revenue),
    },
    {
      icon: Repeat2,
      color: 'text-purple-400',
      bg: 'bg-purple-400/10',
      title: 'Area Loyalitas Tertinggi',
      value: mostLoyal?.kecamatan,
      sub: `Rata-rata ${mostLoyal?.avgVisitPerCustomer}x kunjungan/pelanggan`,
    },
    {
      icon: Home,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      title: 'Desa Tersibuk',
      value: topKel?.kelurahan || '—',
      sub: topKel ? `${topKel.visitCount} kunjungan · ${top?.kecamatan}` : 'Tidak ada data kecamatan',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-gold" />
          <h3 className="font-semibold text-off-white">Insight Wilayah</h3>
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
  const pct = totalVisits > 0 ? (kec.visitCount / totalVisits * 100).toFixed(1) : 0

  return (
    <div className="border border-dark-border rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-start gap-3 hover:bg-dark-surface/40 transition-colors text-left"
      >
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
          ${rank === 1 ? 'bg-gold/20 text-gold' : rank === 2 ? 'bg-gray-400/20 text-gray-400' : rank === 3 ? 'bg-amber-700/20 text-amber-600' : 'bg-dark-surface text-muted'}`}>
          {rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-off-white truncate">{kec.kecamatan}</p>
            <ChangeChip cur={kec.visitCount} prev={kec.prevVisitCount} />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted">
            <span><span className="text-off-white font-medium">{kec.visitCount}</span> kunjungan</span>
            <span><span className="text-off-white font-medium">{kec.customerCount}</span> pelanggan</span>
            <span className="text-gold font-medium">{formatRupiah(kec.revenue)}</span>
          </div>
          <div className="mt-2 h-1.5 bg-dark-surface rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
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
                      {i === 0 && <span className="text-[10px] px-1 py-0.5 bg-gold/10 text-gold border border-gold/20 rounded">Top</span>}
                    </div>
                    <p className="text-xs text-muted">{kel.visitCount} kunjungan · {kel.customerCount} pelanggan</p>
                  </div>
                  <span className="text-xs text-gold flex-shrink-0">{formatRupiah(kel.revenue)}</span>
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
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center mb-4">
        <MapPin size={24} className="text-muted" />
      </div>
      <h3 className="font-semibold text-off-white mb-1">Tidak Ada Data</h3>
      <p className="text-sm text-muted max-w-xs">
        Belum ada pelanggan dari <span className="text-off-white">{kabupaten}</span> dengan data kunjungan pada periode ini.
      </p>
      <p className="text-xs text-muted mt-2">
        Pastikan pelanggan sudah mengisi data wilayah lengkap saat pendaftaran.
      </p>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TAWilayahReportPage() {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId

  const [config, setConfig]           = useState(() => loadConfig(tenantId))
  const [period, setPeriod]           = useState('30d')
  const [showConfig, setShowConfig]   = useState(false)
  const [expandedKec, setExpandedKec] = useState(null)

  useEffect(() => {
    setConfig(loadConfig(tenantId))
  }, [tenantId])

  const { data, isLoading, isError, refetch } = useWilayahReport({
    kabupatenId: config?.kabupatenId,
    period,
  })

  const summary      = data?.summary
  const byKecamatan  = data?.byKecamatan || []

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

  function handleConfigSave(cfg) {
    setConfig(cfg)
    setShowConfig(false)
    setExpandedKec(null)
  }

  function toggleKec(id) {
    setExpandedKec(prev => prev === id ? null : id)
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!config) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">Laporan Wilayah</h1>
          <p className="text-muted text-sm mt-1">Analisis kunjungan pelanggan berdasarkan kecamatan dan desa</p>
        </div>

        <div className="max-w-2xl">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 mb-6">
            <AlertCircle size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-off-white mb-1">Konfigurasi Sekali, Pakai Selamanya</p>
              <p className="text-muted">
                Pilih kabupaten/kota fokus. Laporan akan menampilkan breakdown kecamatan dan desa secara otomatis.
                Konfigurasi ini tersimpan di browser dan bisa diubah kapanpun.
              </p>
            </div>
          </div>
          <ConfigPanel tenantId={tenantId} initial={null} onSave={handleConfigSave} />
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
          <h1 className="text-2xl font-display font-bold gold-text">Laporan Wilayah</h1>
          <div className="flex items-center gap-2 mt-1">
            <MapPin size={13} className="text-gold" />
            <p className="text-sm text-muted">
              <span className="text-off-white font-medium">{config.kabupaten}</span>
              {config.provinsi && <span>, {config.provinsi}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border text-xs text-muted hover:border-gold/30 hover:text-off-white transition-all"
          >
            <Settings2 size={13} />
            Ganti Kabupaten
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border text-xs text-muted hover:border-gold/30 hover:text-off-white transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Config panel (inline, collapsible) */}
      <AnimatePresence>
        {showConfig && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <ConfigPanel
              tenantId={tenantId}
              initial={config}
              onSave={handleConfigSave}
              onCancel={() => setShowConfig(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Period selector */}
      <div className="flex gap-1 p-1 bg-dark-card border border-dark-border rounded-xl w-fit">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              period === p.value
                ? 'bg-gold text-dark'
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
          <span>Gagal memuat data. <button onClick={() => refetch()} className="underline">Coba lagi</button></span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label="Total Pelanggan"
          value={isLoading ? '—' : (summary?.totalCustomers ?? 0)}
          color="text-blue-400"
        />
        <StatCard
          icon={Repeat2}
          label="Total Kunjungan"
          value={isLoading ? '—' : (summary?.totalVisits ?? 0)}
          prev={summary?.prevVisits}
          color="text-gold"
          sub={period !== 'all' ? 'vs periode sebelumnya' : undefined}
        />
        <StatCard
          icon={DollarSign}
          label="Total Pendapatan"
          value={isLoading ? '—' : formatRupiah(summary?.totalRevenue ?? 0)}
          prev={summary?.prevRevenue}
          color="text-green-400"
          sub={period !== 'all' ? 'vs periode sebelumnya' : undefined}
        />
        <StatCard
          icon={TrendingUp}
          label="Rata-rata Kunjungan"
          value={isLoading ? '—' : `${summary?.avgVisitPerCustomer ?? 0}x`}
          color="text-purple-400"
          sub="per pelanggan"
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
          <InsightsPanel byKecamatan={byKecamatan} summary={summary} />

          {/* Bar chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 size={15} className="text-gold" />
                <h3 className="font-semibold text-off-white">Kunjungan per Kecamatan</h3>
                <span className="text-xs text-muted">(top {Math.min(chartData.length, 10)})</span>
              </div>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 36)}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 30, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} stroke="#2A2A2A" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="kecamatan"
                    width={120}
                    tick={{ fontSize: 11, fill: '#aaa' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
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
                  <MapPin size={15} className="text-gold" />
                  <h3 className="font-semibold text-off-white">Detail per Kecamatan</h3>
                </div>
                <p className="text-xs text-muted">{byKecamatan.length} kecamatan ditemukan · Klik untuk lihat desa</p>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border text-xs text-muted">
                    <th className="py-3 px-4 text-left font-medium">Kecamatan</th>
                    <th className="py-3 px-4 text-center font-medium">Pelanggan</th>
                    <th className="py-3 px-4 text-left font-medium">Kunjungan</th>
                    <th className="py-3 px-4 text-right font-medium">Pendapatan</th>
                    <th className="py-3 px-4 text-center font-medium">Rata-rata</th>
                    <th className="py-3 px-4 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {byKecamatan.map((kec, i) => (
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
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-off-white">Detail per Kecamatan</h3>
              <p className="text-xs text-muted">{byKecamatan.length} kecamatan</p>
            </div>
            {byKecamatan.map((kec, i) => (
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
            <span>Total kecamatan: <span className="text-off-white">{summary?.kecamatanCount}</span></span>
            <span>Total kelurahan/desa: <span className="text-off-white">{byKecamatan.reduce((s, k) => s + k.kelurahan.length, 0)}</span></span>
            <span>Rata-rata kunjungan: <span className="text-off-white">{summary?.avgVisitPerCustomer}x</span> per pelanggan</span>
          </div>
        </>
      )}
    </div>
  )
}

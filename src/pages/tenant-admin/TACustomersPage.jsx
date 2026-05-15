import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Star, Edit2, Trash2, MapPin, Users, X, Phone, Mail,
  Calendar, ChevronLeft, ChevronRight, Download, RefreshCw, Award,
  TrendingUp, Activity, Clock, Crown, Sparkles, Filter, Cake, ShoppingBag,
  Wallet, ArrowRight, BadgeCheck, AlertTriangle, HeartCrack, Info,
} from 'lucide-react'
import {
  useCustomers, useCustomer, useCustomerStats,
  useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useUpdateLoyalty,
  useExportCustomers, useBulkDeleteCustomers,
} from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { WilayahSelect } from '../../components/WilayahSelect.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge, { getSegmentBadge, getStatusBadge } from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { formatRupiah, formatRupiahShort, formatDate, formatDateTime } from '../../utils/format.js'
import { format, parseISO, formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const PAGE_SIZE = 20

const EMPTY_ADDRESS = {
  provinsiId: '', provinsi: '',
  kabupatenId: '', kabupaten: '',
  kecamatanId: '', kecamatan: '',
  kelurahanId: '', kelurahan: '',
  detail: '',
}
const EMPTY_FORM = {
  name: '', phone: '', email: '', gender: '', birthDate: '', notes: '',
  address: { ...EMPTY_ADDRESS },
}

const SORT_OPTIONS = [
  { value: 'recent',     label: 'Terbaru',         sortBy: 'createdAt',     sortDir: 'desc' },
  { value: 'oldest',     label: 'Terlama',         sortBy: 'createdAt',     sortDir: 'asc'  },
  { value: 'name-asc',   label: 'Nama A→Z',        sortBy: 'name',          sortDir: 'asc'  },
  { value: 'name-desc',  label: 'Nama Z→A',        sortBy: 'name',          sortDir: 'desc' },
  { value: 'visits',     label: 'Kunjungan terbanyak', sortBy: 'visitCount',sortDir: 'desc' },
  { value: 'points',     label: 'Poin terbanyak',  sortBy: 'loyaltyPoints', sortDir: 'desc' },
]

// Threshold default — di-override dari stats.thresholds saat tersedia.
const DEFAULT_THRESHOLDS = {
  vipMinVisits: 10, loyalMinVisits: 3, recentDays: 90,
  atRiskMinDays: 90, lostMinDays: 180,
}

// Segment scheme baru (time-aware RFM 6-tier).
// `id` cocok dengan classifier output di backend (vip/loyal/new/atRisk/lost/never).
const SEGMENTS = [
  { id: '',       label: 'Semua',    badge: 'muted',   desc: '' },
  { id: 'vip',    label: 'VIP',      badge: 'gold',    desc: '',  icon: Crown },
  { id: 'loyal',  label: 'Loyal',    badge: 'info',    desc: '',  icon: BadgeCheck },
  { id: 'new',    label: 'Baru',     badge: 'success', desc: '',  icon: Sparkles },
  { id: 'atRisk', label: 'At-Risk',  badge: 'warning', desc: '',  icon: AlertTriangle },
  { id: 'lost',   label: 'Lost',     badge: 'danger',  desc: '',  icon: HeartCrack },
  { id: 'never',  label: 'Belum Tx', badge: 'muted',   desc: '',  icon: Activity },
]

/**
 * Classify customer ke 1 dari 6 segment berdasarkan visitCount + lastVisitAt.
 * Mirror logika `classifySegment` di backend (`backend/src/routes/customers.js`).
 * Wajib pass thresholds (dari stats.thresholds) supaya konsisten dengan server.
 */
function getSegment(visitCount = 0, lastVisitAt = null, thresholds = DEFAULT_THRESHOLDS) {
  if (!visitCount || visitCount <= 0) return 'never'
  if (!lastVisitAt) return 'never'
  const daysSince = (Date.now() - new Date(lastVisitAt).getTime()) / (86400 * 1000)
  if (daysSince > thresholds.lostMinDays)   return 'lost'
  if (daysSince > thresholds.atRiskMinDays) return 'atRisk'
  if (visitCount >= thresholds.vipMinVisits)   return 'vip'
  if (visitCount >= thresholds.loyalMinVisits) return 'loyal'
  return 'new'
}

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const downloadCSV = (filename, header, rows) => {
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const lastVisitLabel = (date) => {
  if (!date) return null
  try { return formatDistanceToNow(parseISO(date), { addSuffix: true, locale: idLocale }) }
  catch { return null }
}

// ─── Stat tile ──────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, valueShort, accent = 'gold', hint, onClick, active, loading = false, delay = 0 }) {
  const palette = {
    gold:  { icon: 'text-gold',         valueColor: 'text-gold',         bg: 'bg-gold/15 border-gold/30',          ring: 'ring-gold/40' },
    blue:  { icon: 'text-blue-300',     valueColor: 'text-blue-300',     bg: 'bg-blue-500/15 border-blue-500/30',  ring: 'ring-blue-500/40' },
    green: { icon: 'text-emerald-300',  valueColor: 'text-emerald-300',  bg: 'bg-emerald-500/15 border-emerald-500/30', ring: 'ring-emerald-500/40' },
    amber: { icon: 'text-amber-300',    valueColor: 'text-amber-300',    bg: 'bg-amber-500/15 border-amber-500/30',ring: 'ring-amber-500/40' },
    rose:  { icon: 'text-rose-300',     valueColor: 'text-rose-300',     bg: 'bg-rose-500/15 border-rose-500/30',  ring: 'ring-rose-500/40' },
    muted: { icon: 'text-muted',        valueColor: 'text-off-white',    bg: 'bg-dark-card/60 border-dark-border', ring: 'ring-gold/40' },
  }[accent]
  const Comp = onClick ? 'button' : 'div'
  // Display "—" untuk null/undefined; "0" tetap tampil sebagai 0 (legitimate value).
  const safeValue = value === null || value === undefined ? '—' : value
  const safeShort = valueShort === null || valueShort === undefined ? null : valueShort
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Comp
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className="text-left w-full block"
      >
        <Card className={`p-3 sm:p-4 min-w-0 overflow-hidden transition-all ${
          active ? `ring-2 ${palette.ring}` : ''
        } ${onClick ? 'card-hover' : ''}`}>
          <div className="flex items-start gap-2 sm:gap-3 min-w-0">
            <div className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center ${palette.bg}`}>
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${palette.icon}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-xs text-muted leading-tight truncate uppercase tracking-wide font-medium">{label}</p>
              {loading ? (
                <div className="h-6 sm:h-7 mt-0.5 w-12 rounded bg-dark-card/70 animate-pulse" />
              ) : (
                <p className={`text-base sm:text-xl lg:text-2xl font-bold ${palette.valueColor} mt-0.5 leading-tight tabular-nums truncate`}>
                  {safeShort != null ? (
                    <>
                      <span className="sm:hidden">{safeShort}</span>
                      <span className="hidden sm:inline">{safeValue}</span>
                    </>
                  ) : safeValue}
                </p>
              )}
              {hint && !loading && <p className="text-[10px] sm:text-[11px] text-muted mt-0.5 truncate">{hint}</p>}
            </div>
          </div>
        </Card>
      </Comp>
    </motion.div>
  )
}

// ─── Mobile customer card ───────────────────────────────────────────────────
function CustomerMobileCard({ customer, onOpen, onEdit, onDelete, selected, onToggleSelect }) {
  const segment = getSegment(customer.visitCount, customer.lastVisitAt)
  const segLabel = SEGMENTS.find(s => s.id === segment)?.label || segment
  const province = customer.address?.provinsi
  const lv = customer.lifetimeValue || 0
  return (
    <div
      onClick={() => onOpen(customer)}
      className={`px-3 py-3 border-b border-dark-border/40 last:border-0 transition-colors active:bg-dark-surface/30 cursor-pointer min-w-0 ${
        selected ? 'bg-gold/15 border-l-4 border-l-gold' : 'border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(customer.id)}
          className="mt-1 w-4 h-4 rounded border-dark-border bg-dark-surface text-gold focus:ring-gold/40 shrink-0 cursor-pointer"
          aria-label={`Pilih ${customer.name}`}
        />
        <Avatar name={customer.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-off-white text-sm leading-tight truncate">{customer.name}</p>
              <p className="text-xs text-muted mt-0.5 inline-flex items-center gap-1 truncate">
                <Phone className="w-3 h-3 shrink-0" />
                <span className="truncate">{customer.phone || '—'}</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-gold tabular-nums whitespace-nowrap leading-none">
                {formatRupiahShort(lv)}
              </p>
              <p className="text-[10px] text-muted tabular-nums whitespace-nowrap mt-0.5">
                {customer.lifetimeTxCount || 0} tx
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge variant={getSegmentBadge(segment)}>{segLabel}</Badge>
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-gold/10 border border-gold/30 text-gold tabular-nums">
              <Star className="w-2.5 h-2.5 fill-gold" /> {customer.loyaltyPoints || 0}
            </span>
            <span className="text-[11px] text-muted tabular-nums">
              {customer.visitCount || 0}× kunjungan
            </span>
            {province && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted/70 truncate max-w-[100px]">
                <MapPin className="w-2.5 h-2.5" /> {province}
              </span>
            )}
            <div className="ml-auto flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(customer) }}
                className="p-1.5 rounded-lg bg-dark-card/40 border border-dark-border/60 text-muted hover:text-blue-400 hover:border-blue-500/30 transition-colors"
                aria-label="Edit"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(customer) }}
                className="p-1.5 rounded-lg bg-dark-card/40 border border-dark-border/60 text-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
                aria-label="Hapus"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Desktop table row ──────────────────────────────────────────────────────
function CustomerTableRow({ customer, onOpen, onEdit, onDelete, selected, onToggleSelect }) {
  const segment = getSegment(customer.visitCount, customer.lastVisitAt)
  const segLabel = SEGMENTS.find(s => s.id === segment)?.label || segment
  const province = customer.address?.provinsi
  const lv = customer.lifetimeValue || 0
  return (
    <div
      onClick={() => onOpen(customer)}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-dark-border/40 hover:bg-dark-surface/40 transition-colors group cursor-pointer min-w-0 ${
        selected ? 'bg-gold/15 border-l-4 border-l-gold pl-3' : 'border-l-4 border-l-transparent'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect(customer.id)}
        className="w-4 h-4 rounded border-dark-border bg-dark-surface accent-gold focus:ring-gold/40 shrink-0 cursor-pointer"
        aria-label={`Pilih ${customer.name}`}
      />
      <Avatar name={customer.name} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-off-white text-sm truncate">{customer.name}</p>
        <p className="text-xs text-muted leading-tight truncate inline-flex items-center gap-1">
          <Phone className="w-3 h-3 shrink-0" />
          <span className="truncate">{customer.phone || '—'}</span>
          {customer.email && (
            <>
              <span className="opacity-50">·</span>
              <span className="truncate">{customer.email}</span>
            </>
          )}
        </p>
      </div>
      <div className="hidden xl:block w-28 truncate text-xs text-muted shrink-0">
        {province ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" /> {province}
          </span>
        ) : <span className="opacity-40">—</span>}
      </div>
      <div className="w-[88px] shrink-0">
        <Badge variant={getSegmentBadge(segment)}>{segLabel}</Badge>
      </div>
      <div className="hidden md:block w-24 text-right shrink-0">
        <p className="text-sm font-bold text-gold tabular-nums whitespace-nowrap leading-none">
          <span className="lg:hidden">{formatRupiahShort(lv)}</span>
          <span className="hidden lg:inline">{formatRupiah(lv)}</span>
        </p>
        <p className="text-[10px] text-muted tabular-nums whitespace-nowrap mt-0.5">
          {customer.lifetimeTxCount || 0} tx
        </p>
      </div>
      <div className="hidden lg:block w-16 text-center shrink-0 text-sm text-off-white tabular-nums">
        {customer.visitCount || 0}×
      </div>
      <div className="w-16 shrink-0 inline-flex items-center justify-center gap-1">
        <Star className="w-3 h-3 text-gold fill-gold shrink-0" />
        <span className="text-gold text-sm font-semibold tabular-nums">{customer.loyaltyPoints || 0}</span>
      </div>
      <div className="hidden lg:block w-20 shrink-0 text-right text-xs text-muted whitespace-nowrap">
        {formatDate(customer.createdAt)}
      </div>
      <div className="w-[60px] shrink-0 flex justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(customer) }}
          className="p-1.5 rounded-lg hover:bg-dark-card text-muted hover:text-blue-400 transition-colors"
          aria-label="Edit"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(customer) }}
          className="p-1.5 rounded-lg hover:bg-dark-card text-muted hover:text-red-400 transition-colors"
          aria-label="Hapus"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Customer Detail Drawer ─────────────────────────────────────────────────
function CustomerDetailDrawer({ open, onClose, customerId, onEdit, onDelete }) {
  const { data: customer, isLoading } = useCustomer(customerId)
  const updateLoyalty = useUpdateLoyalty()
  const toast = useToast()
  const [pointsDelta, setPointsDelta] = useState('')

  const adjustPoints = async (delta) => {
    if (!customer || !delta) return
    try {
      await updateLoyalty.mutateAsync({ id: customer.id, points: delta })
      toast.success(delta > 0 ? `+${delta} poin ditambahkan` : `${delta} poin dikurangi`)
      setPointsDelta('')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengubah poin')
    }
  }

  const segment = customer ? getSegment(customer.visitCount, customer.lastVisitAt) : null
  const segLabel = SEGMENTS.find(s => s.id === segment)?.label || segment

  return (
    <Modal isOpen={open} onClose={onClose} size="lg" title="Detail Pelanggan">
      {isLoading || !customer ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-dark-card/60 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Hero */}
          <div className="flex items-start gap-4 min-w-0">
            <Avatar name={customer.name} size="xl" ring />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-display text-xl font-bold text-off-white truncate">{customer.name}</h3>
                <Badge variant={getSegmentBadge(segment)}>{segLabel}</Badge>
                {customer.gender === 'L' && <Badge variant="info">L</Badge>}
                {customer.gender === 'P' && <Badge variant="purple">P</Badge>}
              </div>
              <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-gold truncate">
                    <Phone className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:text-gold truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{customer.email}</span>
                  </a>
                )}
                {customer.birthDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <Cake className="w-3.5 h-3.5 shrink-0" />
                    {format(parseISO(customer.birthDate), 'd MMM yyyy', { locale: idLocale })}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  Sejak {formatDate(customer.createdAt)}
                </span>
              </div>
              {customer.address?.provinsi && (
                <p className="text-xs text-muted mt-1.5 inline-flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">
                    {[customer.address.detail, customer.address.kelurahan, customer.address.kecamatan, customer.address.kabupaten, customer.address.provinsi].filter(Boolean).join(', ')}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* LV Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card className="p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">Total Belanja</p>
              <p className="text-base sm:text-lg font-bold text-gold tabular-nums truncate">
                <span className="sm:hidden">{formatRupiahShort(customer.lifetimeValue || 0)}</span>
                <span className="hidden sm:inline">{formatRupiah(customer.lifetimeValue || 0)}</span>
              </p>
            </Card>
            <Card className="p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">Transaksi</p>
              <p className="text-base sm:text-lg font-bold text-off-white tabular-nums truncate">
                {customer.lifetimeTxCount || 0}
              </p>
            </Card>
            <Card className="p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">Avg Tiket</p>
              <p className="text-base sm:text-lg font-bold text-off-white tabular-nums truncate">
                <span className="sm:hidden">{formatRupiahShort(customer.avgTicket || 0)}</span>
                <span className="hidden sm:inline">{formatRupiah(customer.avgTicket || 0)}</span>
              </p>
            </Card>
            <Card className="p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">Kunjungan Terakhir</p>
              <p className="text-xs font-medium text-off-white truncate">
                {lastVisitLabel(customer.lastVisitAt) || '—'}
              </p>
            </Card>
          </div>

          {/* Loyalty controls + earning rules */}
          <Card className="p-3 sm:p-4 bg-gold/5 border-gold/20">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] text-muted uppercase tracking-wide font-medium inline-flex items-center gap-1">
                  <Star className="w-3 h-3 fill-gold text-gold" /> Poin Loyalty
                </p>
                <p className="text-3xl font-display font-bold text-gold tabular-nums leading-none mt-1">
                  {(customer.loyaltyPoints || 0).toLocaleString('id-ID')}
                </p>
                <p className="text-[11px] text-muted mt-1">
                  {customer.lifetimeTxCount > 0
                    ? `≈ ${Math.floor((customer.lifetimeValue || 0) / 10_000).toLocaleString('id-ID')} pts seumur hidup`
                    : 'Belum ada poin diperoleh'}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={pointsDelta}
                    onChange={e => setPointsDelta(e.target.value)}
                    placeholder="±poin"
                    className="w-24 bg-dark-surface border border-dark-border text-off-white rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-gold/60 tabular-nums"
                  />
                  <button
                    type="button"
                    disabled={!pointsDelta || Number(pointsDelta) === 0 || updateLoyalty.isPending}
                    onClick={() => adjustPoints(Number(pointsDelta))}
                    className="px-3 py-1.5 rounded-lg bg-gold text-dark text-xs font-semibold hover:bg-gold-light disabled:opacity-50"
                  >
                    Terapkan
                  </button>
                </div>
                <div className="flex gap-1">
                  {[-10, +10, +25, +50].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => adjustPoints(n)}
                      disabled={updateLoyalty.isPending}
                      className={`px-2 py-0.5 rounded-md text-[11px] tabular-nums border ${
                        n > 0
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                      } disabled:opacity-50`}
                    >
                      {n > 0 ? `+${n}` : n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Earning rules */}
            <div className="mt-3 pt-3 border-t border-gold/20">
              <p className="text-[11px] text-muted uppercase tracking-wide font-medium mb-1.5 inline-flex items-center gap-1">
                <Award className="w-3 h-3 text-gold" /> Cara Mendapatkan Poin
              </p>
              <ul className="space-y-1 text-[11px] text-off-white">
                <li className="flex items-center justify-between gap-2">
                  <span>Setiap transaksi</span>
                  <span className="text-gold tabular-nums">+1 poin / Rp10.000</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Penyesuaian manual oleh admin</span>
                  <span className="text-muted tabular-nums">manual</span>
                </li>
              </ul>
              <p className="text-[10px] text-muted mt-1.5 leading-relaxed">
                Poin dihitung otomatis dari nilai transaksi (setelah diskon) saat transaksi dibuat di POS — selama pelanggan terhubung di transaksi.
              </p>
            </div>
          </Card>

          {/* Notes */}
          {customer.notes && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Catatan</p>
              <p className="text-sm text-off-white bg-dark-card/50 border border-dark-border/60 rounded-xl p-3 leading-relaxed">
                {customer.notes}
              </p>
            </div>
          )}

          {/* Recent Transactions */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 inline-flex items-center gap-2">
              <ShoppingBag className="w-3.5 h-3.5" /> Transaksi Terbaru
              <span className="text-muted/70 normal-case font-normal">(maks 20)</span>
            </p>
            {(customer.transactions || []).length === 0 ? (
              <p className="text-sm text-muted text-center py-6">Belum ada transaksi</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {customer.transactions.map(tx => {
                  const ptsEarned = Math.floor((tx.total || 0) / 10_000)
                  return (
                    <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg bg-dark-card/40 border border-dark-border/60 min-w-0">
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center text-gold">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-off-white truncate font-medium">
                          {(tx.items || []).map(i => i.name).join(', ') || 'Transaksi'}
                        </p>
                        <p className="text-[11px] text-muted truncate inline-flex items-center gap-1.5">
                          <span>{formatDateTime(tx.createdAt)}</span>
                          {tx.branch?.name && <><span className="opacity-50">·</span><span className="truncate">{tx.branch.name}</span></>}
                          {ptsEarned > 0 && (
                            <>
                              <span className="opacity-50">·</span>
                              <span className="inline-flex items-center gap-0.5 text-gold whitespace-nowrap">
                                <Star className="w-2.5 h-2.5 fill-gold" /> +{ptsEarned}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-gold tabular-nums whitespace-nowrap">
                        <span className="sm:hidden">{formatRupiahShort(tx.total)}</span>
                        <span className="hidden sm:inline">{formatRupiah(tx.total)}</span>
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent bookings */}
          {(customer.bookings || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 inline-flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> Booking Terbaru
              </p>
              <div className="space-y-1.5">
                {customer.bookings.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center gap-2 p-2 rounded-lg bg-dark-card/40 border border-dark-border/60 min-w-0">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-300">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-off-white truncate font-medium">{b.serviceName || 'Booking'}</p>
                      <p className="text-[11px] text-muted truncate">
                        {b.date} {b.time && `· ${b.time}`}
                      </p>
                    </div>
                    <Badge variant={getStatusBadge(b.status)}>{b.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-dark-border/60">
            <Button variant="outline" fullWidth onClick={onClose}>Tutup</Button>
            <Button variant="outline" fullWidth icon={Edit2} onClick={() => { onEdit(customer); onClose() }}>Edit</Button>
            <Button variant="outline" fullWidth icon={Trash2} onClick={() => onDelete(customer)} className="text-red-400 border-red-500/40 hover:bg-red-500/10">
              Hapus
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Form Modal ─────────────────────────────────────────────────────────────
function CustomerFormModal({ open, onClose, editing, onSave, saving }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name:      editing.name || '',
          phone:     editing.phone || '',
          email:     editing.email || '',
          gender:    editing.gender || '',
          birthDate: editing.birthDate ? String(editing.birthDate).split('T')[0] : '',
          notes:     editing.notes || '',
          address:   editing.address || { ...EMPTY_ADDRESS },
        })
      } else {
        setForm(EMPTY_FORM)
      }
      setErrors({})
    }
  }, [open, editing])

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Nama wajib diisi'
    if (!form.phone.trim()) e.phone = 'Nomor telepon wajib diisi'
    if (form.phone && !/^[0-9+\-\s()]{6,20}$/.test(form.phone.trim())) e.phone = 'Format telepon tidak valid'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Format email tidak valid'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = () => {
    if (!validate()) return
    onSave({
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      gender: form.gender || undefined,
      birthDate: form.birthDate || undefined,
      notes: form.notes.trim() || undefined,
      address: form.address,
    })
  }

  return (
    <Modal
      isOpen={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      title={editing ? 'Edit Pelanggan' : 'Tambah Pelanggan'}
    >
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Info Dasar</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nama *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nama lengkap"
              error={errors.name}
            />
            <Input
              label="No. Telepon *"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="08xxxxxxxxxx"
              inputMode="tel"
              error={errors.phone}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@contoh.com"
              error={errors.email}
            />
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Jenis Kelamin</label>
              <select
                value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer"
              >
                <option value="">Tidak diisi</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
            <div className="sm:col-span-2 sm:max-w-[50%]">
              <Input
                label="Tanggal Lahir"
                type="date"
                value={form.birthDate}
                onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                hint="Untuk reminder ulang tahun"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-dark-border pt-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Alamat (opsional)</p>
          <WilayahSelect
            value={form.address}
            onChange={address => setForm(f => ({ ...f, address }))}
          />
        </div>

        <div className="border-t border-dark-border pt-5">
          <Input
            label="Catatan"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Preferensi gaya, alergi, dll. (opsional)"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <Button variant="outline" fullWidth onClick={onClose} disabled={saving}>Batal</Button>
          <Button fullWidth onClick={submit} loading={saving}>
            {editing ? 'Simpan Perubahan' : 'Tambah Pelanggan'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function TACustomersPage() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [search, setSearch]         = useState(params.get('q') || '')
  const [segment, setSegment]       = useState(params.get('seg') || '')
  const [provinsi, setProvinsi]     = useState(params.get('prov') || '')
  const [gender, setGender]         = useState(params.get('gen') || '')
  const [sort, setSort]             = useState(params.get('sort') || 'recent')
  const [page, setPage]             = useState(Number(params.get('page')) || 1)
  const [dormantDays, setDormantDays] = useState(Number(params.get('dormant')) || 0)
  const [birthMonthFilter, setBirthMonthFilter] = useState(params.get('bday') || '')

  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, segment, provinsi, gender, sort, dormantDays, birthMonthFilter])

  // URL sync
  useEffect(() => {
    const next = new URLSearchParams(params)
    const setOrDel = (k, v) => v ? next.set(k, v) : next.delete(k)
    setOrDel('q', debouncedSearch)
    setOrDel('seg', segment)
    setOrDel('prov', provinsi)
    setOrDel('gen', gender)
    setOrDel('sort', sort !== 'recent' ? sort : '')
    setOrDel('page', page > 1 ? String(page) : '')
    setOrDel('dormant', dormantDays > 0 ? String(dormantDays) : '')
    setOrDel('bday', birthMonthFilter)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, segment, provinsi, gender, sort, page, dormantDays, birthMonthFilter])

  const sortConfig = SORT_OPTIONS.find(o => o.value === sort) || SORT_OPTIONS[0]
  const queryFilters = useMemo(() => {
    const f = { page, limit: PAGE_SIZE, sortBy: sortConfig.sortBy, sortDir: sortConfig.sortDir }
    if (debouncedSearch)    f.search = debouncedSearch
    if (segment)            f.segment = segment
    if (provinsi)           f.provinsi = provinsi
    if (gender)             f.gender = gender
    if (dormantDays > 0)    f.dormantDays = dormantDays
    if (birthMonthFilter)   f.birthMonth = birthMonthFilter
    return f
  }, [page, sortConfig.sortBy, sortConfig.sortDir, debouncedSearch, segment, provinsi, gender, dormantDays, birthMonthFilter])

  const customersQuery = useCustomers(queryFilters)
  const items = customersQuery.customers
  const totalItems = customersQuery.total
  const totalPages = customersQuery.totalPages || Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const statsQuery = useCustomerStats()
  const stats = statsQuery.data || {
    total: 0, vip: 0, loyal: 0, new: 0, atRisk: 0, lost: 0, never: 0,
    regular: 0, inactive: 0, // backward compat
    avgLoyalty: 0, avgVisits: 0, withEmail: 0, withAddress: 0, byProvince: [],
    thresholds: DEFAULT_THRESHOLDS,
  }

  // Daftar provinsi dari stats endpoint (server-side aggregate, bukan dari current page).
  // Fallback ke derive dari current items kalau byProvince belum tersedia.
  const allProvinces = useMemo(() => {
    if (Array.isArray(stats.byProvince) && stats.byProvince.length) {
      return stats.byProvince.map(p => p.name)
    }
    return [...new Set(items.filter(c => c.address?.provinsi).map(c => c.address.provinsi))].sort()
  }, [stats.byProvince, items])

  // Mutations
  const createM = useCreateCustomer()
  const updateM = useUpdateCustomer()
  const deleteM = useDeleteCustomer()
  const exportM = useExportCustomers()
  const bulkDeleteM = useBulkDeleteCustomers()

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editingCust, setEditingCust] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmBulkDel, setConfirmBulkDel] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [exporting, setExporting] = useState(false)

  // Reset selection saat data atau halaman berubah agar tidak hapus stale ID.
  useEffect(() => { setSelected(new Set()) }, [page, debouncedSearch, segment, provinsi, gender, dormantDays, birthMonthFilter])

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const selectAllOnPage = () => setSelected(new Set(items.map(c => c.id)))
  const clearSelection = () => setSelected(new Set())
  const allOnPageSelected = items.length > 0 && items.every(c => selected.has(c.id))

  const openAdd = () => { setEditingCust(null); setShowForm(true) }
  const openEdit = (c) => { setEditingCust(c); setShowForm(true) }
  const openDetail = (c) => setDetailId(c.id)

  const handleSave = async (payload) => {
    try {
      if (editingCust) {
        await updateM.mutateAsync({ id: editingCust.id, ...payload })
        toast.success('Pelanggan diperbarui')
      } else {
        await createM.mutateAsync(payload)
        toast.success('Pelanggan ditambahkan')
      }
      setShowForm(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    }
  }

  const handleDelete = (c) => setConfirmDel(c)
  const confirmDelete = async () => {
    if (!confirmDel) return
    try {
      await deleteM.mutateAsync(confirmDel.id)
      toast.success('Pelanggan dihapus')
      if (detailId === confirmDel.id) setDetailId(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus')
    }
  }

  const exportCSV = async () => {
    if (totalItems === 0) {
      toast.error('Tidak ada data untuk diekspor')
      return
    }
    setExporting(true)
    try {
      // Ambil semua data terfilter (max 5000 di backend) — bukan halaman saja.
      const exportFilters = {}
      if (debouncedSearch)  exportFilters.search = debouncedSearch
      if (segment)          exportFilters.segment = segment
      if (provinsi)         exportFilters.provinsi = provinsi
      if (gender)           exportFilters.gender = gender
      if (dormantDays > 0)  exportFilters.dormantDays = dormantDays
      if (birthMonthFilter) exportFilters.birthMonth = birthMonthFilter
      const result = await exportM.mutateAsync(exportFilters)
      const all = result.data || []
      if (!all.length) {
        toast.error('Tidak ada data untuk diekspor')
        return
      }
      const header = ['Nama', 'Telepon', 'Email', 'Gender', 'Segmen', 'Kunjungan', 'Total Belanja', 'Transaksi', 'Poin Loyalty', 'Provinsi', 'Bergabung']
      const rows = all.map(c => [
        c.name,
        c.phone || '',
        c.email || '',
        c.gender || '',
        SEGMENTS.find(s => s.id === getSegment(c.visitCount, c.lastVisitAt))?.label || '—',
        c.visitCount || 0,
        c.lifetimeValue || 0,
        c.lifetimeTxCount || 0,
        c.loyaltyPoints || 0,
        c.address?.provinsi || '',
        new Date(c.createdAt).toISOString().slice(0, 10),
      ])
      const fname = `pelanggan-${new Date().toISOString().slice(0, 10)}.csv`
      downloadCSV(fname, header, rows)
      const note = result.meta?.capped
        ? ` (dipotong di 5000 baris — saring lebih spesifik untuk semua data)`
        : ''
      toast.success(`Berhasil ekspor ${rows.length} pelanggan${note}`)
    } catch (err) {
      toast.error('Gagal ekspor: ' + (err?.response?.data?.error || err?.message || 'Unknown'))
    } finally {
      setExporting(false)
    }
  }

  const resetFilters = () => {
    setSearch(''); setSegment(''); setProvinsi(''); setGender(''); setSort('recent'); setPage(1)
    setDormantDays(0); setBirthMonthFilter('')
  }
  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (segment ? 1 : 0) +
    (provinsi ? 1 : 0) +
    (gender ? 1 : 0) +
    (sort !== 'recent' ? 1 : 0) +
    (dormantDays > 0 ? 1 : 0) +
    (birthMonthFilter ? 1 : 0)

  const isSaving = createM.isPending || updateM.isPending

  const handleBulkDelete = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    try {
      const result = await bulkDeleteM.mutateAsync(ids)
      toast.success(`${result?.count ?? ids.length} pelanggan dihapus`)
      setSelected(new Set())
      setConfirmBulkDel(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus massal')
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white inline-flex items-center gap-2">
            <Users className="w-5 h-5 text-gold" /> Pelanggan
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {totalItems} pelanggan
            {segment ? ` · ${SEGMENTS.find(s => s.id === segment)?.label || segment}` : ''}
            {provinsi ? ` · ${provinsi}` : ''}
            {dormantDays > 0 ? ` · Dormant ${dormantDays}+ hari` : ''}
            {birthMonthFilter === 'current' ? ` · Ulang tahun bulan ini` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCSV}
            disabled={exporting || totalItems === 0}
            title={totalItems > 0 ? `Ekspor ${totalItems} pelanggan terfilter` : 'Tidak ada data'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card/60 border border-dark-border text-muted text-xs font-medium hover:text-off-white hover:border-gold/40 disabled:opacity-50 transition-colors"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">Ekspor CSV</span>
          </button>
          <Button icon={Plus} onClick={openAdd}>Tambah Pelanggan</Button>
        </div>
      </div>

      {/* ── Stats: 5 tile utama (skema time-aware tetap aktif di bawah) ────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <StatTile
          icon={Users}
          label="Total"
          value={stats.total}
          accent="gold"
          hint={stats.total > 0 ? `Avg ${stats.avgVisits || 0}× / orang` : 'Belum ada pelanggan'}
          onClick={() => { setSegment(''); setPage(1) }}
          active={segment === ''}
          delay={0.02}
        />
        <StatTile
          icon={Crown}
          label="VIP"
          value={stats.vip || 0}
          accent="gold"
          hint="≥10 kunjungan, aktif"
          onClick={() => setSegment(s => s === 'vip' ? '' : 'vip')}
          active={segment === 'vip'}
          delay={0.04}
        />
        <StatTile
          icon={BadgeCheck}
          label="Loyal"
          value={stats.loyal || 0}
          accent="blue"
          hint="3–9 kunjungan, aktif"
          onClick={() => setSegment(s => s === 'loyal' ? '' : 'loyal')}
          active={segment === 'loyal'}
          delay={0.06}
        />
        <StatTile
          icon={Sparkles}
          label="Baru"
          value={stats.new || 0}
          accent="green"
          hint="1–2 kunjungan, aktif"
          onClick={() => setSegment(s => s === 'new' ? '' : 'new')}
          active={segment === 'new'}
          delay={0.08}
        />
        <StatTile
          icon={Activity}
          label="Belum Tx"
          value={stats.never || stats.inactive || 0}
          accent="rose"
          hint="0 kunjungan"
          onClick={() => setSegment(s => s === 'never' ? '' : 'never')}
          active={segment === 'never'}
          delay={0.1}
        />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <Card className="p-3 sm:p-4 sticky top-0 z-20 backdrop-blur bg-dark-surface/95 border-dark-border">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama, telepon, email…"
                className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/15"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-off-white"
                  aria-label="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer appearance-none"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={gender}
              onChange={e => setGender(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer appearance-none"
            >
              <option value="">Semua Gender</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
            {allProvinces.length > 0 && (
              <select
                value={provinsi}
                onChange={e => setProvinsi(e.target.value)}
                className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer appearance-none max-w-[160px]"
              >
                <option value="">Semua Provinsi</option>
                {allProvinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/20"
              >
                <X className="w-3.5 h-3.5" /> Reset ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Segment chips (alternative to stat tile) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SEGMENTS.map(s => {
              const active = segment === s.id
              return (
                <button
                  key={s.id || 'all'}
                  type="button"
                  onClick={() => setSegment(s.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                    active
                      ? 'bg-gold text-dark'
                      : 'bg-dark-card/60 border border-dark-border text-muted hover:text-off-white'
                  }`}
                >
                  {s.label}
                  {s.desc && !active && <span className="opacity-70 text-[10px]">{s.desc}</span>}
                </button>
              )
            })}
          </div>

          {/* Quick filter chips: dormant (win-back) + birthday */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-off-white font-semibold mr-1">Cepat:</span>
            {[
              { days: 30, label: 'Dormant 30+ hari' },
              { days: 60, label: 'Dormant 60+ hari' },
              { days: 90, label: 'Dormant 90+ hari' },
            ].map(opt => {
              const active = dormantDays === opt.days
              return (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setDormantDays(active ? 0 : opt.days)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                    active
                      ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                      : 'bg-dark-card/60 border border-dark-border text-muted hover:text-off-white'
                  }`}
                >
                  <Clock className="w-3 h-3" /> {opt.label}
                </button>
              )
            })}
            {(() => {
              const active = birthMonthFilter === 'current'
              return (
                <button
                  type="button"
                  onClick={() => setBirthMonthFilter(active ? '' : 'current')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                    active
                      ? 'bg-pink-500/20 border border-pink-500/40 text-pink-300'
                      : 'bg-dark-card/60 border border-dark-border text-muted hover:text-off-white'
                  }`}
                >
                  <Cake className="w-3 h-3" /> Ulang Tahun Bulan Ini
                </button>
              )
            })()}
          </div>
        </div>
      </Card>

      {/* ── Bulk action bar ────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 rounded-xl bg-dark-card border-2 border-gold shadow-gold">
          <div className="text-sm text-off-white inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gold text-dark text-xs font-bold tabular-nums">
              {selected.size}
            </span>
            <span className="font-medium">pelanggan dipilih</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-off-white hover:text-off-white px-2.5 py-1.5 rounded-lg border border-dark-border hover:border-dark-border"
            >Batal</button>
            <button
              type="button"
              onClick={() => setConfirmBulkDel(true)}
              disabled={bulkDeleteM.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 border border-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus {selected.size}
            </button>
          </div>
        </div>
      )}

      {/* ── Loading / Error / Empty states ─────────────────────────────────── */}
      {customersQuery.isLoading ? (
        <Card className="overflow-hidden">
          <div className="space-y-1 p-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-dark-card/60 animate-pulse" />)}
          </div>
        </Card>
      ) : customersQuery.isError ? (
        <Card className="p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-3">
            <X className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="font-display text-lg font-semibold text-off-white">Gagal memuat data pelanggan</h3>
          <p className="text-muted text-sm mt-1 max-w-md mx-auto">
            {customersQuery.error?.response?.data?.error || customersQuery.error?.message || 'Terjadi kesalahan jaringan.'}
          </p>
          <div className="mt-4">
            <Button icon={RefreshCw} onClick={() => customersQuery.refetch()} loading={customersQuery.isFetching}>
              Coba Lagi
            </Button>
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gold/10 border border-gold/30 flex items-center justify-center mb-3">
            <Users className="w-7 h-7 text-gold" />
          </div>
          <h3 className="font-display text-lg font-semibold text-off-white">
            {activeFilterCount > 0 ? 'Tidak ada pelanggan cocok dengan filter' : 'Belum ada pelanggan'}
          </h3>
          <p className="text-muted text-sm mt-1 max-w-md mx-auto">
            {activeFilterCount > 0
              ? 'Coba reset filter atau ubah kata kunci pencarian.'
              : 'Pelanggan akan otomatis tercatat saat walk-in atau booking. Anda juga bisa menambahkan manual.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="outline" onClick={resetFilters}>Reset Filter</Button>
            )}
            <Button icon={Plus} onClick={openAdd}>Tambah Pelanggan</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile list */}
          <div className="block md:hidden">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-card text-[11px] text-off-white font-medium">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={() => allOnPageSelected ? clearSelection() : selectAllOnPage()}
                  className="w-4 h-4 rounded border-dark-border bg-dark-surface accent-gold focus:ring-gold/40 cursor-pointer"
                  aria-label="Pilih semua di halaman"
                />
                <span>Pilih semua di halaman ({items.length})</span>
              </div>
              {items.map(c => (
                <CustomerMobileCard
                  key={c.id}
                  customer={c}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  selected={selected.has(c.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </Card>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-dark-border bg-dark-card text-[11px] font-semibold text-off-white uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={() => allOnPageSelected ? clearSelection() : selectAllOnPage()}
                  className="w-4 h-4 rounded border-dark-border bg-dark-surface accent-gold focus:ring-gold/40 shrink-0 cursor-pointer"
                  aria-label="Pilih semua di halaman"
                />
                <div className="w-8 shrink-0" />
                <div className="flex-1 min-w-0">Pelanggan</div>
                <div className="hidden xl:block w-28 shrink-0">Provinsi</div>
                <div className="w-[88px] shrink-0">Segmen</div>
                <div className="hidden md:block w-24 text-right shrink-0">Total Belanja</div>
                <div className="hidden lg:block w-16 text-center shrink-0">Kunjungan</div>
                <div className="w-16 text-center shrink-0">Poin</div>
                <div className="hidden lg:block w-20 text-right shrink-0">Bergabung</div>
                <div className="w-[60px] shrink-0" />
              </div>
              {items.map(c => (
                <CustomerTableRow
                  key={c.id}
                  customer={c}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  selected={selected.has(c.id)}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </Card>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                className="px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
              >«</button>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </button>
              <span className="px-3 py-1.5 text-xs text-off-white tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
              >
                <span className="hidden sm:inline">Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                className="px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
              >»</button>
            </div>
          )}
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <CustomerFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        editing={editingCust}
        onSave={handleSave}
        saving={isSaving}
      />

      <CustomerDetailDrawer
        open={!!detailId}
        onClose={() => setDetailId(null)}
        customerId={detailId}
        onEdit={(c) => openEdit(c)}
        onDelete={(c) => handleDelete(c)}
      />

      <ConfirmDialog
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={confirmDelete}
        title="Hapus Pelanggan?"
        description={`Pelanggan "${confirmDel?.name || ''}" akan dihapus. Transaksi & booking lama tetap utuh tapi tidak terkait pelanggan ini lagi.`}
        confirmText="Ya, Hapus"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulkDel}
        onClose={() => setConfirmBulkDel(false)}
        onConfirm={handleBulkDelete}
        title={`Hapus ${selected.size} pelanggan?`}
        description={`${selected.size} pelanggan akan dihapus secara massal. Transaksi & booking lama tetap utuh tapi tidak terkait pelanggan ini lagi. Aksi ini tidak bisa dibatalkan dengan mudah.`}
        confirmText={`Ya, Hapus ${selected.size}`}
        variant="danger"
      />

      {customersQuery.isFetching && !customersQuery.isLoading && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-dark-card/90 border border-dark-border text-xs text-muted shadow-card backdrop-blur">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Sinkronisasi…
        </div>
      )}
    </div>
  )
}

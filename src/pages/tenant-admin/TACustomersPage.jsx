import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Star, Edit2, Trash2, MapPin, Users, X, Phone, Mail,
  Calendar, ChevronLeft, ChevronRight, Download, RefreshCw, Award,
  Activity, Clock, Crown, Sparkles, Filter, Cake, ShoppingBag,
  BadgeCheck, AlertTriangle, HeartCrack, Info,
} from 'lucide-react'
import {
  useCustomers, useCustomer, useCustomerStats,
  useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useUpdateLoyalty,
  useExportCustomers, useBulkDeleteCustomers, usePointHistory,
} from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useAuthStore } from '../../store/authStore.js'
import { useBranches } from '../../hooks/useBranches.js'
import { matchesBranch } from '../../utils/branchSlug.js'
import { WilayahSelect } from '../../components/WilayahSelect.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge, { getSegmentBadge, getStatusBadge } from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { formatRupiah, formatRupiahShort, formatDate, formatDateTime } from '../../utils/format.js'
import { parseISO, formatDistanceToNow } from 'date-fns'
import { id as idLocale, enUS as enLocale } from 'date-fns/locale'

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
  { value: 'recent',     labelKey: 'sortRecent',   sortBy: 'createdAt',     sortDir: 'desc' },
  { value: 'oldest',     labelKey: 'sortOldest',   sortBy: 'createdAt',     sortDir: 'asc'  },
  { value: 'name-asc',   labelKey: 'sortNameAsc',  sortBy: 'name',          sortDir: 'asc'  },
  { value: 'name-desc',  labelKey: 'sortNameDesc', sortBy: 'name',          sortDir: 'desc' },
  { value: 'visits',     labelKey: 'sortVisitsMost', sortBy: 'visitCount',  sortDir: 'desc' },
  { value: 'points',     labelKey: 'sortPointsMost', sortBy: 'loyaltyPoints', sortDir: 'desc' },
]

// Threshold default — di-override dari stats.thresholds saat tersedia.
const DEFAULT_THRESHOLDS = {
  vipMinVisits: 10, loyalMinVisits: 3, recentDays: 90,
  atRiskMinDays: 90, lostMinDays: 180,
}

// Segment scheme baru (time-aware RFM 6-tier).
// `id` cocok dengan classifier output di backend (vip/loyal/new/atRisk/lost/never).
const SEGMENTS = [
  { id: '',       labelKey: 'segAll',    badge: 'muted',   desc: '' },
  { id: 'vip',    labelKey: 'segVip',    badge: 'gold',    desc: '',  icon: Crown },
  { id: 'loyal',  labelKey: 'segLoyal',  badge: 'info',    desc: '',  icon: BadgeCheck },
  { id: 'new',    labelKey: 'segNew',    badge: 'success', desc: '',  icon: Sparkles },
  { id: 'atRisk', labelKey: 'segAtRisk', badge: 'warning', desc: '',  icon: AlertTriangle },
  { id: 'lost',   labelKey: 'segLost',   badge: 'danger',  desc: '',  icon: HeartCrack },
  { id: 'never',  labelKey: 'segNever',  badge: 'muted',   desc: '',  icon: Activity },
]

// Resolve a segment id to its translated label.
const segmentLabel = (t, id) => {
  const seg = SEGMENTS.find(s => s.id === id)
  return seg ? t(`tenantAdmin.customers.${seg.labelKey}`) : id
}

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

const lastVisitLabel = (date, lang = 'id') => {
  if (!date) return null
  const locale = lang === 'en' ? enLocale : idLocale
  try { return formatDistanceToNow(parseISO(date), { addSuffix: true, locale }) }
  catch { return null }
}

// ─── Stat tile ──────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, valueShort, accent = 'gold', hint, onClick, active, loading = false, delay = 0 }) {
  const palette = {
    gold:  { icon: 'text-brand',         valueColor: 'text-brand',         bg: 'bg-brand/15 border-brand/30',          ring: 'ring-brand/40' },
    blue:  { icon: 'text-blue-300',     valueColor: 'text-blue-300',     bg: 'bg-blue-500/15 border-blue-500/30',  ring: 'ring-blue-500/40' },
    green: { icon: 'text-emerald-300',  valueColor: 'text-emerald-300',  bg: 'bg-emerald-500/15 border-emerald-500/30', ring: 'ring-emerald-500/40' },
    amber: { icon: 'text-amber-300',    valueColor: 'text-amber-300',    bg: 'bg-amber-500/15 border-amber-500/30',ring: 'ring-amber-500/40' },
    rose:  { icon: 'text-rose-300',     valueColor: 'text-rose-300',     bg: 'bg-rose-500/15 border-rose-500/30',  ring: 'ring-rose-500/40' },
    muted: { icon: 'text-muted',        valueColor: 'text-off-white',    bg: 'bg-dark-card/60 border-dark-border', ring: 'ring-brand/40' },
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
  const { t } = useTranslation()
  const segment = getSegment(customer.visitCount, customer.lastVisitAt)
  const segLabel = segmentLabel(t, segment)
  const province = customer.address?.provinsi
  const lv = customer.lifetimeValue || 0
  return (
    <div
      onClick={() => onOpen(customer)}
      className={`px-3 py-3 border-b border-dark-border/40 last:border-0 transition-colors active:bg-dark-surface/30 cursor-pointer min-w-0 ${
        selected ? 'bg-brand/15 border-l-4 border-l-brand' : 'border-l-4 border-l-transparent'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(customer.id)}
            className="mt-1 w-4 h-4 rounded border-dark-border bg-dark-surface text-brand focus:ring-brand/40 shrink-0 cursor-pointer"
            aria-label={t('tenantAdmin.customers.selectName', { name: customer.name })}
          />
        )}
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
              <p className="text-sm font-bold text-brand tabular-nums whitespace-nowrap leading-none">
                {formatRupiahShort(lv)}
              </p>
              <p className="text-[10px] text-muted tabular-nums whitespace-nowrap mt-0.5">
                {t('tenantAdmin.customers.txCount', { count: customer.lifetimeTxCount || 0 })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge variant={getSegmentBadge(segment)}>{segLabel}</Badge>
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md bg-brand/10 border border-brand/30 text-brand tabular-nums">
              <Star className="w-2.5 h-2.5 fill-brand" /> {customer.loyaltyPoints || 0}
            </span>
            <span className="text-[11px] text-muted tabular-nums">
              {t('tenantAdmin.customers.visitsShort', { count: customer.visitCount || 0 })}
            </span>
            {province && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted truncate max-w-[100px]">
                <MapPin className="w-2.5 h-2.5" /> {province}
              </span>
            )}
            <div className="ml-auto flex gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(customer) }}
                className="p-2 rounded-lg bg-dark-card/40 border border-dark-border/60 text-muted hover:text-blue-400 hover:border-blue-500/30 transition-colors"
                aria-label={t('common.edit')}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(customer) }}
                  className="p-2 rounded-lg bg-dark-card/40 border border-dark-border/60 text-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Desktop table row ──────────────────────────────────────────────────────
function CustomerTableRow({ customer, onOpen, onEdit, onDelete, selected, onToggleSelect }) {
  const { t } = useTranslation()
  const segment = getSegment(customer.visitCount, customer.lastVisitAt)
  const segLabel = segmentLabel(t, segment)
  const province = customer.address?.provinsi
  const lv = customer.lifetimeValue || 0
  return (
    <div
      onClick={() => onOpen(customer)}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-dark-border/40 hover:bg-dark-surface/40 transition-colors group cursor-pointer min-w-0 ${
        selected ? 'bg-brand/15 border-l-4 border-l-brand pl-3' : 'border-l-4 border-l-transparent'
      }`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(customer.id)}
          className="w-4 h-4 rounded border-dark-border bg-dark-surface accent-brand focus:ring-brand/40 shrink-0 cursor-pointer"
          aria-label={t('tenantAdmin.customers.selectName', { name: customer.name })}
        />
      )}
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
        <p className="text-sm font-bold text-brand tabular-nums whitespace-nowrap leading-none">
          <span className="lg:hidden">{formatRupiahShort(lv)}</span>
          <span className="hidden lg:inline">{formatRupiah(lv)}</span>
        </p>
        <p className="text-[10px] text-muted tabular-nums whitespace-nowrap mt-0.5">
          {t('tenantAdmin.customers.txCount', { count: customer.lifetimeTxCount || 0 })}
        </p>
      </div>
      <div className="hidden lg:block w-16 text-center shrink-0 text-sm text-off-white tabular-nums">
        {customer.visitCount || 0}×
      </div>
      <div className="w-16 shrink-0 inline-flex items-center justify-center gap-1">
        <Star className="w-3 h-3 text-brand fill-brand shrink-0" />
        <span className="text-brand text-sm font-semibold tabular-nums">{customer.loyaltyPoints || 0}</span>
      </div>
      <div className="hidden lg:block w-20 shrink-0 text-right text-xs text-muted whitespace-nowrap">
        {formatDate(customer.createdAt)}
      </div>
      <div className="w-[60px] shrink-0 flex justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(customer) }}
          className="p-1.5 rounded-lg hover:bg-dark-card text-muted hover:text-blue-400 transition-colors"
          aria-label={t('common.edit')}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(customer) }}
            className="p-1.5 rounded-lg hover:bg-dark-card text-muted hover:text-red-400 transition-colors"
            aria-label={t('common.delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// Preset alasan untuk manual adjust — admin pilih dropdown atau tulis sendiri.
const ADJUST_REASON_PRESETS = {
  add: [
    'reasonBirthday',
    'reasonComplaintComp',
    'reasonReferralBonus',
    'reasonCampaignPromo',
    'reasonCorrectionLost',
  ],
  deduct: [
    'reasonRedeemReward',
    'reasonCorrectionDouble',
    'reasonTermsViolation',
    'reasonRefund',
    'reasonTransferAccount',
  ],
}

const POINT_TYPE_STYLE = {
  earn:   { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', labelKey: 'ledgerEarn' },
  adjust: { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-300',   labelKey: 'ledgerAdjust' },
  redeem: { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-300',     labelKey: 'ledgerRedeem' },
  expire: { bg: 'bg-dark-card/50',   border: 'border-dark-border',    text: 'text-muted',       labelKey: 'ledgerExpire' },
}

// ─── Adjust Points Modal — wajib alasan ────────────────────────────────────
function AdjustPointsModal({ open, onClose, customer, presetDelta, onConfirm, loading }) {
  const { t, i18n } = useTranslation()
  const numLocale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  const [delta, setDelta] = useState(presetDelta ?? 0)
  const [reasonPreset, setReasonPreset] = useState('')
  const [reasonCustom, setReasonCustom] = useState('')

  useEffect(() => {
    if (open) {
      setDelta(presetDelta ?? 0)
      setReasonPreset('')
      setReasonCustom('')
    }
  }, [open, presetDelta])

  const isAdd = delta > 0
  const presets = isAdd ? ADJUST_REASON_PRESETS.add : ADJUST_REASON_PRESETS.deduct
  const finalReason = reasonCustom.trim() || reasonPreset
  const canApply = delta !== 0 && finalReason && !loading

  return (
    <Modal isOpen={open} onClose={onClose} title={t('tenantAdmin.customers.adjustPointsTitle')} size="md">
      {!customer ? null : (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-dark-card border border-dark-border">
            <p className="text-xs text-muted">{t('common.customers')}</p>
            <p className="text-sm text-off-white font-medium">{customer.name}</p>
            <p className="text-xs text-muted mt-1">
              {t('tenantAdmin.customers.currentBalance')} <span className="text-brand font-semibold tabular-nums">{(customer.loyaltyPoints || 0).toLocaleString(numLocale)}</span> {t('tenantAdmin.customers.pointsUnit')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">{t('tenantAdmin.customers.pointAmount')}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={delta}
                onChange={e => setDelta(Number(e.target.value) || 0)}
                placeholder={t('tenantAdmin.customers.pointAmountPlaceholder')}
                className="flex-1 bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm text-center outline-none focus:border-brand/60 tabular-nums"
              />
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[-50, -10, -5, +5, +10, +25, +50, +100].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDelta(n)}
                  className={`px-2 py-1 rounded-md text-xs tabular-nums border transition-colors ${
                    delta === n
                      ? (n > 0 ? 'bg-emerald-500/30 border-emerald-500 text-emerald-200' : 'bg-red-500/30 border-red-500 text-red-200')
                      : (n > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20' : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20')
                  }`}
                >
                  {n > 0 ? `+${n}` : n}
                </button>
              ))}
            </div>
            {delta !== 0 && (
              <p className="text-[11px] text-muted mt-1.5">
                {t('tenantAdmin.customers.balanceAfter')} <span className="text-brand font-semibold tabular-nums">{Math.max(0, (customer.loyaltyPoints || 0) + delta).toLocaleString(numLocale)}</span> {t('tenantAdmin.customers.pointsUnit')}
                {(customer.loyaltyPoints || 0) + delta < 0 && (
                  <span className="text-amber-400 ml-1.5">{t('tenantAdmin.customers.heldAtZero')}</span>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">{t('tenantAdmin.customers.reason')} <span className="text-red-400">*</span></label>
            <select
              value={reasonPreset}
              onChange={e => { setReasonPreset(e.target.value); setReasonCustom('') }}
              disabled={delta === 0}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60 disabled:opacity-50"
            >
              <option value="">{isAdd ? t('tenantAdmin.customers.selectReasonAdd') : t('tenantAdmin.customers.selectReasonDeduct')}</option>
              {presets.map(r => <option key={r} value={t(`tenantAdmin.customers.${r}`)}>{t(`tenantAdmin.customers.${r}`)}</option>)}
            </select>
            <input
              type="text"
              value={reasonCustom}
              onChange={e => { setReasonCustom(e.target.value); if (e.target.value) setReasonPreset('') }}
              placeholder={t('tenantAdmin.customers.customReasonPlaceholder')}
              maxLength={200}
              disabled={delta === 0}
              className="w-full mt-2 bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60 placeholder-muted disabled:opacity-50"
            />
            <p className="text-[10px] text-muted mt-1">{t('tenantAdmin.customers.reasonAuditNote')}</p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
            <Button
              fullWidth
              variant={isAdd ? 'primary' : 'danger'}
              onClick={() => onConfirm({ delta, reason: finalReason })}
              disabled={!canApply}
              loading={loading}
            >
              {isAdd ? t('tenantAdmin.customers.addPoints', { count: delta }) : t('tenantAdmin.customers.deductPoints', { count: Math.abs(delta) })}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Customer Detail Drawer ─────────────────────────────────────────────────
function CustomerDetailDrawer({ open, onClose, customerId, onEdit, onDelete }) {
  const { t, i18n } = useTranslation()
  const numLocale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  const { data: customer, isLoading, isError, refetch } = useCustomer(customerId)
  const { data: historyData, isLoading: historyLoading, isError: historyError } = usePointHistory(customerId, { limit: 50 })
  const updateLoyalty = useUpdateLoyalty()
  const toast = useToast()
  const [adjustPreset, setAdjustPreset] = useState(null) // null | number
  const [adjustOpen, setAdjustOpen]     = useState(false)

  const openAdjust = (preset = 0) => {
    setAdjustPreset(preset)
    setAdjustOpen(true)
  }

  const submitAdjust = async ({ delta, reason }) => {
    if (!customer || !delta || !reason) return
    try {
      await updateLoyalty.mutateAsync({ id: customer.id, points: delta, reason })
      toast.success(delta > 0 ? t('tenantAdmin.customers.pointsAddedToast', { count: delta, reason }) : t('tenantAdmin.customers.pointsDeductedToast', { count: delta, reason }))
      setAdjustOpen(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.customers.pointsChangeFailed'))
    }
  }

  const segment = customer ? getSegment(customer.visitCount, customer.lastVisitAt) : null
  const segLabel = segmentLabel(t, segment)

  return (
    <Modal isOpen={open} onClose={onClose} size="lg" title={t('tenantAdmin.customers.customerDetail')}>
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-dark-card/60 animate-pulse" />)}
        </div>
      ) : isError || !customer ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-off-white font-medium">{t('tenantAdmin.customers.detailLoadError')}</p>
          <p className="text-xs text-muted mt-1">{t('tenantAdmin.customers.checkConnectionRetry')}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> {t('common.retry')}
          </Button>
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
                  <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand truncate">
                    <Phone className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{customer.phone}</span>
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:text-brand truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{customer.email}</span>
                  </a>
                )}
                {customer.birthDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <Cake className="w-3.5 h-3.5 shrink-0" />
                    {formatDate(customer.birthDate)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {t('tenantAdmin.customers.sinceDate', { date: formatDate(customer.createdAt) })}
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
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">{t('tenantAdmin.customers.totalSpend')}</p>
              <p className="text-base sm:text-lg font-bold text-brand tabular-nums truncate">
                <span className="sm:hidden">{formatRupiahShort(customer.lifetimeValue || 0)}</span>
                <span className="hidden sm:inline">{formatRupiah(customer.lifetimeValue || 0)}</span>
              </p>
            </Card>
            <Card className="p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">{t('common.transactions')}</p>
              <p className="text-base sm:text-lg font-bold text-off-white tabular-nums truncate">
                {customer.lifetimeTxCount || 0}
              </p>
            </Card>
            <Card className="p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">{t('tenantAdmin.customers.avgTicket')}</p>
              <p className="text-base sm:text-lg font-bold text-off-white tabular-nums truncate">
                <span className="sm:hidden">{formatRupiahShort(customer.avgTicket || 0)}</span>
                <span className="hidden sm:inline">{formatRupiah(customer.avgTicket || 0)}</span>
              </p>
            </Card>
            <Card className="p-3 min-w-0 overflow-hidden">
              <p className="text-[10px] text-muted uppercase tracking-wide truncate">{t('tenantAdmin.customers.lastVisit')}</p>
              <p className="text-xs font-medium text-off-white truncate">
                {lastVisitLabel(customer.lastVisitAt, i18n.language) || '—'}
              </p>
            </Card>
          </div>

          {/* Loyalty: saldo + adjust + alur + riwayat */}
          <Card className="p-3 sm:p-4 bg-brand/5 border-brand/20">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] text-muted uppercase tracking-wide font-medium inline-flex items-center gap-1">
                  <Star className="w-3 h-3 fill-brand text-brand" /> {t('tenantAdmin.customers.loyaltyPoints')}
                </p>
                <p className="text-3xl font-display font-bold text-brand tabular-nums leading-none mt-1">
                  {(customer.loyaltyPoints || 0).toLocaleString(numLocale)}
                </p>
                <p className="text-[11px] text-muted mt-1">
                  {customer.lifetimeTxCount > 0
                    ? t('tenantAdmin.customers.lifetimePtsFromTx', { count: Math.floor((customer.lifetimeValue || 0) / 10_000).toLocaleString(numLocale) })
                    : t('tenantAdmin.customers.noPointsYet')}
                </p>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <button
                  type="button"
                  onClick={() => openAdjust(0)}
                  className="px-3 py-1.5 rounded-lg bg-brand text-dark text-xs font-semibold hover:bg-brand-light inline-flex items-center gap-1.5"
                >
                  <Edit2 className="w-3 h-3" />
                  {t('tenantAdmin.customers.adjustPoints')}
                </button>
                <div className="flex gap-1">
                  {[-10, +10, +25, +50].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => openAdjust(n)}
                      className={`px-2 py-0.5 rounded-md text-[11px] tabular-nums border transition-colors ${
                        n > 0
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                          : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                      }`}
                    >
                      {n > 0 ? `+${n}` : n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Earning rules — alur poin yang dijelaskan */}
            <div className="mt-3 pt-3 border-t border-brand/20">
              <p className="text-[11px] text-muted uppercase tracking-wide font-medium mb-1.5 inline-flex items-center gap-1">
                <Award className="w-3 h-3 text-brand" /> {t('tenantAdmin.customers.howToEarnPoints')}
              </p>
              <ul className="space-y-1 text-[11px] text-off-white">
                <li className="flex items-center justify-between gap-2">
                  <span>{t('tenantAdmin.customers.earnAutoPos')}</span>
                  <span className="text-brand tabular-nums">{t('tenantAdmin.customers.earnAutoPosValue')}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>{t('tenantAdmin.customers.earnManualAdjust')}</span>
                  <span className="text-muted">{t('tenantAdmin.customers.earnManualReason')}</span>
                </li>
              </ul>
              <p className="text-[10px] text-muted mt-1.5 leading-relaxed">
                {t('tenantAdmin.customers.earnConnectionNote')}
              </p>
            </div>
          </Card>

          {/* Riwayat Pergerakan Poin (Ledger) */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 inline-flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> {t('tenantAdmin.customers.pointLedgerTitle')}
              {historyData?.items?.length > 0 && (
                <span className="text-muted normal-case font-normal">
                  ({historyData.items.length}{historyData.meta?.hasMore ? '+' : ''})
                </span>
              )}
            </p>
            {historyLoading ? (
              <div className="space-y-1.5">
                {[0,1,2].map(i => <div key={i} className="h-10 rounded-lg bg-dark-card/60 animate-pulse" />)}
              </div>
            ) : historyError ? (
              <p className="text-sm text-amber-400 text-center py-6 bg-dark-card/30 rounded-xl border border-dashed border-dark-border inline-flex items-center justify-center gap-2 w-full">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {t('tenantAdmin.customers.pointLedgerError')}
              </p>
            ) : !historyData?.items?.length ? (
              <p className="text-sm text-muted text-center py-6 bg-dark-card/30 rounded-xl border border-dashed border-dark-border">
                {t('tenantAdmin.customers.noPointMovement')}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {historyData.items.map(h => {
                  const style = POINT_TYPE_STYLE[h.type] || POINT_TYPE_STYLE.adjust
                  const isPositive = h.delta > 0
                  return (
                    <div key={h.id} className={`flex items-center gap-2 p-2 rounded-lg border min-w-0 ${style.bg} ${style.border}`}>
                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${style.text} bg-dark-surface/50 border ${style.border}`}>
                        {h.type === 'earn'
                          ? <ShoppingBag className="w-3.5 h-3.5" />
                          : h.type === 'adjust'
                            ? <Edit2 className="w-3.5 h-3.5" />
                            : <Star className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-off-white truncate font-medium inline-flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.text} border ${style.border} font-semibold`}>
                            {t(`tenantAdmin.customers.${style.labelKey}`)}
                          </span>
                          {h.reason || (h.transaction
                            ? t('tenantAdmin.customers.ledgerTransaction', { amount: formatRupiahShort(h.transaction.total || 0) })
                            : h.type === 'earn' ? t('tenantAdmin.customers.ledgerAutoEarn') : t('tenantAdmin.customers.ledgerAdjustment'))}
                        </p>
                        <p className="text-[11px] text-muted truncate">
                          {formatDateTime(h.createdAt)}
                          {h.actorName && <> · {t('tenantAdmin.customers.byActor')} <span className="text-off-white">{h.actorName}</span></>}
                          {h.transaction && <> · {t('tenantAdmin.customers.balanceAfterShort')} <span className="text-off-white tabular-nums">{h.balanceAfter.toLocaleString(numLocale)}</span></>}
                        </p>
                      </div>
                      <div className={`shrink-0 text-sm font-bold tabular-nums ${isPositive ? 'text-emerald-300' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{h.delta}
                      </div>
                    </div>
                  )
                })}
                {historyData.meta?.hasMore && (
                  <p className="text-[10px] text-muted text-center pt-1">{t('tenantAdmin.customers.ledgerShowingRecent')}</p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          {customer.notes && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">{t('tenantAdmin.customers.notes')}</p>
              <p className="text-sm text-off-white bg-dark-card/50 border border-dark-border/60 rounded-xl p-3 leading-relaxed">
                {customer.notes}
              </p>
            </div>
          )}

          {/* Recent Transactions */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 inline-flex items-center gap-2">
              <ShoppingBag className="w-3.5 h-3.5" /> {t('tenantAdmin.customers.recentTransactions')}
              <span className="text-muted normal-case font-normal">{t('tenantAdmin.customers.max20')}</span>
            </p>
            {(customer.transactions || []).length === 0 ? (
              <p className="text-sm text-muted text-center py-6">{t('tenantAdmin.customers.noTransactionsYet')}</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {customer.transactions.map(tx => {
                  const ptsEarned = Math.floor((tx.total || 0) / 10_000)
                  return (
                    <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg bg-dark-card/40 border border-dark-border/60 min-w-0">
                      <div className="shrink-0 w-8 h-8 rounded-lg bg-brand/10 border border-brand/30 flex items-center justify-center text-brand">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-off-white truncate font-medium">
                          {(tx.items || []).map(i => i.name).join(', ') || t('common.transactions')}
                        </p>
                        <p className="text-[11px] text-muted truncate inline-flex items-center gap-1.5">
                          <span>{formatDateTime(tx.createdAt)}</span>
                          {tx.branch?.name && <><span className="opacity-50">·</span><span className="truncate">{tx.branch.name}</span></>}
                          {ptsEarned > 0 && (
                            <>
                              <span className="opacity-50">·</span>
                              <span className="inline-flex items-center gap-0.5 text-brand whitespace-nowrap">
                                <Star className="w-2.5 h-2.5 fill-brand" /> +{ptsEarned}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-brand tabular-nums whitespace-nowrap">
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
                <Calendar className="w-3.5 h-3.5" /> {t('tenantAdmin.customers.recentBookings')}
              </p>
              <div className="space-y-1.5">
                {customer.bookings.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center gap-2 p-2 rounded-lg bg-dark-card/40 border border-dark-border/60 min-w-0">
                    <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-300">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-off-white truncate font-medium">{b.serviceName || t('nav.booking')}</p>
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
            <Button variant="outline" fullWidth onClick={onClose}>{t('common.close')}</Button>
            <Button variant="outline" fullWidth icon={Edit2} onClick={() => { onEdit(customer); onClose() }}>{t('common.edit')}</Button>
            {onDelete && (
              <Button variant="outline" fullWidth icon={Trash2} onClick={() => onDelete(customer)} className="text-red-400 border-red-500/40 hover:bg-red-500/10">
                {t('common.delete')}
              </Button>
            )}
          </div>
        </div>
      )}

      <AdjustPointsModal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        customer={customer}
        presetDelta={adjustPreset}
        onConfirm={submitAdjust}
        loading={updateLoyalty.isPending}
      />
    </Modal>
  )
}

// ─── Form Modal ─────────────────────────────────────────────────────────────
function CustomerFormModal({ open, onClose, editing, onSave, saving }) {
  const { t } = useTranslation()
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
    if (!form.name.trim()) e.name = t('tenantAdmin.customers.errNameRequired')
    if (!form.phone.trim()) e.phone = t('tenantAdmin.customers.errPhoneRequired')
    if (form.phone && !/^[0-9+\-\s()]{6,20}$/.test(form.phone.trim())) e.phone = t('tenantAdmin.customers.errPhoneInvalid')
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t('tenantAdmin.customers.errEmailInvalid')
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
      title={editing ? t('tenantAdmin.customers.editCustomer') : t('tenantAdmin.customers.addCustomer')}
    >
      <div className="space-y-5">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{t('tenantAdmin.customers.basicInfo')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={`${t('common.name')} *`}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t('tenantAdmin.customers.fullNamePlaceholder')}
              error={errors.name}
            />
            <Input
              label={`${t('tenantAdmin.customers.phoneLabel')} *`}
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="08xxxxxxxxxx"
              inputMode="tel"
              error={errors.phone}
            />
            <Input
              label={t('common.email')}
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="email@contoh.com"
              error={errors.email}
            />
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.customers.gender')}</label>
              <select
                value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand/60 cursor-pointer"
              >
                <option value="">{t('tenantAdmin.customers.genderUnset')}</option>
                <option value="L">{t('tenantAdmin.customers.genderMale')}</option>
                <option value="P">{t('tenantAdmin.customers.genderFemale')}</option>
              </select>
            </div>
            <div className="sm:col-span-2 sm:max-w-[50%]">
              <Input
                label={t('tenantAdmin.customers.birthDate')}
                type="date"
                value={form.birthDate}
                onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                hint={t('tenantAdmin.customers.birthDateHint')}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-dark-border pt-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">{t('tenantAdmin.customers.addressOptional')}</p>
          <WilayahSelect
            value={form.address}
            onChange={address => setForm(f => ({ ...f, address }))}
          />
        </div>

        <div className="border-t border-dark-border pt-5">
          <Input
            label={t('tenantAdmin.customers.notes')}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder={t('tenantAdmin.customers.notesFormPlaceholder')}
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <Button variant="outline" fullWidth onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button fullWidth onClick={submit} loading={saving}>
            {editing ? t('tenantAdmin.customers.saveChanges') : t('tenantAdmin.customers.addCustomer')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function TACustomersPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const { user } = useAuthStore()
  const { branchId: urlBranchSlug } = useParams()
  const { data: branches = [] } = useBranches(user?.tenantId)

  // Halaman dipakai admin (lihat SEMUA cabang) DAN kasir/barber (terkunci ke
  // cabang aktif supaya data antar-cabang tak tercampur). Staff scope = bukan
  // admin/owner. Cabang aktif diambil dari slug URL (sumber kebenaran konteks,
  // mis. /jakarta/kasir/customers), fallback ke branch milik user. Saat aktif,
  // daftar + pencarian + tile statistik semuanya dibatasi ke cabang ini.
  const isStaffScope = !!user && user.role !== 'tenant_admin' && user.role !== 'super_admin'
  const scopedBranch =
    branches.find(b => matchesBranch(urlBranchSlug, b)) ||
    branches.find(b => b.id === user?.branchId) ||
    null
  const branchScopeId = isStaffScope ? (scopedBranch?.id || user?.branchId || null) : null

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
    // Kasir/barber: kunci daftar + pencarian ke cabang aktif (anti-campur).
    if (branchScopeId) { f.branchId = branchScopeId; f.branchStrict = 1 }
    return f
  }, [page, sortConfig.sortBy, sortConfig.sortDir, debouncedSearch, segment, provinsi, gender, dormantDays, birthMonthFilter, branchScopeId])

  const customersQuery = useCustomers(queryFilters)
  const items = customersQuery.customers
  const totalItems = customersQuery.total
  const totalPages = customersQuery.totalPages || Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const statsQuery = useCustomerStats(branchScopeId ? { branchId: branchScopeId, branchStrict: true } : undefined)
  const stats = statsQuery.data || {
    total: 0, vip: 0, loyal: 0, new: 0, atRisk: 0, lost: 0, never: 0,
    regular: 0, inactive: 0, // backward compat
    avgLoyalty: 0, avgVisits: 0, withEmail: 0, withAddress: 0, byProvince: [],
    thresholds: DEFAULT_THRESHOLDS,
  }
  const statsLoading = statsQuery.isLoading
  // Saat stats belum siap (loading/error), tile angka tampil skeleton/"—" —
  // bukan "0" yang menyesatkan. byProvince/thresholds tetap pakai default aman.
  const statReady = !!statsQuery.data
  const tileVal = (v) => (statReady ? v : null)

  // Daftar provinsi dari stats endpoint (server-side aggregate, bukan dari current page).
  // Fallback ke derive dari current items kalau byProvince belum tersedia.
  const allProvinces = useMemo(() => {
    if (Array.isArray(stats.byProvince) && stats.byProvince.length) {
      return stats.byProvince.map(p => p.name)
    }
    return [...new Set(items.filter(c => c.address?.provinsi).map(c => c.address.provinsi))].sort()
  }, [stats.byProvince, items])

  // Halaman ini dipakai oleh tenant_admin DAN kasir. Kasir tak punya akses
  // backend untuk delete/bulk-delete/export, jadi UI tombol-tombol itu
  // disembunyikan untuk role kasir (defense-in-depth: backend juga 403).
  const canManage = user?.role !== 'kasir'

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
        toast.success(t('tenantAdmin.customers.customerUpdated'))
      } else {
        await createM.mutateAsync(payload)
        toast.success(t('tenantAdmin.customers.customerAdded'))
      }
      setShowForm(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    }
  }

  const handleDelete = (c) => setConfirmDel(c)
  const confirmDelete = async () => {
    if (!confirmDel) return
    try {
      await deleteM.mutateAsync(confirmDel.id)
      toast.success(t('tenantAdmin.customers.customerDeleted'))
      if (detailId === confirmDel.id) setDetailId(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.deleteFailed'))
    }
  }

  const exportCSV = async () => {
    if (totalItems === 0) {
      toast.error(t('tenantAdmin.customers.noExportData'))
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
        toast.error(t('tenantAdmin.customers.noExportData'))
        return
      }
      const header = [
        t('tenantAdmin.customers.csvName'),
        t('common.phone'),
        t('common.email'),
        t('tenantAdmin.customers.csvGender'),
        t('tenantAdmin.customers.segment'),
        t('tenantAdmin.customers.visits'),
        t('tenantAdmin.customers.totalSpend'),
        t('common.transactions'),
        t('tenantAdmin.customers.loyaltyPoints'),
        t('tenantAdmin.customers.province'),
        t('tenantAdmin.customers.csvJoined'),
      ]
      const rows = all.map(c => [
        c.name,
        c.phone || '',
        c.email || '',
        c.gender || '',
        segmentLabel(t, getSegment(c.visitCount, c.lastVisitAt)) || '—',
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
        ? t('tenantAdmin.customers.exportCappedNote')
        : ''
      toast.success(t('tenantAdmin.customers.exportSuccess', { count: rows.length, note }))
    } catch (err) {
      toast.error(t('tenantAdmin.customers.exportFailed', { message: err?.response?.data?.error || err?.message || 'Unknown' }))
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
      toast.success(t('tenantAdmin.customers.bulkDeleted', { count: result?.count ?? ids.length }))
      setSelected(new Set())
      setConfirmBulkDel(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.customers.bulkDeleteFailed'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white inline-flex items-center gap-2 flex-wrap">
            <Users className="w-5 h-5 text-brand" /> {t('tenantAdmin.customers.title')}
            {branchScopeId && scopedBranch?.name && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand bg-brand/10 border border-brand/30 rounded-full px-2 py-0.5">
                <MapPin className="w-3 h-3" /> {scopedBranch.name}
              </span>
            )}
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {t('tenantAdmin.customers.countLabel', { count: totalItems })}
            {branchScopeId ? t('tenantAdmin.customers.suffixThisBranch') : ''}
            {segment ? ` · ${segmentLabel(t, segment)}` : ''}
            {provinsi ? ` · ${provinsi}` : ''}
            {dormantDays > 0 ? t('tenantAdmin.customers.suffixDormant', { count: dormantDays }) : ''}
            {birthMonthFilter === 'current' ? t('tenantAdmin.customers.suffixBirthday') : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={exportCSV}
              disabled={exporting || totalItems === 0}
              title={totalItems > 0 ? t('tenantAdmin.customers.exportTitle', { count: totalItems }) : t('common.noData')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card/60 border border-dark-border text-muted text-xs font-medium hover:text-off-white hover:border-brand/40 disabled:opacity-50 transition-colors"
            >
              {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span className="hidden sm:inline">{t('tenantAdmin.customers.exportCsv')}</span>
            </button>
          )}
          <Button icon={Plus} onClick={openAdd}>{t('tenantAdmin.customers.addCustomer')}</Button>
        </div>
      </div>

      {/* ── Stats: 5 tile utama (skema time-aware tetap aktif di bawah) ────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <StatTile
          icon={Users}
          label={t('common.total')}
          value={tileVal(stats.total)}
          loading={statsLoading}
          accent="gold"
          hint={stats.total > 0 ? t('tenantAdmin.customers.avgVisitsHint', { count: stats.avgVisits || 0 }) : t('tenantAdmin.customers.noCustomers')}
          onClick={() => { setSegment(''); setPage(1) }}
          active={segment === ''}
          delay={0.02}
        />
        <StatTile
          icon={Crown}
          label={t('tenantAdmin.customers.segVip')}
          value={tileVal(stats.vip)}
          loading={statsLoading}
          accent="gold"
          hint={t('tenantAdmin.customers.hintVip')}
          onClick={() => setSegment(s => s === 'vip' ? '' : 'vip')}
          active={segment === 'vip'}
          delay={0.04}
        />
        <StatTile
          icon={BadgeCheck}
          label={t('tenantAdmin.customers.segLoyal')}
          value={tileVal(stats.loyal)}
          loading={statsLoading}
          accent="blue"
          hint={t('tenantAdmin.customers.hintLoyal')}
          onClick={() => setSegment(s => s === 'loyal' ? '' : 'loyal')}
          active={segment === 'loyal'}
          delay={0.06}
        />
        <StatTile
          icon={Sparkles}
          label={t('tenantAdmin.customers.segNew')}
          value={tileVal(stats.new)}
          loading={statsLoading}
          accent="green"
          hint={t('tenantAdmin.customers.hintNew')}
          onClick={() => setSegment(s => s === 'new' ? '' : 'new')}
          active={segment === 'new'}
          delay={0.08}
        />
        <StatTile
          icon={Activity}
          label={t('tenantAdmin.customers.segNever')}
          value={tileVal(stats.never ?? stats.inactive)}
          loading={statsLoading}
          accent="rose"
          hint={t('tenantAdmin.customers.hintNever')}
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
                placeholder={t('tenantAdmin.customers.searchPlaceholderFull')}
                className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-off-white"
                  aria-label={t('tenantAdmin.customers.clearSearch')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 cursor-pointer appearance-none"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(`tenantAdmin.customers.${o.labelKey}`)}</option>)}
            </select>
            <select
              value={gender}
              onChange={e => setGender(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 cursor-pointer appearance-none"
            >
              <option value="">{t('tenantAdmin.customers.allGenders')}</option>
              <option value="L">{t('tenantAdmin.customers.genderMale')}</option>
              <option value="P">{t('tenantAdmin.customers.genderFemale')}</option>
            </select>
            {allProvinces.length > 0 && (
              <select
                value={provinsi}
                onChange={e => setProvinsi(e.target.value)}
                className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 cursor-pointer appearance-none max-w-[160px]"
              >
                <option value="">{t('tenantAdmin.customers.allProvinces')}</option>
                {allProvinces.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/20"
              >
                <X className="w-3.5 h-3.5" /> {t('tenantAdmin.customers.resetCount', { count: activeFilterCount })}
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
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                    active
                      ? 'bg-brand border-brand text-dark'
                      : 'bg-dark-card/60 border-dark-border text-muted hover:text-off-white hover:border-brand/40'
                  }`}
                >
                  {t(`tenantAdmin.customers.${s.labelKey}`)}
                  {s.desc && !active && <span className="opacity-70 text-[10px]">{s.desc}</span>}
                </button>
              )
            })}
          </div>

          {/* Filter cepat: dormant (win-back) + ulang tahun.
              Dormant dijadikan segmented control — satu grup ringkas, bukan
              3 chip panjang yang membungkus berantakan di mobile. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-off-white font-semibold">{t('tenantAdmin.customers.quickLabel')}</span>

            <div className="inline-flex items-center gap-0.5 rounded-lg bg-dark-card/60 border border-dark-border p-0.5">
              <span className="inline-flex items-center gap-1 pl-1.5 pr-1 text-[11px] text-muted">
                <Clock className="w-3 h-3" /> {t('tenantAdmin.customers.dormant')}
              </span>
              {[30, 60, 90].map(days => {
                const active = dormantDays === days
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setDormantDays(active ? 0 : days)}
                    aria-pressed={active}
                    title={t('tenantAdmin.customers.dormantTitle', { count: days })}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium tabular-nums transition-colors ${
                      active
                        ? 'bg-amber-500/25 text-amber-300'
                        : 'text-muted hover:text-off-white hover:bg-dark-surface'
                    }`}
                  >
                    {days}+
                  </button>
                )
              })}
            </div>

            {(() => {
              const active = birthMonthFilter === 'current'
              return (
                <button
                  type="button"
                  onClick={() => setBirthMonthFilter(active ? '' : 'current')}
                  aria-pressed={active}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 border transition-colors ${
                    active
                      ? 'bg-pink-500/20 border-pink-500/40 text-pink-300'
                      : 'bg-dark-card/60 border-dark-border text-muted hover:text-off-white'
                  }`}
                >
                  <Cake className="w-3 h-3" /> {t('tenantAdmin.customers.birthdayThisMonth')}
                </button>
              )
            })()}
          </div>
        </div>
      </Card>

      {/* ── Bulk action bar ────────────────────────────────────────────────── */}
      {canManage && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 rounded-xl bg-dark-card border-2 border-brand shadow-brand">
          <div className="text-sm text-off-white inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand text-dark text-xs font-bold tabular-nums">
              {selected.size}
            </span>
            <span className="font-medium">{t('tenantAdmin.customers.customersSelected')}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-off-white hover:text-off-white px-2.5 py-1.5 rounded-lg border border-dark-border hover:border-dark-border"
            >{t('common.cancel')}</button>
            <button
              type="button"
              onClick={() => setConfirmBulkDel(true)}
              disabled={bulkDeleteM.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 border border-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t('tenantAdmin.customers.deleteCount', { count: selected.size })}
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
          <h3 className="font-display text-lg font-semibold text-off-white">{t('tenantAdmin.customers.loadError')}</h3>
          <p className="text-muted text-sm mt-1 max-w-md mx-auto">
            {customersQuery.error?.response?.data?.error || customersQuery.error?.message || t('tenantAdmin.customers.networkError')}
          </p>
          <div className="mt-4">
            <Button icon={RefreshCw} onClick={() => customersQuery.refetch()} loading={customersQuery.isFetching}>
              {t('common.retry')}
            </Button>
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center mb-3">
            <Users className="w-7 h-7 text-brand" />
          </div>
          <h3 className="font-display text-lg font-semibold text-off-white">
            {activeFilterCount > 0 ? t('tenantAdmin.customers.emptyFilteredTitle') : t('tenantAdmin.customers.noCustomers')}
          </h3>
          <p className="text-muted text-sm mt-1 max-w-md mx-auto">
            {activeFilterCount > 0
              ? t('tenantAdmin.customers.emptyFilteredDesc')
              : t('tenantAdmin.customers.emptyDesc')}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="outline" onClick={resetFilters}>{t('tenantAdmin.customers.resetFilter')}</Button>
            )}
            <Button icon={Plus} onClick={openAdd}>{t('tenantAdmin.customers.addCustomer')}</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Mobile list */}
          <div className="block md:hidden">
            <Card className="overflow-hidden">
              {canManage && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border bg-dark-card text-[11px] text-off-white font-medium">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={() => allOnPageSelected ? clearSelection() : selectAllOnPage()}
                    className="w-4 h-4 rounded border-dark-border bg-dark-surface accent-brand focus:ring-brand/40 cursor-pointer"
                    aria-label={t('tenantAdmin.customers.selectAllOnPageAria')}
                  />
                  <span>{t('tenantAdmin.customers.selectAllOnPage', { count: items.length })}</span>
                </div>
              )}
              {items.map(c => (
                <CustomerMobileCard
                  key={c.id}
                  customer={c}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={canManage ? handleDelete : undefined}
                  selected={selected.has(c.id)}
                  onToggleSelect={canManage ? toggleSelect : undefined}
                />
              ))}
            </Card>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-dark-border bg-dark-card text-[11px] font-semibold text-off-white uppercase tracking-wider">
                {canManage && (
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={() => allOnPageSelected ? clearSelection() : selectAllOnPage()}
                    className="w-4 h-4 rounded border-dark-border bg-dark-surface accent-brand focus:ring-brand/40 shrink-0 cursor-pointer"
                    aria-label={t('tenantAdmin.customers.selectAllOnPageAria')}
                  />
                )}
                <div className="w-8 shrink-0" />
                <div className="flex-1 min-w-0">{t('tenantAdmin.customers.title')}</div>
                <div className="hidden xl:block w-28 shrink-0">{t('tenantAdmin.customers.province')}</div>
                <div className="w-[88px] shrink-0">{t('tenantAdmin.customers.segment')}</div>
                <div className="hidden md:block w-24 text-right shrink-0">{t('tenantAdmin.customers.totalSpend')}</div>
                <div className="hidden lg:block w-16 text-center shrink-0">{t('tenantAdmin.customers.visits')}</div>
                <div className="w-16 text-center shrink-0">{t('tenantAdmin.customers.points')}</div>
                <div className="hidden lg:block w-20 text-right shrink-0">{t('tenantAdmin.customers.joined')}</div>
                <div className="w-[60px] shrink-0" />
              </div>
              {items.map(c => (
                <CustomerTableRow
                  key={c.id}
                  customer={c}
                  onOpen={openDetail}
                  onEdit={openEdit}
                  onDelete={canManage ? handleDelete : undefined}
                  selected={selected.has(c.id)}
                  onToggleSelect={canManage ? toggleSelect : undefined}
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
                <span className="hidden sm:inline">{t('tenantAdmin.customers.prevPage')}</span>
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
                <span className="hidden sm:inline">{t('tenantAdmin.customers.nextPage')}</span>
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
        onDelete={canManage ? ((c) => handleDelete(c)) : undefined}
      />

      <ConfirmDialog
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={confirmDelete}
        title={t('tenantAdmin.customers.deleteConfirmTitle')}
        description={t('tenantAdmin.customers.deleteConfirmDesc', { name: confirmDel?.name || '' })}
        confirmText={t('tenantAdmin.customers.confirmDelete')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulkDel}
        onClose={() => setConfirmBulkDel(false)}
        onConfirm={handleBulkDelete}
        title={t('tenantAdmin.customers.bulkDeleteTitle', { count: selected.size })}
        description={t('tenantAdmin.customers.bulkDeleteDesc', { count: selected.size })}
        confirmText={t('tenantAdmin.customers.confirmDeleteCount', { count: selected.size })}
        variant="danger"
      />

      {customersQuery.isFetching && !customersQuery.isLoading && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-dark-card/90 border border-dark-border text-xs text-muted shadow-card backdrop-blur">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          {t('tenantAdmin.customers.syncing')}
        </div>
      )}
    </div>
  )
}

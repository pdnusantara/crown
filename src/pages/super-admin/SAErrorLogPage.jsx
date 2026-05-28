import React, { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, AlertTriangle, Info, CheckCircle, Search,
  Filter, Trash2, ChevronDown, ChevronUp, RefreshCw, Clock,
  X, Check, ShieldAlert, Globe, Code2, CreditCard, Zap,
  Download, Copy, Layers, List, ExternalLink, TrendingUp,
  Radio,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { id as localeId, enUS as localeEn } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import {
  useErrorLogs, useErrorLogStats, useErrorLogTrend,
  useResolveError, useBulkResolveErrors, useDeleteErrorLogs,
} from '../../hooks/useErrorLogs.js'
import { useTenants } from '../../hooks/useTenants.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { formatDateTimeInTz, getTenantTimezone, DEFAULT_TZ } from '../../utils/timezone.js'

// ── Config ─────────────────────────────────────────────────────────────────────
const LEVEL_CFG = {
  error:   { icon: AlertCircle,   color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20',    barColor: '#F87171', dot: 'bg-red-400'    },
  warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/20',  barColor: '#FBBF24', dot: 'bg-amber-400'  },
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20',   barColor: '#60A5FA', dot: 'bg-blue-400'   },
}
const TYPE_CFG = {
  api_error:     { icon: Globe,       color: 'text-red-400',    i18nKey: 'typeApi'     },
  js_error:      { icon: Code2,       color: 'text-orange-400', i18nKey: 'typeJs'      },
  payment_error: { icon: CreditCard,  color: 'text-amber-400',  i18nKey: 'typePayment' },
  system_error:  { icon: Zap,         color: 'text-purple-400', i18nKey: 'typeSystem'  },
  auth_error:    { icon: ShieldAlert, color: 'text-pink-400',   i18nKey: 'typeAuth'    },
}

const PAGE_LIMIT = 50

// Pick date-fns locale based on i18n language so distance strings ("2 hours ago"
// vs "2 jam yang lalu") match the rest of the UI.
function pickLocale(lng) {
  return (lng || '').toLowerCase().startsWith('en') ? localeEn : localeId
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function escapeCsv(v) {
  if (v == null) return ''
  const s = String(v)
  return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCSV(logs) {
  const cols = ['id', 'level', 'type', 'message', 'path', 'method', 'statusCode', 'tenantId', 'tenantName', 'resolved', 'resolvedAt', 'resolvedBy', 'createdAt']
  const rows = logs.map(l => cols.map(c => escapeCsv(l[c])).join(','))
  const csv  = '﻿' + [cols.join(','), ...rows].join('\n')
  const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a    = Object.assign(document.createElement('a'), { href: url, download: `error-logs-${new Date().toISOString().slice(0, 10)}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function groupByMessage(logs) {
  const map = new Map()
  for (const log of logs) {
    const key = log.message.trim().toLowerCase().slice(0, 120)
    if (!map.has(key)) map.set(key, { message: log.message, count: 0, entries: [], types: new Set(), levels: new Set() })
    const g = map.get(key)
    g.count++
    g.entries.push(log)
    g.types.add(log.type)
    g.levels.add(log.level)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyBtn({ text, className = '' }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const handleCopy = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-all ${copied ? 'border-green-400/40 text-green-400 bg-green-400/10' : 'border-dark-border text-muted hover:border-brand/30 hover:text-off-white'} ${className}`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? t('superAdmin.errorLog.copied') : t('superAdmin.errorLog.copy')}
    </button>
  )
}

// ── Chart Tooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, tz, lng }) {
  if (!active || !payload?.length) return null
  let pretty = label
  try {
    pretty = new Intl.DateTimeFormat(lng || 'id-ID', { weekday: 'short', day: '2-digit', month: 'short', timeZone: tz || DEFAULT_TZ }).format(new Date(`${label}T12:00:00.000Z`))
  } catch { /* keep raw */ }
  return (
    <div className="glass rounded-xl px-3 py-2.5 text-xs">
      <p className="text-muted mb-1.5 font-medium">{pretty}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-off-white">{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, iconColor, sub, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Icon size={15} className={iconColor} />
        </div>
        <p className="text-2xl font-bold text-off-white tabular-nums">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </Card>
    </motion.div>
  )
}

// ── Single flat row ────────────────────────────────────────────────────────────
function ErrorRow({ log, selected, onSelect, onResolve, t, dateLocale, tz }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const lvl      = LEVEL_CFG[log.level]  || LEVEL_CFG.error
  const type     = TYPE_CFG[log.type]    || TYPE_CFG.api_error
  const LvlIcon  = lvl.icon
  const TypeIcon = type.icon

  return (
    <div className={`border-b border-dark-border/40 transition-colors ${log.resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-dark-surface/40 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <div className="mt-0.5 flex-shrink-0" onClick={e => { e.stopPropagation(); onSelect(log.id) }}>
          <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${selected ? 'bg-brand border-brand' : 'border-dark-border hover:border-brand/50'}`}>
            {selected && <Check size={10} className="text-dark" strokeWidth={3} />}
          </div>
        </div>

        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${lvl.bg}`}>
          <LvlIcon size={13} className={lvl.color} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium text-off-white leading-tight break-words max-w-xl">{log.message}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {log.resolved && (
                <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">
                  <CheckCircle size={9} /> {t('superAdmin.errorLog.filterResolved')}
                </span>
              )}
              <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${lvl.border} ${lvl.bg} ${lvl.color}`}>
                {t(`superAdmin.errorLog.level${log.level === 'error' ? 'Error' : log.level === 'warning' ? 'Warning' : 'Info'}`)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`flex items-center gap-1 text-xs ${type.color}`}>
              <TypeIcon size={11} /> {t(`superAdmin.errorLog.${type.i18nKey}`)}
            </span>
            {log.path && (
              <span className="text-xs text-muted font-mono break-all">
                {log.method && <span className="text-blue-400 mr-1">{log.method}</span>}
                {log.path}
                {log.statusCode && <span className="text-red-400 ml-1">{log.statusCode}</span>}
              </span>
            )}
            {log.tenantId && (
              <button
                onClick={e => { e.stopPropagation(); navigate(`/super-admin/tenants/${log.tenantId}`) }}
                className="flex items-center gap-1 text-xs text-blue-400/80 hover:text-blue-400 transition-colors"
              >
                <ExternalLink size={10} />
                {log.tenantName || `${log.tenantId.slice(0, 8)}…`}
              </button>
            )}
            <span className="text-xs text-muted flex items-center gap-1" title={formatDateTimeInTz(log.createdAt, tz)}>
              <Clock size={10} />
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: dateLocale })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {!log.resolved && (
            <button onClick={e => { e.stopPropagation(); onResolve(log.id) }}
              className="p-1.5 rounded-lg text-muted hover:text-green-400 hover:bg-green-400/10 transition-all" title={t('superAdmin.errorLog.bulkResolveAll')}>
              <CheckCircle size={14} />
            </button>
          )}
          <button className="p-1 text-muted hover:text-off-white transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-14 pb-4 space-y-3">
              {log.stack && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-muted uppercase font-semibold">{t('superAdmin.errorLog.stackTrace')}</p>
                    <CopyBtn text={log.stack} />
                  </div>
                  <pre className="text-[11px] text-red-300/80 bg-dark-surface border border-dark-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono max-h-56 overflow-y-auto">
                    {log.stack}
                  </pre>
                </div>
              )}
              {log.metadata && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-muted uppercase font-semibold">{t('superAdmin.errorLog.metadata')}</p>
                    <CopyBtn text={JSON.stringify(log.metadata, null, 2)} />
                  </div>
                  <pre className="text-[11px] text-off-white/70 bg-dark-surface border border-dark-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono max-h-36 overflow-y-auto">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
              {log.resolved && log.resolvedAt && (
                <p className="text-xs text-green-400/70">
                  {t('superAdmin.errorLog.resolvedAt', { time: formatDateTimeInTz(log.resolvedAt, tz) })}
                  {log.resolvedBy ? t('superAdmin.errorLog.resolvedBy', { name: log.resolvedBy }) : ''}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Grouped row ────────────────────────────────────────────────────────────────
function GroupedRow({ group, selected, onSelectGroup, onResolve, t, dateLocale, tz }) {
  const [expanded, setExpanded] = useState(false)
  const dominantLevel = group.levels.has('error') ? 'error' : group.levels.has('warning') ? 'warning' : 'info'
  const lvl  = LEVEL_CFG[dominantLevel]
  const LvlIcon = lvl.icon
  const allResolved = group.entries.every(e => e.resolved)

  return (
    <div className={`border-b border-dark-border/40 ${allResolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-dark-surface/40 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <div className="mt-0.5 flex-shrink-0" onClick={e => { e.stopPropagation(); onSelectGroup(group.entries.map(e => e.id)) }}>
          <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${selected ? 'bg-brand border-brand' : 'border-dark-border hover:border-brand/50'}`}>
            {selected && <Check size={10} className="text-dark" strokeWidth={3} />}
          </div>
        </div>

        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${lvl.bg}`}>
          <LvlIcon size={13} className={lvl.color} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-off-white leading-tight break-words max-w-xl">{group.message}</p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${lvl.bg} ${lvl.color} border ${lvl.border}`}>
              ×{group.count}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {[...group.types].map(typ => {
              const tc = TYPE_CFG[typ] || TYPE_CFG.api_error
              const Icn = tc.icon
              return (
                <span key={typ} className={`flex items-center gap-1 text-xs ${tc.color}`}>
                  <Icn size={11} /> {t(`superAdmin.errorLog.${tc.i18nKey}`)}
                </span>
              )
            })}
            <span className="text-xs text-muted flex items-center gap-1">
              <Clock size={10} />
              {t('superAdmin.errorLog.lastSeen', {
                time: formatDistanceToNow(new Date(group.entries[0].createdAt), { addSuffix: true, locale: dateLocale }),
              })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {!allResolved && (
            <button
              onClick={e => { e.stopPropagation(); onResolve(group.entries.filter(e => !e.resolved).map(e => e.id)) }}
              className="p-1.5 rounded-lg text-muted hover:text-green-400 hover:bg-green-400/10 transition-all" title={t('superAdmin.errorLog.bulkResolveAll')}>
              <CheckCircle size={14} />
            </button>
          )}
          <button className="p-1 text-muted hover:text-off-white transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-14 pb-3 space-y-1.5">
              <p className="text-[10px] text-muted uppercase font-semibold mb-2">{t('superAdmin.errorLog.occurrenceCount', { count: group.count })}</p>
              {group.entries.map(log => {
                const entryLvl = LEVEL_CFG[log.level] || LEVEL_CFG.error
                return (
                  <div key={log.id} className="flex items-center gap-2 p-2 rounded-xl bg-dark-surface/60 border border-dark-border/40">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entryLvl.dot}`} />
                    <span className="text-xs text-muted flex-1" title={formatDateTimeInTz(log.createdAt, tz)}>
                      {formatDateTimeInTz(log.createdAt, tz)}
                    </span>
                    {log.tenantName && (
                      <span className="text-xs text-blue-400/70 truncate max-w-[140px]">{log.tenantName}</span>
                    )}
                    {log.path && <span className="text-xs text-muted font-mono truncate max-w-[200px]">{log.method} {log.path}</span>}
                    {log.resolved && <CheckCircle size={12} className="text-green-400 flex-shrink-0" />}
                    {log.stack && <CopyBtn text={log.stack} />}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SAErrorLogPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const dateLocale = pickLocale(i18n.language)
  // Super-admin tidak punya tenant aktif → fallback ke default TZ.
  const tz = getTenantTimezone() || DEFAULT_TZ

  const [level,    setLevel]    = useState('')
  const [type,     setType]     = useState('')
  const [resolved, setResolved] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState('')
  const [search,   setSearch]   = useState('')
  const [grouped,  setGrouped]  = useState(false)
  const [limit,    setLimit]    = useState(PAGE_LIMIT)
  const [selected, setSelected] = useState(new Set())
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null) // { title, desc, opts }

  const filters = useMemo(() => {
    const f = { limit, page: 1, tz }
    if (level)    f.level    = level
    if (type)     f.type     = type
    if (resolved) f.resolved = resolved
    if (tenantId) f.tenantId = tenantId
    if (from)     f.from     = from
    if (to)       f.to       = to
    if (search)   f.search   = search
    return f
  }, [level, type, resolved, tenantId, from, to, search, limit, tz])

  // Reset window size whenever a filter changes so we re-anchor at the top.
  React.useEffect(() => { setLimit(PAGE_LIMIT) }, [level, type, resolved, tenantId, from, to, search])

  const { data: logsResp, isLoading, refetch, isFetching } = useErrorLogs(filters)
  const logs   = logsResp?.data || []
  const meta   = logsResp?.meta || { total: 0, totalPages: 1 }
  const { data: stats } = useErrorLogStats()
  const { data: trend = [] } = useErrorLogTrend(7, tz)
  const { data: tenants = [] } = useTenants()
  const resolveOne  = useResolveError()
  const bulkResolve = useBulkResolveErrors()
  const deleteLogs  = useDeleteErrorLogs()

  const groups      = useMemo(() => grouped ? groupByMessage(logs) : [], [logs, grouped])
  const allIds      = useMemo(() => logs.map(l => l.id), [logs])
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds))
  const toggleOne = useCallback((id) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  }), [])
  const selectMany = useCallback((ids) => setSelected(prev => {
    const next = new Set(prev); ids.forEach(id => next.has(id) ? next.delete(id) : next.add(id)); return next
  }), [])

  const handleResolveOne = (id) =>
    resolveOne.mutate({ id }, {
      onSuccess: () => { toast.success(t('superAdmin.errorLog.toastResolved')); setSelected(new Set()) },
      onError:   () => toast.error(t('superAdmin.errorLog.toastResolvedFailed')),
    })

  const handleResolveMany = (ids) =>
    bulkResolve.mutate(ids, {
      onSuccess: (d) => { toast.success(t('superAdmin.errorLog.toastBulkResolved', { count: d?.count ?? ids.length })); setSelected(new Set()) },
      onError:   () => toast.error(t('superAdmin.errorLog.toastBulkResolvedFailed')),
    })

  const performDelete = (opts) =>
    deleteLogs.mutate(opts, {
      onSuccess: (d) => {
        toast.success(t('superAdmin.errorLog.toastDeleted', { count: d?.deleted ?? 0 }))
        setShowDeleteMenu(false)
        setConfirmAction(null)
      },
      onError:   () => toast.error(t('superAdmin.errorLog.toastDeletedFailed')),
    })

  const askDelete = (kind) => {
    setShowDeleteMenu(false)
    if (kind === 'resolved') {
      setConfirmAction({
        title: t('superAdmin.errorLog.confirmDeleteResolvedTitle'),
        description: t('superAdmin.errorLog.confirmDeleteResolvedDesc'),
        opts: { onlyResolved: true },
      })
    } else if (kind === '7') {
      setConfirmAction({
        title: t('superAdmin.errorLog.confirmDeleteOldTitle', { days: 7 }),
        description: t('superAdmin.errorLog.confirmDeleteOldDesc', { days: 7 }),
        opts: { olderThanDays: 7 },
      })
    } else if (kind === '30') {
      setConfirmAction({
        title: t('superAdmin.errorLog.confirmDeleteOldTitle', { days: 30 }),
        description: t('superAdmin.errorLog.confirmDeleteOldDesc', { days: 30 }),
        opts: { olderThanDays: 30 },
      })
    } else if (kind === 'all') {
      setConfirmAction({
        title: t('superAdmin.errorLog.confirmDeleteAllTitle'),
        description: t('superAdmin.errorLog.confirmDeleteAllDesc'),
        opts: {},
      })
    }
  }

  const clearFilters = () => {
    setLevel(''); setType(''); setResolved(''); setTenantId('')
    setFrom(''); setTo(''); setSearch('')
  }
  const hasFilter = level || type || resolved || tenantId || from || to || search
  const hasTrend  = trend.some(d => d.total > 0)

  const remaining = Math.max(0, (meta.total || 0) - logs.length)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold brand-text">{t('superAdmin.errorLog.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.errorLog.pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-[10px] text-green-400 font-medium">
            <Radio size={10} className="animate-pulse" /> {t('superAdmin.errorLog.realtimeBadge')}
          </span>
          <Button
            variant="secondary" size="sm" icon={RefreshCw}
            onClick={() => refetch()}
            loading={isFetching && !isLoading}
          >
            {t('superAdmin.errorLog.refresh')}
          </Button>
          <Button
            variant="secondary" size="sm" icon={Download}
            onClick={() => exportCSV(logs)}
            disabled={logs.length === 0}
          >
            {t('superAdmin.errorLog.exportCsv')}
          </Button>
          <div className="relative">
            <button
              onClick={() => setShowDeleteMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border text-xs text-muted hover:border-red-400/30 hover:text-red-400 transition-all"
            >
              <Trash2 size={13} /> {t('superAdmin.errorLog.deleteMenu')} <ChevronDown size={11} />
            </button>
            <AnimatePresence>
              {showDeleteMenu && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 top-full mt-1.5 z-50 min-w-[230px] bg-dark-card border border-dark-border rounded-xl shadow-xl overflow-hidden"
                  >
                    {[
                      { kind: 'resolved', label: t('superAdmin.errorLog.deleteResolved') },
                      { kind: '7',        label: t('superAdmin.errorLog.deleteOlderThan7') },
                      { kind: '30',       label: t('superAdmin.errorLog.deleteOlderThan30') },
                      { kind: 'all',      label: t('superAdmin.errorLog.deleteAll'), danger: true },
                    ].map(item => (
                      <button key={item.kind} onClick={() => askDelete(item.kind)}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${item.danger ? 'text-red-400 hover:bg-red-400/10' : 'text-off-white hover:bg-dark-surface hover:text-red-400'}`}>
                        {item.label}
                      </button>
                    ))}
                  </motion.div>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDeleteMenu(false)} />
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('superAdmin.errorLog.kpiTotal')}      value={stats?.total}      icon={AlertCircle}   iconColor="text-red-400"    delay={0}    />
        <KpiCard
          label={t('superAdmin.errorLog.kpiUnresolved')}
          value={stats?.unresolved}
          icon={AlertTriangle}
          iconColor="text-amber-400"
          delay={0.05}
          sub={stats?.unresolved > 0 ? t('superAdmin.errorLog.kpiUnresolvedHintAction') : t('superAdmin.errorLog.kpiUnresolvedHintClean')}
        />
        <KpiCard label={t('superAdmin.errorLog.kpiWarnings')} value={stats?.warnings}   icon={AlertTriangle} iconColor="text-yellow-400" delay={0.1}  />
        <KpiCard label={t('superAdmin.errorLog.kpiToday')}    value={stats?.todayCount} icon={Clock}         iconColor="text-blue-400"   delay={0.15} />
      </div>

      {/* Trend Chart */}
      {hasTrend && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-brand" />
                  <h3 className="font-semibold text-off-white">{t('superAdmin.errorLog.trendTitle')}</h3>
                </div>
                <span className="text-xs text-muted">{t('superAdmin.errorLog.trendDays', { count: 7 })}</span>
              </div>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    tickLine={false}
                    tickFormatter={(v) => {
                      try {
                        return new Intl.DateTimeFormat(i18n.language || 'id-ID', { day: '2-digit', month: 'short', timeZone: tz }).format(new Date(`${v}T12:00:00.000Z`))
                      } catch { return v }
                    }}
                  />
                  <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip tz={tz} lng={i18n.language} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280', paddingTop: 8 }} />
                  <Bar dataKey="errors"   name={t('superAdmin.errorLog.levelError')}   fill={LEVEL_CFG.error.barColor}   radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="warnings" name={t('superAdmin.errorLog.levelWarning')} fill={LEVEL_CFG.warning.barColor} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="info"     name={t('superAdmin.errorLog.levelInfo')}    fill={LEVEL_CFG.info.barColor}    radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Filter Bar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted flex-shrink-0" />

          <select value={level} onChange={e => setLevel(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('superAdmin.errorLog.filterAllLevel')}</option>
            <option value="error">{t('superAdmin.errorLog.levelError')}</option>
            <option value="warning">{t('superAdmin.errorLog.levelWarning')}</option>
            <option value="info">{t('superAdmin.errorLog.levelInfo')}</option>
          </select>

          <select value={type} onChange={e => setType(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('superAdmin.errorLog.filterAllType')}</option>
            {Object.entries(TYPE_CFG).map(([k, v]) => (
              <option key={k} value={k}>{t(`superAdmin.errorLog.${v.i18nKey}`)}</option>
            ))}
          </select>

          <select value={resolved} onChange={e => setResolved(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('superAdmin.errorLog.filterAllStatus')}</option>
            <option value="false">{t('superAdmin.errorLog.filterUnresolved')}</option>
            <option value="true">{t('superAdmin.errorLog.filterResolved')}</option>
          </select>

          <select value={tenantId} onChange={e => setTenantId(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40 max-w-[160px]">
            <option value="">{t('superAdmin.errorLog.filterAllTenants')}</option>
            {tenants.map(tt => (
              <option key={tt.id} value={tt.id}>{tt.name}</option>
            ))}
          </select>

          <input
            type="date" value={from} onChange={e => setFrom(e.target.value)}
            placeholder={t('superAdmin.errorLog.filterDateFrom')}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40"
          />
          <input
            type="date" value={to} onChange={e => setTo(e.target.value)}
            placeholder={t('superAdmin.errorLog.filterDateTo')}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40"
          />

          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('superAdmin.errorLog.searchPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-brand/40" />
          </div>
          {hasFilter && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted hover:text-off-white">
              <X size={12} /> {t('superAdmin.errorLog.reset')}
            </button>
          )}
        </div>
      </Card>

      {/* Bulk Actions */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-brand/10 border border-brand/20 rounded-2xl">
              <span className="text-sm text-brand font-medium">{t('superAdmin.errorLog.bulkSelected', { count: selected.size })}</span>
              <Button size="sm" variant="secondary" icon={CheckCircle} onClick={() => handleResolveMany([...selected])} disabled={bulkResolve.isPending}>
                {t('superAdmin.errorLog.bulkResolveAll')}
              </Button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-off-white ml-auto">{t('superAdmin.errorLog.bulkCancel')}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${allSelected && allIds.length > 0 ? 'bg-brand border-brand' : 'border-dark-border hover:border-brand/50'}`} onClick={toggleAll}>
                {allSelected && allIds.length > 0 && <Check size={10} className="text-dark" strokeWidth={3} />}
                {selected.size > 0 && !allSelected && <div className="w-2 h-0.5 bg-brand rounded" />}
              </div>
              <h3 className="font-semibold text-off-white text-sm">
                {isLoading
                  ? t('superAdmin.errorLog.loading')
                  : grouped
                    ? `${groups.length} ${t('superAdmin.errorLog.groupCountSuffix')}`
                    : t('superAdmin.errorLog.totalEntries', { shown: logs.length, total: meta.total })}
                {hasFilter && <span className="text-muted font-normal"> {t('superAdmin.errorLog.filteredHint')}</span>}
              </h3>
            </div>
            <div className="flex items-center bg-dark-surface border border-dark-border rounded-xl p-0.5">
              {[
                { icon: List,   label: t('superAdmin.errorLog.viewFlat'),   val: false },
                { icon: Layers, label: t('superAdmin.errorLog.viewGrouped'), val: true  },
              ].map(opt => {
                const Icn = opt.icon
                return (
                  <button key={String(opt.val)} onClick={() => setGrouped(opt.val)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${grouped === opt.val ? 'bg-dark-card text-off-white' : 'text-muted hover:text-off-white'}`}>
                    <Icn size={12} /> {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="divide-y divide-dark-border/40">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3">
                <div className="w-7 h-7 bg-dark-surface rounded-lg animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-dark-surface rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-dark-surface rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle size={32} className="text-green-400/50" />
            <p className="text-muted text-sm">{t('superAdmin.errorLog.noErrors')}</p>
            {hasFilter && <button onClick={clearFilters} className="text-xs text-brand hover:underline">{t('superAdmin.errorLog.clearFilter')}</button>}
          </div>
        ) : grouped ? (
          groups.map((group, i) => (
            <GroupedRow
              key={i}
              group={group}
              selected={group.entries.every(e => selected.has(e.id))}
              onSelectGroup={selectMany}
              onResolve={handleResolveMany}
              t={t}
              dateLocale={dateLocale}
              tz={tz}
            />
          ))
        ) : (
          logs.map(log => (
            <ErrorRow
              key={log.id}
              log={log}
              selected={selected.has(log.id)}
              onSelect={toggleOne}
              onResolve={handleResolveOne}
              t={t}
              dateLocale={dateLocale}
              tz={tz}
            />
          ))
        )}

        {!grouped && remaining > 0 && (
          <div className="px-4 py-3 border-t border-dark-border/40 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLimit(l => l + PAGE_LIMIT)}
              loading={isFetching}
            >
              {t('superAdmin.errorLog.loadMore', { remaining })}
            </Button>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => performDelete(confirmAction.opts)}
        title={confirmAction?.title}
        description={confirmAction?.description}
        confirmText={t('superAdmin.errorLog.confirmYes')}
        cancelText={t('superAdmin.errorLog.confirmNo')}
        variant="danger"
      />
    </div>
  )
}

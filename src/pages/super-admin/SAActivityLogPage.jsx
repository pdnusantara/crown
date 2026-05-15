import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, Info, AlertTriangle, XCircle, CheckCircle, Filter,
  Download, RefreshCw, Trash2, ChevronDown, X, Radio, Search,
  ExternalLink, Copy, Check,
} from 'lucide-react'
import {
  useAuditLog, useAuditLogStats, useAuditLogActions, usePurgeAuditLog,
} from '../../hooks/useSuperAdminAuditLog.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { formatDateTimeInTz, getTenantTimezone, DEFAULT_TZ } from '../../utils/timezone.js'

// ── Config ───────────────────────────────────────────────────────────────────
const SEVERITY_CFG = {
  info:    { icon: Info,          color: 'text-blue-400',  bg: 'bg-blue-400/10',  border: 'border-blue-400/20'  },
  success: { icon: CheckCircle,   color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  error:   { icon: XCircle,       color: 'text-red-400',   bg: 'bg-red-400/10',   border: 'border-red-400/20'   },
}
const SEVERITY_ORDER = ['info', 'success', 'warning', 'error']

const PAGE_LIMIT = 50
const RANGE_OPTIONS = [30, 90, 365]

// Map action prefix to action group label key (visual chip in row).
const ACTION_GROUP = {
  tenant:    'actionGroupTenant',
  billing:   'actionGroupBilling',
  flag:      'actionGroupFlag',
  broadcast: 'actionGroupBroadcast',
  ticket:    'actionGroupTicket',
  auth:      'actionGroupAuth',
}

function actionGroupKey(action) {
  if (!action) return 'actionGroupOther'
  const root = action.split('.')[0]
  return ACTION_GROUP[root] || 'actionGroupOther'
}

// Human label for action code. Falls back to the code itself so we never
// surface an empty string when a new action is introduced before its i18n
// entry lands.
function actionLabel(t, code) {
  return t(`superAdmin.activityLog.actionLabel.${code}`, { defaultValue: code || '—' })
}

const RUPIAH_FMT = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })

// Convert internal `key=value key=value` detail strings (common for billing
// rows) into human-readable bullet text. Non-key/value details pass through
// unchanged so admin notes like "manually cancelled by …" stay intact.
function prettifyDetail(t, raw) {
  if (!raw) return ''
  if (!/=/.test(raw)) return raw
  const parts = raw.match(/(\w+)=(\S+)/g) || []
  if (!parts.length) return raw
  const pieces = parts.map((p) => {
    const idx = p.indexOf('=')
    const k = p.slice(0, idx)
    const v = p.slice(idx + 1)
    let value = v
    if (k === 'amount' || k === 'discount') {
      const n = Number(v)
      value = Number.isFinite(n) ? RUPIAH_FMT.format(n) : v
    } else if (k === 'cycle') {
      value = v === 'monthly' ? t('superAdmin.activityLog.cycleMonthly')
            : v === 'annual'  ? t('superAdmin.activityLog.cycleAnnual')
            : v
    } else if (k === 'type') {
      value = v === 'subscription' ? t('superAdmin.activityLog.typeSubscription')
            : v === 'upgrade'      ? t('superAdmin.activityLog.typeUpgrade')
            : v === 'branch_addon' ? t('superAdmin.activityLog.typeBranchAddon')
            : v
    }
    const label = t(`superAdmin.activityLog.detailKey.${k}`, { defaultValue: k })
    return `${label}: ${value}`
  })
  return pieces.join(' • ')
}

// Generic CSV helpers (same shape as other audit pages).
function escapeCsv(v) {
  if (v == null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function exportLogsCsv(logs, tz, t) {
  const cols = ['createdAt', 'severity', 'actorName', 'actorId', 'action', 'actionLabel', 'target', 'targetName', 'detail', 'detailFriendly']
  const rows = logs.map(l => [
    formatDateTimeInTz(l.createdAt, tz), l.severity, l.actorName, l.actorId || '',
    l.action, actionLabel(t, l.action),
    l.target, l.targetName || '',
    l.detail, prettifyDetail(t, l.detail),
  ])
  const csv = '﻿' + [cols.join(','), ...rows.map(r => r.map(escapeCsv).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a   = Object.assign(document.createElement('a'), { href: url, download: `audit-log-${new Date().toISOString().slice(0, 10)}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Detail modal ────────────────────────────────────────────────────────────
function DetailModal({ log, onClose, t, tz }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  if (!log) return null
  const sev = SEVERITY_CFG[log.severity] || SEVERITY_CFG.info
  const SevIcon = sev.icon

  const targetTenantId = log.targetTenantId
    || (log.target?.startsWith('tenant:') ? log.target.slice('tenant:'.length) : null)
  const friendlyAction = actionLabel(t, log.action)
  const friendlyDetail = prettifyDetail(t, log.detail)

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2)).then(() => {
      setCopied(true)
      toast.success(t('superAdmin.activityLog.toastCopied'))
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <AnimatePresence>
      {log && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative z-10 w-full max-w-lg bg-dark-surface border border-dark-border rounded-t-3xl sm:rounded-3xl shadow-2xl"
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-dark-border" />
            </div>
            <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-all">
              <X size={16} />
            </button>

            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${sev.bg} ${sev.border} ${sev.color}`}>
                  <SevIcon size={11} />
                  {t(`superAdmin.activityLog.sev${log.severity[0].toUpperCase()}${log.severity.slice(1)}`)}
                </span>
                <span className="text-[11px] text-muted">{t(`superAdmin.activityLog.${actionGroupKey(log.action)}`)}</span>
              </div>
              <h3 className="font-display text-lg font-semibold text-off-white mb-1">{friendlyAction}</h3>
              <p className="text-xs text-muted">{t('superAdmin.activityLog.detailTitle')}</p>
            </div>

            <div className="px-6 pb-4 space-y-3 text-sm">
              <Row label={t('superAdmin.activityLog.detailWhen')} value={formatDateTimeInTz(log.createdAt, tz)} />
              <Row label={t('superAdmin.activityLog.detailActor')} value={log.actorName || '—'} />
              {log.actorId && <Row label={t('superAdmin.activityLog.detailActorId')} value={log.actorId} mono />}
              <Row label={t('superAdmin.activityLog.detailAction')} value={log.action} mono />
              <Row
                label={t('superAdmin.activityLog.detailTarget')}
                value={log.targetName ? `${log.targetName}${log.target ? ` (${log.target})` : ''}` : (log.target || '—')}
                mono={!log.targetName}
              />
              <Row label={t('superAdmin.activityLog.detailDetail')} value={friendlyDetail || '—'} multiline />
            </div>

            <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-2">
              {targetTenantId && (
                <Button variant="outline" fullWidth icon={ExternalLink} onClick={() => navigate(`/super-admin/tenants/${targetTenantId}`)}>
                  {t('superAdmin.activityLog.openTarget')}
                </Button>
              )}
              <Button variant="secondary" fullWidth icon={copied ? Check : Copy} onClick={handleCopy}>
                {copied ? t('superAdmin.activityLog.copied') : t('superAdmin.activityLog.copyJson')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function Row({ label, value, mono = false, multiline = false }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <span className={`text-off-white ${mono ? 'font-mono text-[12px] break-all' : ''} ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value}</span>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function SAActivityLogPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const tz = getTenantTimezone() || DEFAULT_TZ

  const [severity, setSeverity] = useState('')
  const [action, setAction]     = useState('')
  const [actor, setActor]       = useState('')
  const [target, setTarget]     = useState('')
  const [search, setSearch]     = useState('')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [days, setDays]         = useState(30)
  const [limit, setLimit]       = useState(PAGE_LIMIT)
  const [detailLog, setDetailLog]     = useState(null)
  const [confirmPurge, setConfirmPurge] = useState(null)

  const filters = useMemo(() => {
    const f = { limit, page: 1, tz }
    if (severity) f.severity = severity
    if (action)   f.action   = action
    if (actor)    f.actor    = actor
    if (target)   f.target   = target
    if (search)   f.search   = search
    if (from)     f.from     = from
    if (to)       f.to       = to
    return f
  }, [severity, action, actor, target, search, from, to, limit, tz])

  // Reset window when filters change so we always anchor at top.
  React.useEffect(() => { setLimit(PAGE_LIMIT) }, [severity, action, actor, target, search, from, to])

  const { data: logsResp, isLoading, isError, refetch, isFetching } = useAuditLog(filters)
  const logs = logsResp?.data || []
  const meta = logsResp?.meta || { total: 0, totalPages: 1 }
  const { data: stats } = useAuditLogStats(days, tz)
  const { data: actionCodes = [] } = useAuditLogActions()
  const purge = usePurgeAuditLog()

  const hasFilter = severity || action || actor || target || search || from || to
  const remaining = Math.max(0, (meta.total || 0) - logs.length)

  const handleResetFilters = () => {
    setSeverity(''); setAction(''); setActor(''); setTarget(''); setSearch(''); setFrom(''); setTo('')
  }

  const handlePurge = (olderThanDays) => {
    setConfirmPurge({
      title: t('superAdmin.activityLog.confirmPurgeTitle', { days: olderThanDays }),
      description: t('superAdmin.activityLog.confirmPurgeDesc', { days: olderThanDays }),
      olderThanDays,
    })
  }
  const performPurge = () => {
    purge.mutate({ olderThanDays: confirmPurge.olderThanDays }, {
      onSuccess: (d) => {
        toast.success(t('superAdmin.activityLog.toastPurged', { count: d?.deleted ?? 0 }))
        setConfirmPurge(null)
      },
      onError: () => toast.error(t('superAdmin.activityLog.toastPurgedFailed')),
    })
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.activityLog.pageTitle')}</h1>
        </div>
        <Card className="p-8 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <h3 className="font-semibold text-off-white mb-1">{t('superAdmin.activityLog.errorLoading')}</h3>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            {t('superAdmin.activityLog.retry')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.activityLog.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.activityLog.pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-[10px] text-green-400 font-medium">
            <Radio size={10} className="animate-pulse" /> {t('superAdmin.activityLog.realtimeBadge')}
          </span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
            {t('superAdmin.activityLog.refresh')}
          </Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => exportLogsCsv(logs, tz, t)} disabled={logs.length === 0}>
            {t('superAdmin.activityLog.exportCsv')}
          </Button>
          <PurgeMenu onPick={handlePurge} t={t} />
        </div>
      </div>

      {/* KPI / Severity chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('superAdmin.activityLog.kpiTotal', { days })} value={stats?.total ?? '—'} icon={Activity} color="text-gold" delay={0} />
        <KpiCard label={t('superAdmin.activityLog.kpiToday')} value={stats?.todayCount ?? '—'} icon={Activity} color="text-blue-400" delay={0.05} />
        <KpiCard label={t('superAdmin.activityLog.kpiWarning')} value={stats?.bySeverity?.warning ?? 0} icon={AlertTriangle} color="text-amber-400" delay={0.1} />
        <KpiCard label={t('superAdmin.activityLog.kpiError')} value={stats?.bySeverity?.error ?? 0} icon={XCircle} color="text-red-400" delay={0.15} />
      </div>

      {/* Severity chip filter row */}
      <div className="flex gap-2 flex-wrap">
        {SEVERITY_ORDER.map((key) => {
          const cfg = SEVERITY_CFG[key]
          const Icn = cfg.icon
          const active = severity === key
          const count = stats?.bySeverity?.[key] ?? 0
          return (
            <button
              key={key}
              onClick={() => setSeverity(active ? '' : key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${active ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-dark-border text-muted hover:border-gold/30'}`}
            >
              <Icn size={12} />
              {t('superAdmin.activityLog.chipCount', {
                label: t(`superAdmin.activityLog.sev${key[0].toUpperCase()}${key.slice(1)}`),
                count,
              })}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1 bg-dark-surface border border-dark-border rounded-xl p-0.5">
          {RANGE_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors ${days === d ? 'bg-gold/15 text-gold' : 'text-muted hover:text-off-white'}`}
            >
              {t(`superAdmin.activityLog.filterRange${d}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Card */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted flex-shrink-0" />

          <select value={action} onChange={e => setAction(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40 max-w-[180px]">
            <option value="">{t('superAdmin.activityLog.filterAllAction')}</option>
            {actionCodes.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>

          <input
            value={actor}
            onChange={e => setActor(e.target.value)}
            placeholder={t('superAdmin.activityLog.filterActorPlaceholder')}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40 max-w-[180px]"
          />
          <input
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder={t('superAdmin.activityLog.filterTargetPlaceholder')}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40 max-w-[200px]"
          />

          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40" />

          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('superAdmin.activityLog.filterDetailPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40" />
          </div>

          {hasFilter && (
            <button onClick={handleResetFilters} className="flex items-center gap-1 text-xs text-muted hover:text-off-white">
              <X size={12} /> {t('superAdmin.activityLog.resetFilter')}
            </button>
          )}
        </div>
      </Card>

      {/* Log Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white text-sm">{t('superAdmin.activityLog.logTitle')}</h3>
            </div>
            <span className="text-xs text-muted">
              {isLoading
                ? t('superAdmin.activityLog.loading')
                : t('superAdmin.activityLog.totalEntries', { shown: logs.length, total: meta.total })}
            </span>
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="divide-y divide-dark-border/40">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-7 h-7 bg-dark-surface rounded-lg animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-dark-surface rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-dark-surface rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Activity size={32} className="text-muted/50" />
            <p className="text-muted text-sm">{t('superAdmin.activityLog.noLogs')}</p>
            <p className="text-[11px] text-muted">{t('superAdmin.activityLog.noLogsHint')}</p>
            {hasFilter && (
              <button onClick={handleResetFilters} className="text-xs text-gold hover:underline mt-2">
                {t('superAdmin.activityLog.resetFilter')}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="sm:hidden divide-y divide-dark-border/40">
              {logs.map((log) => (
                <LogCardMobile key={log.id} log={log} t={t} tz={tz} onClick={() => setDetailLog(log)} />
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-[11px] text-muted uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colTime')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colSeverity')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colActor')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colAction')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colTarget')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colDetail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const sev = SEVERITY_CFG[log.severity] || SEVERITY_CFG.info
                    const SevIcon = sev.icon
                    const friendlyAction = actionLabel(t, log.action)
                    const friendlyDetail = prettifyDetail(t, log.detail)
                    const targetLabel = log.targetName || log.target || '—'
                    return (
                      <motion.tr
                        key={log.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.015, 0.3) }}
                        className="border-b border-dark-border/40 hover:bg-dark-surface/40 cursor-pointer transition-colors"
                        onClick={() => setDetailLog(log)}
                      >
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatDateTimeInTz(log.createdAt, tz)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sev.bg} ${sev.border} ${sev.color}`}>
                            <SevIcon size={10} />
                            {t(`superAdmin.activityLog.sev${log.severity[0].toUpperCase()}${log.severity.slice(1)}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-off-white font-medium">{log.actorName}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-off-white">{friendlyAction}</span>
                            <span className="text-[10px] text-muted font-mono" title={log.action}>{log.action}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-off-white text-sm truncate" title={log.target}>{targetLabel}</span>
                            {log.targetName && log.target && (
                              <span className="text-[10px] text-muted font-mono truncate" title={log.target}>{log.target}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-off-white text-xs max-w-[280px] truncate" title={log.detail}>{friendlyDetail || '—'}</td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {remaining > 0 && (
              <div className="px-4 py-3 border-t border-dark-border/40 flex justify-center">
                <Button variant="secondary" size="sm" loading={isFetching} onClick={() => setLimit(l => l + PAGE_LIMIT)}>
                  {t('superAdmin.activityLog.loadMore', { remaining })}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <DetailModal log={detailLog} onClose={() => setDetailLog(null)} t={t} tz={tz} />

      <ConfirmDialog
        isOpen={!!confirmPurge}
        onClose={() => setConfirmPurge(null)}
        onConfirm={performPurge}
        title={confirmPurge?.title}
        description={confirmPurge?.description}
        confirmText={t('superAdmin.activityLog.confirmYes')}
        cancelText={t('superAdmin.activityLog.confirmNo')}
        variant="danger"
      />
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Icon size={15} className={color} />
        </div>
        <p className="text-2xl font-bold text-off-white tabular-nums">{value ?? '—'}</p>
      </Card>
    </motion.div>
  )
}

function PurgeMenu({ onPick, t }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border text-xs text-muted hover:border-red-400/30 hover:text-red-400 transition-all"
      >
        <Trash2 size={13} /> {t('superAdmin.activityLog.purge')} <ChevronDown size={11} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="absolute right-0 top-full mt-1.5 z-50 min-w-[210px] bg-dark-card border border-dark-border rounded-xl shadow-xl overflow-hidden"
            >
              {[
                { days: 7,  key: 'purgeOlder7'  },
                { days: 30, key: 'purgeOlder30' },
                { days: 90, key: 'purgeOlder90' },
              ].map(item => (
                <button
                  key={item.days}
                  onClick={() => { setOpen(false); onPick(item.days) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-off-white hover:bg-dark-surface hover:text-red-400 transition-colors"
                >
                  {t(`superAdmin.activityLog.${item.key}`)}
                </button>
              ))}
            </motion.div>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function LogCardMobile({ log, t, tz, onClick }) {
  const sev = SEVERITY_CFG[log.severity] || SEVERITY_CFG.info
  const SevIcon = sev.icon
  const friendlyAction = actionLabel(t, log.action)
  const friendlyDetail = prettifyDetail(t, log.detail)
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-dark-surface/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${sev.bg} ${sev.border} ${sev.color}`}>
              <SevIcon size={9} />
              {t(`superAdmin.activityLog.sev${log.severity[0].toUpperCase()}${log.severity.slice(1)}`)}
            </span>
            <span className="text-[10px] text-muted">{t(`superAdmin.activityLog.${actionGroupKey(log.action)}`)}</span>
          </div>
          <p className="text-sm text-off-white font-semibold leading-snug">{friendlyAction}</p>
          <p className="text-xs text-muted mt-0.5">
            <span className="text-off-white/80">{log.actorName}</span>
            {log.targetName && <> → <span className="text-off-white/80">{log.targetName}</span></>}
          </p>
          {friendlyDetail && <p className="text-xs text-muted line-clamp-2 mt-0.5">{friendlyDetail}</p>}
        </div>
        <span className="text-[10px] text-muted whitespace-nowrap mt-0.5">{formatDateTimeInTz(log.createdAt, tz)}</span>
      </div>
    </button>
  )
}

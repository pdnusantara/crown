import React, { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle, AlertTriangle, Info, CheckCircle, Search,
  Filter, Trash2, ChevronDown, ChevronUp, RefreshCw, Clock,
  X, Check, ShieldAlert, Globe, Code2, CreditCard, Zap,
  Download, Copy, Layers, List, ExternalLink, TrendingUp,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { format, formatDistanceToNow } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import {
  useErrorLogs, useErrorLogStats, useErrorLogTrend,
  useResolveError, useBulkResolveErrors, useDeleteErrorLogs,
} from '../../hooks/useErrorLogs.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'

// ── Config ─────────────────────────────────────────────────────────────────────
const LEVEL_CFG = {
  error:   { icon: AlertCircle,   color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/20',    label: 'Error',   barColor: '#F87171' },
  warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-amber-400/20',  label: 'Warning', barColor: '#FBBF24' },
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/20',   label: 'Info',    barColor: '#60A5FA' },
}
const TYPE_CFG = {
  api_error:     { icon: Globe,       label: 'API Error',     color: 'text-red-400' },
  js_error:      { icon: Code2,       label: 'JS Error',      color: 'text-orange-400' },
  payment_error: { icon: CreditCard,  label: 'Payment Error', color: 'text-amber-400' },
  system_error:  { icon: Zap,         label: 'System Error',  color: 'text-purple-400' },
  auth_error:    { icon: ShieldAlert, label: 'Auth Error',    color: 'text-pink-400' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function exportCSV(logs) {
  const cols = ['id', 'level', 'type', 'message', 'path', 'method', 'statusCode', 'tenantId', 'tenantName', 'resolved', 'createdAt']
  const esc  = v => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = logs.map(l => cols.map(c => esc(l[c])).join(','))
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
      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border transition-all ${copied ? 'border-green-400/40 text-green-400 bg-green-400/10' : 'border-dark-border text-muted hover:border-gold/30 hover:text-off-white'} ${className}`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Tersalin!' : 'Copy'}
    </button>
  )
}

// ── Chart Tooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2.5 text-xs">
      <p className="text-muted mb-1.5 font-medium">{label}</p>
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
function ErrorRow({ log, selected, onSelect, onResolve }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const lvl      = LEVEL_CFG[log.level]  || LEVEL_CFG.error
  const type     = TYPE_CFG[log.type]    || TYPE_CFG.api_error
  const LvlIcon  = lvl.icon
  const TypeIcon = type.icon

  return (
    <div className={`border-b border-dark-border/40 transition-colors ${log.resolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-dark-surface/40 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        {/* Checkbox */}
        <div className="mt-0.5 flex-shrink-0" onClick={e => { e.stopPropagation(); onSelect(log.id) }}>
          <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${selected ? 'bg-gold border-gold' : 'border-dark-border hover:border-gold/50'}`}>
            {selected && <Check size={10} className="text-dark" strokeWidth={3} />}
          </div>
        </div>

        {/* Level icon */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${lvl.bg}`}>
          <LvlIcon size={13} className={lvl.color} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium text-off-white leading-tight break-words max-w-xl">{log.message}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {log.resolved && (
                <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">
                  <CheckCircle size={9} /> Resolved
                </span>
              )}
              <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${lvl.border} ${lvl.bg} ${lvl.color}`}>
                {lvl.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className={`flex items-center gap-1 text-xs ${type.color}`}>
              <TypeIcon size={11} /> {type.label}
            </span>
            {log.path && (
              <span className="text-xs text-muted font-mono">
                {log.method && <span className="text-blue-400 mr-1">{log.method}</span>}
                {log.path}
                {log.statusCode && <span className="text-red-400 ml-1">{log.statusCode}</span>}
              </span>
            )}
            {/* Tenant link */}
            {log.tenantId && (
              <button
                onClick={e => { e.stopPropagation(); navigate(`/super-admin/tenants/${log.tenantId}`) }}
                className="flex items-center gap-1 text-xs text-blue-400/80 hover:text-blue-400 transition-colors"
              >
                <ExternalLink size={10} />
                {log.tenantName || log.tenantId.slice(0, 8) + '…'}
              </button>
            )}
            <span className="text-xs text-muted flex items-center gap-1" title={format(new Date(log.createdAt), 'dd MMM yyyy HH:mm:ss')}>
              <Clock size={10} />
              {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: localeId })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {!log.resolved && (
            <button onClick={e => { e.stopPropagation(); onResolve(log.id) }}
              className="p-1.5 rounded-lg text-muted hover:text-green-400 hover:bg-green-400/10 transition-all" title="Resolve">
              <CheckCircle size={14} />
            </button>
          )}
          <button className="p-1 text-muted hover:text-off-white transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-14 pb-4 space-y-3">
              {log.stack && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] text-muted uppercase font-semibold">Stack Trace</p>
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
                    <p className="text-[10px] text-muted uppercase font-semibold">Metadata</p>
                    <CopyBtn text={JSON.stringify(log.metadata, null, 2)} />
                  </div>
                  <pre className="text-[11px] text-off-white/70 bg-dark-surface border border-dark-border rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono max-h-36 overflow-y-auto">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
              {log.resolved && log.resolvedAt && (
                <p className="text-xs text-green-400/70">
                  Resolved {format(new Date(log.resolvedAt), 'dd MMM yyyy HH:mm')}{log.resolvedBy ? ` oleh ${log.resolvedBy}` : ''}
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
function GroupedRow({ group, selected, onSelectGroup, onResolve }) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const dominantLevel = group.levels.has('error') ? 'error' : group.levels.has('warning') ? 'warning' : 'info'
  const lvl  = LEVEL_CFG[dominantLevel]
  const LvlIcon = lvl.icon
  const allResolved = group.entries.every(e => e.resolved)

  return (
    <div className={`border-b border-dark-border/40 ${allResolved ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-dark-surface/40 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        {/* Checkbox */}
        <div className="mt-0.5 flex-shrink-0" onClick={e => { e.stopPropagation(); onSelectGroup(group.entries.map(e => e.id)) }}>
          <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${selected ? 'bg-gold border-gold' : 'border-dark-border hover:border-gold/50'}`}>
            {selected && <Check size={10} className="text-dark" strokeWidth={3} />}
          </div>
        </div>

        {/* Level icon */}
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
            {[...group.types].map(t => {
              const tc = TYPE_CFG[t] || TYPE_CFG.api_error
              return (
                <span key={t} className={`flex items-center gap-1 text-xs ${tc.color}`}>
                  <tc.icon size={11} /> {tc.label}
                </span>
              )
            })}
            <span className="text-xs text-muted flex items-center gap-1">
              <Clock size={10} />
              Terakhir: {formatDistanceToNow(new Date(group.entries[0].createdAt), { addSuffix: true, locale: localeId })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {!allResolved && (
            <button
              onClick={e => { e.stopPropagation(); onResolve(group.entries.filter(e => !e.resolved).map(e => e.id)) }}
              className="p-1.5 rounded-lg text-muted hover:text-green-400 hover:bg-green-400/10 transition-all" title="Resolve semua">
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
              <p className="text-[10px] text-muted uppercase font-semibold mb-2">{group.count} Kejadian</p>
              {group.entries.map(log => (
                  <div key={log.id} className="flex items-center gap-2 p-2 rounded-xl bg-dark-surface/60 border border-dark-border/40">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${LEVEL_CFG[log.level]?.bg.replace('bg-', 'bg-').replace('/10', '')} ${LEVEL_CFG[log.level]?.color.replace('text-', 'bg-')}`} />
                    <span className="text-xs text-muted flex-1" title={format(new Date(log.createdAt), 'dd MMM yyyy HH:mm:ss')}>
                      {format(new Date(log.createdAt), 'dd MMM HH:mm:ss')}
                    </span>
                    {log.tenantName && (
                      <span className="text-xs text-blue-400/70">{log.tenantName}</span>
                    )}
                    {log.path && <span className="text-xs text-muted font-mono truncate max-w-[200px]">{log.method} {log.path}</span>}
                    {log.resolved && <CheckCircle size={12} className="text-green-400 flex-shrink-0" />}
                    {log.stack && <CopyBtn text={log.stack} />}
                  </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function SAErrorLogPage() {
  const toast = useToast()

  const [level,          setLevel]          = useState('')
  const [type,           setType]           = useState('')
  const [resolved,       setResolved]       = useState('')
  const [search,         setSearch]         = useState('')
  const [grouped,        setGrouped]        = useState(false)
  const [selected,       setSelected]       = useState(new Set())
  const [showDeleteMenu, setShowDeleteMenu] = useState(false)

  const filters = useMemo(() => {
    const f = { limit: 200 }
    if (level)    f.level    = level
    if (type)     f.type     = type
    if (resolved) f.resolved = resolved
    if (search)   f.search   = search
    return f
  }, [level, type, resolved, search])

  const { data: logs = [], isLoading, refetch, isFetching } = useErrorLogs(filters)
  const { data: stats }                                      = useErrorLogStats()
  const { data: trend = [] }                                 = useErrorLogTrend(7)
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
      onSuccess: () => { toast.success('Ditandai sebagai resolved'); setSelected(new Set()) },
      onError:   () => toast.error('Gagal menyimpan'),
    })

  const handleResolveMany = (ids) =>
    bulkResolve.mutate(ids, {
      onSuccess: (d) => { toast.success(`${d?.count ?? ids.length} error di-resolve`); setSelected(new Set()) },
      onError:   () => toast.error('Gagal bulk resolve'),
    })

  const handleDelete = (opts) =>
    deleteLogs.mutate(opts, {
      onSuccess: (d) => { toast.success(`${d?.deleted ?? '?'} log dihapus`); setShowDeleteMenu(false) },
      onError:   () => toast.error('Gagal hapus log'),
    })

  const clearFilters = () => { setLevel(''); setType(''); setResolved(''); setSearch('') }
  const hasFilter    = level || type || resolved || search
  const hasTrend     = trend.some(d => d.total > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">Log Error</h1>
          <p className="text-muted text-sm mt-1">Pantau error API, JS, dan sistem secara realtime</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => refetch()}
            className={`p-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all ${isFetching ? 'animate-spin text-gold' : ''}`}
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>

          {/* CSV Export */}
          <button
            onClick={() => exportCSV(logs)}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:border-gold/30 hover:text-off-white disabled:opacity-40 transition-all"
          >
            <Download size={13} /> Export CSV
          </button>

          {/* Delete menu */}
          <div className="relative">
            <button
              onClick={() => setShowDeleteMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:border-red-400/30 hover:text-red-400 transition-all"
            >
              <Trash2 size={13} /> Hapus Log <ChevronDown size={11} />
            </button>
            <AnimatePresence>
              {showDeleteMenu && (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="absolute right-0 top-full mt-1.5 z-50 min-w-[210px] bg-dark-card border border-dark-border rounded-xl shadow-xl overflow-hidden"
                  >
                    {[
                      { label: 'Hapus yang sudah resolved', opts: { onlyResolved: true } },
                      { label: 'Hapus lebih dari 7 hari',   opts: { olderThanDays: 7 } },
                      { label: 'Hapus lebih dari 30 hari',  opts: { olderThanDays: 30 } },
                      { label: 'Hapus semua log',           opts: {} },
                    ].map(item => (
                      <button key={item.label} onClick={() => handleDelete(item.opts)}
                        className="w-full text-left px-4 py-2.5 text-sm text-off-white hover:bg-dark-surface hover:text-red-400 transition-colors">
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
        <KpiCard label="Total Error"    value={stats?.total}      icon={AlertCircle}   iconColor="text-red-400"    delay={0}    />
        <KpiCard label="Belum Resolved" value={stats?.unresolved} icon={AlertTriangle} iconColor="text-amber-400"  delay={0.05} sub={stats?.unresolved > 0 ? 'perlu tindakan' : 'semua beres'} />
        <KpiCard label="Warning Aktif"  value={stats?.warnings}   icon={AlertTriangle} iconColor="text-yellow-400" delay={0.1}  />
        <KpiCard label="Hari Ini"       value={stats?.todayCount} icon={Clock}         iconColor="text-blue-400"   delay={0.15} />
      </div>

      {/* Trend Chart */}
      {hasTrend && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-gold" />
                <h3 className="font-semibold text-off-white">Tren Error — 7 Hari Terakhir</h3>
              </div>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                  <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#6B7280', paddingTop: 8 }} />
                  <Bar dataKey="errors"   name="Error"   fill={LEVEL_CFG.error.barColor}   radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="warnings" name="Warning" fill={LEVEL_CFG.warning.barColor} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="info"     name="Info"    fill={LEVEL_CFG.info.barColor}    radius={[3, 3, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Filter Bar */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="text-muted flex-shrink-0" />
          {[
            { value: level,    setter: setLevel,    options: [['','Semua Level'],['error','Error'],['warning','Warning'],['info','Info']] },
            { value: type,     setter: setType,     options: [['','Semua Tipe'],['api_error','API Error'],['js_error','JS Error'],['payment_error','Payment Error'],['system_error','System Error'],['auth_error','Auth Error']] },
            { value: resolved, setter: setResolved, options: [['','Semua Status'],['false','Belum Resolved'],['true','Sudah Resolved']] },
          ].map((f, i) => (
            <select key={i} value={f.value} onChange={e => f.setter(e.target.value)}
              className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40">
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari pesan error…"
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40" />
          </div>
          {hasFilter && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted hover:text-off-white">
              <X size={12} /> Reset
            </button>
          )}
        </div>
      </Card>

      {/* Bulk Actions */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-gold/10 border border-gold/20 rounded-2xl">
              <span className="text-sm text-gold font-medium">{selected.size} dipilih</span>
              <Button size="sm" variant="secondary" icon={CheckCircle} onClick={() => handleResolveMany([...selected])} disabled={bulkResolve.isPending}>
                Resolve Semua
              </Button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-off-white ml-auto">Batalkan</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Log List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${allSelected && allIds.length > 0 ? 'bg-gold border-gold' : 'border-dark-border hover:border-gold/50'}`} onClick={toggleAll}>
                {allSelected && allIds.length > 0 && <Check size={10} className="text-dark" strokeWidth={3} />}
                {selected.size > 0 && !allSelected && <div className="w-2 h-0.5 bg-gold rounded" />}
              </div>
              <h3 className="font-semibold text-off-white text-sm">
                {isLoading ? 'Memuat…' : grouped ? `${groups.length} grup` : `${logs.length} log`}
                {hasFilter && <span className="text-muted font-normal"> (filtered)</span>}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Grouped / flat toggle */}
              <div className="flex items-center bg-dark-surface border border-dark-border rounded-xl p-0.5">
                {[
                  { icon: List,   label: 'Flat',   val: false },
                  { icon: Layers, label: 'Grup',   val: true  },
                ].map(opt => (
                  <button key={String(opt.val)} onClick={() => setGrouped(opt.val)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${grouped === opt.val ? 'bg-dark-card text-off-white' : 'text-muted hover:text-off-white'}`}>
                    <opt.icon size={12} /> {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted hidden sm:block">Auto-refresh 30s</p>
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
            <p className="text-muted text-sm">Tidak ada error ditemukan</p>
            {hasFilter && <button onClick={clearFilters} className="text-xs text-gold hover:underline">Hapus filter</button>}
          </div>
        ) : grouped ? (
          groups.map((group, i) => (
            <GroupedRow
              key={i}
              group={group}
              selected={group.entries.every(e => selected.has(e.id))}
              onSelectGroup={selectMany}
              onResolve={handleResolveMany}
            />
          ))
        ) : (
          logs.map(log => (
            <ErrorRow key={log.id} log={log} selected={selected.has(log.id)} onSelect={toggleOne} onResolve={handleResolveOne} />
          ))
        )}
      </Card>
    </div>
  )
}

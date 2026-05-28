import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Send, CheckCircle, Clock, AlertCircle, Filter, X,
  ChevronRight, User, ShieldCheck, Search, RefreshCw, Trash2, Radio,
  AlertTriangle,
} from 'lucide-react'
import {
  useAllTickets, useTicket, useUpdateTicketStatus, useReplyToTicket,
  useDeleteTicket, useTicketStats,
} from '../../hooks/useTickets.js'
import { useTenants } from '../../hooks/useTenants.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { AttachmentPicker, AttachmentGallery } from '../../components/tickets/TicketAttachments.jsx'
import { formatDateTimeInTz, getTenantTimezone, DEFAULT_TZ } from '../../utils/timezone.js'

const PAGE_LIMIT = 25

const STATUS_KEYS = {
  open:        { iconName: 'AlertCircle', icon: AlertCircle, color: 'text-red-400',   bg: 'bg-red-400/10',   border: 'border-red-400/30',   variant: 'danger',  i18n: 'statusOpen'       },
  in_progress: { iconName: 'Clock',       icon: Clock,       color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/30', variant: 'warning', i18n: 'statusInProgress' },
  resolved:    { iconName: 'CheckCircle', icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30', variant: 'success', i18n: 'statusResolved'   },
}

const PRIORITY_KEYS = {
  high:   { color: 'text-red-400 bg-red-400/10 border-red-400/30',     i18n: 'priorityHigh'   },
  medium: { color: 'text-amber-400 bg-amber-400/10 border-amber-400/30', i18n: 'priorityMedium' },
  low:    { color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',  i18n: 'priorityLow'    },
}

const CATEGORY_COLORS = {
  Bug:               'text-red-400',
  'Feature Request': 'text-purple-400',
  Billing:           'text-brand',
  General:           'text-blue-400',
}

function relativeFromTz(date, tz) {
  if (!date) return '—'
  return formatDateTimeInTz(date, tz)
}

export default function SATicketsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const tz = getTenantTimezone() || DEFAULT_TZ

  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterTenant,   setFilterTenant]   = useState('')
  const [search,         setSearch]         = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [limit,          setLimit]          = useState(PAGE_LIMIT)
  const [selectedId,     setSelectedId]     = useState(null)
  const [replyText,      setReplyText]      = useState('')
  const [replyAttachments, setReplyAttachments] = useState([])
  const [sending,        setSending]        = useState(false)
  const [confirmAction,  setConfirmAction]  = useState(null)

  // Debounce search to keep the backend from getting hammered on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  // Reset page window whenever a non-page filter changes.
  useEffect(() => {
    setLimit(PAGE_LIMIT)
  }, [filterStatus, filterPriority, filterCategory, filterTenant, debouncedSearch])

  const filters = useMemo(() => {
    const f = { limit, page: 1 }
    if (filterStatus)   f.status   = filterStatus
    if (filterPriority) f.priority = filterPriority
    if (filterCategory) f.category = filterCategory
    if (filterTenant)   f.tenantId = filterTenant
    if (debouncedSearch) f.search   = debouncedSearch
    return f
  }, [filterStatus, filterPriority, filterCategory, filterTenant, debouncedSearch, limit])

  const { data: ticketsResp, isLoading, isError, refetch, isFetching } = useAllTickets(filters)
  const tickets = ticketsResp?.data || []
  const meta    = ticketsResp?.meta || { total: 0 }
  const remaining = Math.max(0, (meta.total || 0) - tickets.length)

  const { data: stats } = useTicketStats({})
  const { data: tenantsList = [] } = useTenants()

  const updateStatus  = useUpdateTicketStatus()
  const replyToTicket = useReplyToTicket()
  const deleteTicket  = useDeleteTicket()

  const { data: ticketDetail } = useTicket(selectedId)
  const selectedTicket = ticketDetail || (selectedId ? tickets.find(tt => tt.id === selectedId) : null)

  // If the currently-selected ticket disappears from the list (filter change /
  // delete), drop the selection so the right pane gracefully shows the empty
  // state instead of stale data.
  useEffect(() => {
    if (selectedId && !ticketDetail && !tickets.find(tt => tt.id === selectedId)) {
      setSelectedId(null)
    }
  }, [selectedId, ticketDetail, tickets])

  // Reset draft balasan saat berpindah tiket supaya lampiran tak tertukar.
  useEffect(() => { setReplyText(''); setReplyAttachments([]) }, [selectedId])

  const hasFilter = filterStatus || filterPriority || filterCategory || filterTenant || debouncedSearch

  const handleResetFilters = () => {
    setFilterStatus(''); setFilterPriority(''); setFilterCategory('')
    setFilterTenant(''); setSearch('')
  }

  const handleReply = async () => {
    if ((!replyText.trim() && replyAttachments.length === 0) || !selectedTicket) return
    setSending(true)
    try {
      await replyToTicket.mutateAsync({ id: selectedTicket.id, message: replyText.trim(), attachments: replyAttachments, isAdmin: true })
      setReplyText('')
      setReplyAttachments([])
      toast.success(t('tickets.toast.replied'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tickets.toast.replyFailed'))
    } finally {
      setSending(false)
    }
  }

  const performStatusChange = async (ticketId, status) => {
    try {
      await updateStatus.mutateAsync({ id: ticketId, status })
      toast.info(t('tickets.toast.statusChanged', { label: t(`tickets.${STATUS_KEYS[status]?.i18n}`) }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tickets.toast.statusFailed'))
    }
  }
  const handleStatusChange = (ticketId, status) => {
    if (status === 'resolved' && selectedTicket?.status !== 'resolved') {
      setConfirmAction({
        title: t('tickets.confirmResolveTitle'),
        description: t('tickets.confirmResolveDesc'),
        run: () => performStatusChange(ticketId, status),
      })
    } else {
      performStatusChange(ticketId, status)
    }
  }

  const handleDelete = (ticket) => {
    setConfirmAction({
      title: t('tickets.confirmDeleteTitle'),
      description: t('tickets.confirmDeleteDesc'),
      run: async () => {
        try {
          await deleteTicket.mutateAsync(ticket.id)
          toast.success(t('tickets.toastDeleted'))
          setSelectedId(null)
        } catch (err) {
          toast.error(err?.response?.data?.error || t('tickets.toastDeleteFailed'))
        }
      },
    })
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold brand-text">{t('tickets.saPageTitle')}</h1>
        </div>
        <Card className="p-8 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <h3 className="font-semibold text-off-white mb-1">{t('tickets.errorLoading')}</h3>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            {t('tickets.retry')}
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
          <h1 className="text-2xl font-display font-bold brand-text">{t('tickets.saPageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('tickets.saPageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-[10px] text-green-400 font-medium">
            <Radio size={10} className="animate-pulse" /> {t('realtime.live')}
          </span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
            {t('tickets.retry')}
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('tickets.kpiOpen')}       value={stats?.open ?? '—'}        color="text-red-400"   icon={AlertCircle} delay={0}    />
        <KpiCard label={t('tickets.kpiInProgress')} value={stats?.in_progress ?? '—'} color="text-amber-400" icon={Clock}        delay={0.05} />
        <KpiCard label={t('tickets.kpiResolved')}   value={stats?.resolved ?? '—'}    color="text-green-400" icon={CheckCircle}  delay={0.1}  />
        <KpiCard label={t('tickets.kpiTotal')}      value={stats?.total ?? '—'}       color="text-brand"      icon={MessageSquare} delay={0.15} />
      </div>

      {/* Filter row */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted flex-shrink-0" />

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('tickets.filterAllStatus')}</option>
            {Object.keys(STATUS_KEYS).map(k => (
              <option key={k} value={k}>{t(`tickets.${STATUS_KEYS[k].i18n}`)}</option>
            ))}
          </select>

          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('tickets.filterAllPriority')}</option>
            {Object.keys(PRIORITY_KEYS).map(k => (
              <option key={k} value={k}>{t(`tickets.${PRIORITY_KEYS[k].i18n}`)}</option>
            ))}
          </select>

          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('tickets.filterAllCategory')}</option>
            <option value="Bug">{t('tickets.categoryBug')}</option>
            <option value="Feature Request">{t('tickets.categoryFeature')}</option>
            <option value="Billing">{t('tickets.categoryBilling')}</option>
            <option value="General">{t('tickets.categoryGeneral')}</option>
          </select>

          <select value={filterTenant} onChange={e => setFilterTenant(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40 max-w-[180px]">
            <option value="">{t('errorLog.filterAllTenants', { defaultValue: 'All Tenants' })}</option>
            {tenantsList.map(tt => (
              <option key={tt.id} value={tt.id}>{tt.name}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('tickets.searchPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-brand/40" />
          </div>

          {hasFilter && (
            <button onClick={handleResetFilters} className="flex items-center gap-1 text-xs text-muted hover:text-off-white">
              <X size={12} /> {t('tickets.clearFilter')}
            </button>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Ticket list */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-dark-surface border border-dark-border rounded-2xl p-4">
                  <div className="h-4 bg-dark-card rounded animate-pulse w-2/3 mb-2" />
                  <div className="h-3 bg-dark-card rounded animate-pulse w-1/3" />
                </div>
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('tickets.noResults')}</p>
              {hasFilter && (
                <button onClick={handleResetFilters} className="text-xs text-brand hover:underline mt-2">
                  {t('tickets.clearFilter')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="text-[11px] text-muted px-1">
                {t('tickets.totalEntries', { shown: tickets.length, total: meta.total || tickets.length })}
              </div>
              {tickets.map((ticket, i) => {
                const statusCfg   = STATUS_KEYS[ticket.status] || STATUS_KEYS.open
                const priorityCfg = PRIORITY_KEYS[ticket.priority] || PRIORITY_KEYS.medium
                const isSelected  = selectedTicket?.id === ticket.id
                return (
                  <motion.div key={ticket.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                    <button
                      onClick={() => setSelectedId(ticket.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${isSelected ? 'border-brand bg-brand/5' : 'border-dark-border bg-dark-surface hover:border-brand/30'}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-medium text-off-white line-clamp-2">{ticket.subject}</p>
                        <ChevronRight size={14} className="text-muted flex-shrink-0 mt-0.5" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityCfg.color}`}>
                          {t(`tickets.${priorityCfg.i18n}`)}
                        </span>
                        <Badge variant={statusCfg.variant} className="text-[10px]">{t(`tickets.${statusCfg.i18n}`)}</Badge>
                        <span className={`text-xs ${CATEGORY_COLORS[ticket.category] || 'text-muted'}`}>{ticket.category}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                        <span className="text-off-white font-medium truncate max-w-[140px]">{ticket.tenant?.name || '—'}</span>
                        <span>·</span>
                        <span>{t('tickets.repliesCount', { count: ticket._count?.replies ?? 0 })}</span>
                        <span>·</span>
                        <span title={formatDateTimeInTz(ticket.createdAt, tz)}>{formatDateTimeInTz(ticket.createdAt, tz)}</span>
                      </div>
                    </button>
                  </motion.div>
                )
              })}
              {remaining > 0 && (
                <div className="pt-2 flex justify-center">
                  <Button variant="secondary" size="sm" loading={isFetching} onClick={() => setLimit(l => l + PAGE_LIMIT)}>
                    {t('tickets.loadMore', { remaining })}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {selectedTicket ? (
              <motion.div key={selectedTicket.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-off-white">{selectedTicket.subject}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted">{selectedTicket.tenant?.name || '—'}</span>
                          <span className="text-xs text-muted">·</span>
                          <span className="text-xs text-muted">{relativeFromTz(selectedTicket.createdAt, tz)}</span>
                          <Badge variant={STATUS_KEYS[selectedTicket.status]?.variant}>
                            {t(`tickets.${STATUS_KEYS[selectedTicket.status]?.i18n}`)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button size="xs" variant="ghost" icon={Trash2} onClick={() => handleDelete(selectedTicket)} className="!text-muted hover:!text-red-400">
                          <span className="hidden sm:inline">{t('tickets.deleteBtn')}</span>
                        </Button>
                        <button onClick={() => setSelectedId(null)} className="text-muted hover:text-off-white p-1">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    {/* Original message */}
                    <div className="p-3 bg-dark-card rounded-xl border border-dark-border">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <User size={14} className="text-muted" />
                        <span className="text-xs font-medium text-off-white">{selectedTicket.createdBy?.name || selectedTicket.createdBy?.email || '—'}</span>
                        <span className="text-xs text-muted">·</span>
                        <span className="text-xs text-muted">{relativeFromTz(selectedTicket.createdAt, tz)}</span>
                      </div>
                      <p className="text-sm text-off-white whitespace-pre-wrap">{selectedTicket.description}</p>
                      <AttachmentGallery urls={selectedTicket.attachments} className="mt-3" />
                    </div>

                    {/* Replies */}
                    {(selectedTicket.replies || []).map((reply, i) => (
                      <div key={reply.id || i} className={`p-3 rounded-xl border ${reply.isAdmin ? 'border-brand/20 bg-brand/5 sm:ml-4' : 'border-dark-border bg-dark-card'}`}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {reply.isAdmin
                            ? <ShieldCheck size={14} className="text-brand" />
                            : <User size={14} className="text-muted" />}
                          <span className={`text-xs font-medium ${reply.isAdmin ? 'text-brand' : 'text-off-white'}`}>{reply.author?.name || reply.author?.email || '—'}</span>
                          <span className="text-xs text-muted">·</span>
                          <span className="text-xs text-muted">{relativeFromTz(reply.createdAt, tz)}</span>
                        </div>
                        {reply.message && <p className="text-sm text-off-white whitespace-pre-wrap">{reply.message}</p>}
                        <AttachmentGallery urls={reply.attachments} className={reply.message ? 'mt-2' : ''} />
                      </div>
                    ))}

                    {/* Status Controls */}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {Object.entries(STATUS_KEYS).map(([key, cfg]) => {
                        const Icn = cfg.icon
                        return (
                          <button
                            key={key}
                            onClick={() => handleStatusChange(selectedTicket.id, key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedTicket.status === key ? 'border-brand bg-brand/10 text-brand' : 'border-dark-border text-muted hover:border-brand/30'}`}
                          >
                            <Icn size={12} className={cfg.color} />
                            {t(`tickets.${cfg.i18n}`)}
                          </button>
                        )
                      })}
                    </div>

                    {/* Reply box */}
                    {selectedTicket.status !== 'resolved' && (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          rows={3}
                          placeholder={t('tickets.writeReplyAdmin')}
                          className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-brand/50 transition-colors"
                        />
                        <AttachmentPicker value={replyAttachments} onChange={setReplyAttachments} disabled={sending} />
                        <Button icon={Send} size="sm" onClick={handleReply} disabled={sending || (!replyText.trim() && replyAttachments.length === 0)} loading={sending}>
                          {sending ? t('tickets.sending') : t('tickets.sendReply')}
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-80">
                <div className="text-center text-muted">
                  <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
                  <p>{t('tickets.selectTicketHint')}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => { await confirmAction.run(); setConfirmAction(null) }}
        title={confirmAction?.title}
        description={confirmAction?.description}
        confirmText={t('tickets.confirmYes')}
        cancelText={t('tickets.confirmNo')}
        variant="danger"
      />
    </div>
  )
}

function KpiCard({ label, value, color, icon: Icon, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Icon size={15} className={color} />
        </div>
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value ?? '—'}</p>
      </Card>
    </motion.div>
  )
}

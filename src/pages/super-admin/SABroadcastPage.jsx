import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Megaphone, Send, Trash2, Eye, EyeOff, Users, User, Info, AlertTriangle, XCircle, CheckCircle,
  Filter, X, Search, Radio, RefreshCw,
} from 'lucide-react'
import {
  useAllBroadcasts, useCreateBroadcast, useUpdateBroadcast, useDeleteBroadcast,
} from '../../hooks/useBroadcasts.js'
import { useTenants } from '../../hooks/useTenants.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { formatDateTimeInTz, getTenantTimezone, DEFAULT_TZ } from '../../utils/timezone.js'

const PAGE_LIMIT = 20

const TYPE_KEYS = {
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',   i18n: 'typeInfo'    },
  warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20', i18n: 'typeWarning' },
  error:   { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',     i18n: 'typeError'   },
  success: { icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20', i18n: 'typeSuccess' },
}

export default function SABroadcastPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const tz = getTenantTimezone() || DEFAULT_TZ

  const [filterStatus, setFilterStatus] = useState('') // ''|active|inactive
  const [filterType,   setFilterType]   = useState('')
  const [search,       setSearch]       = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [limit,        setLimit]        = useState(PAGE_LIMIT)

  const [showModal, setShowModal]       = useState(false)
  const [form, setForm]                 = useState({ title: '', message: '', type: 'info', mode: 'all' })
  const [selectedTenantIds, setSelectedTenantIds] = useState([])
  const [sending, setSending]           = useState(false)

  const [confirmAction, setConfirmAction] = useState(null)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => { setLimit(PAGE_LIMIT) }, [filterStatus, filterType, debouncedSearch])

  const filters = useMemo(() => {
    const f = { limit, page: 1 }
    if (filterStatus === 'active')   f.active = 'true'
    if (filterStatus === 'inactive') f.active = 'false'
    return f
  }, [filterStatus, limit])

  const { data: resp, isLoading, isError, refetch, isFetching } = useAllBroadcasts(filters)
  const allList = resp?.data || []
  const meta    = resp?.meta || { total: 0 }

  // Type filter & search are applied client-side for now (paginated results
  // are usually small enough; backend filter for type/search can be added later
  // if the dataset grows).
  const broadcasts = useMemo(() => {
    let list = allList
    if (filterType) list = list.filter(b => b.type === filterType)
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(b =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.message || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [allList, filterType, debouncedSearch])

  const remaining = Math.max(0, (meta.total || 0) - allList.length)
  const hasFilter = filterStatus || filterType || debouncedSearch

  const stats = {
    total:    meta.total ?? allList.length,
    active:   allList.filter(b => b.active).length,
    inactive: allList.filter(b => !b.active).length,
  }

  const { data: tenants = [] } = useTenants({ limit: 200 })

  const createBroadcast = useCreateBroadcast()
  const updateBroadcast = useUpdateBroadcast()
  const deleteBroadcast = useDeleteBroadcast()

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      return toast.error(t('superAdmin.broadcast.toastRequired'))
    }
    if (form.mode === 'specific' && selectedTenantIds.length === 0) {
      return toast.error(t('superAdmin.broadcast.selectAtLeastOne'))
    }
    setSending(true)
    try {
      await createBroadcast.mutateAsync({
        title:   form.title,
        message: form.message,
        type:    form.type,
        // Backend canonical field; `targetTenants` legacy is also accepted but
        // we send the modern shape.
        tenantIds: form.mode === 'all' ? [] : selectedTenantIds,
      })
      toast.success(t('superAdmin.broadcast.toastSuccess'))
      setShowModal(false)
      setForm({ title: '', message: '', type: 'info', mode: 'all' })
      setSelectedTenantIds([])
    } catch (err) {
      toast.error(err?.response?.data?.error || t('superAdmin.broadcast.toastFailed'))
    } finally {
      setSending(false)
    }
  }

  const askDelete = (bc) => setConfirmAction({
    title: t('superAdmin.broadcast.confirmDeleteTitle'),
    description: t('superAdmin.broadcast.confirmDeleteDesc', { title: bc.title }),
    run: async () => {
      try {
        await deleteBroadcast.mutateAsync(bc.id)
        toast.success(t('superAdmin.broadcast.deletedToast'))
      } catch {
        toast.error(t('superAdmin.broadcast.deleteFailed'))
      }
    },
  })

  const askDeactivate = (bc) => setConfirmAction({
    title: t('superAdmin.broadcast.confirmDeactivateTitle'),
    description: t('superAdmin.broadcast.confirmDeactivateDesc', { title: bc.title }),
    run: async () => {
      try {
        await updateBroadcast.mutateAsync({ id: bc.id, active: false })
        toast.info(t('superAdmin.broadcast.deactivatedToast'))
      } catch {
        toast.error(t('superAdmin.broadcast.deactivateFailed'))
      }
    },
  })

  const handleActivate = async (bc) => {
    try {
      await updateBroadcast.mutateAsync({ id: bc.id, active: true })
      toast.success(t('superAdmin.broadcast.activatedToast'))
    } catch {
      toast.error(t('superAdmin.broadcast.deactivateFailed'))
    }
  }

  const toggleTenant = (id) =>
    setSelectedTenantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleResetFilters = () => {
    setFilterStatus(''); setFilterType(''); setSearch('')
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.broadcast.pageTitle')}</h1>
        <Card className="p-8 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <h3 className="font-semibold text-off-white mb-1">{t('superAdmin.broadcast.errorLoading')}</h3>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            {t('superAdmin.broadcast.retry')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.broadcast.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.broadcast.pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-[10px] text-green-400 font-medium">
            <Radio size={10} className="animate-pulse" /> {t('realtime.live')}
          </span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
            {t('superAdmin.broadcast.retry')}
          </Button>
          <Button icon={Send} size="sm" onClick={() => setShowModal(true)}>{t('superAdmin.broadcast.send')}</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('superAdmin.broadcast.totalBroadcast'), value: stats.total,    color: 'text-gold' },
          { label: t('superAdmin.broadcast.activeCount'),   value: stats.active,   color: 'text-green-400' },
          { label: t('superAdmin.broadcast.inactiveCount'), value: stats.inactive, color: 'text-muted' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted mt-1">{s.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filter row */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted flex-shrink-0" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40">
            <option value="">{t('superAdmin.broadcast.filterAllStatus')}</option>
            <option value="active">{t('superAdmin.broadcast.filterActive')}</option>
            <option value="inactive">{t('superAdmin.broadcast.filterInactive')}</option>
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40">
            <option value="">{t('superAdmin.broadcast.filterAllType')}</option>
            {Object.keys(TYPE_KEYS).map(k => (
              <option key={k} value={k}>{t(`superAdmin.broadcast.${TYPE_KEYS[k].i18n}`)}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('superAdmin.broadcast.searchPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40" />
          </div>
          {hasFilter && (
            <button onClick={handleResetFilters} className="flex items-center gap-1 text-xs text-muted hover:text-off-white">
              <X size={12} /> {t('superAdmin.broadcast.resetFilter')}
            </button>
          )}
        </div>
      </Card>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="h-5 bg-dark-surface rounded animate-pulse w-1/3 mb-2" />
              <div className="h-3.5 bg-dark-surface rounded animate-pulse w-2/3" />
            </Card>
          ))
        ) : broadcasts.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
            <p>{hasFilter ? t('superAdmin.broadcast.noResults') : t('superAdmin.broadcast.empty')}</p>
            {hasFilter && (
              <button onClick={handleResetFilters} className="text-xs text-gold hover:underline mt-2">
                {t('superAdmin.broadcast.resetFilter')}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted px-1">
              {t('superAdmin.broadcast.totalEntries', { shown: broadcasts.length, total: meta.total ?? broadcasts.length })}
            </p>
            {broadcasts.map((bc, i) => {
              const cfg = TYPE_KEYS[bc.type] || TYPE_KEYS.info
              const Icn = cfg.icon
              const total = bc.recipientsTotal ?? bc._count?.recipients ?? 0
              const read  = bc.recipientsRead  ?? 0
              return (
                <motion.div key={bc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                  <Card className={`p-4 border ${bc.active ? '' : 'opacity-60'}`}>
                    <div className="flex gap-4 flex-wrap sm:flex-nowrap">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
                        <Icn size={18} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-off-white">{bc.title}</h3>
                            <p className="text-sm text-muted mt-0.5 line-clamp-2">{bc.message}</p>
                          </div>
                          <Badge variant={bc.active ? 'success' : 'muted'}>
                            {bc.active ? t('superAdmin.broadcast.badgeActive') : t('superAdmin.broadcast.badgeInactive')}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted flex-wrap">
                          <span title={formatDateTimeInTz(bc.sentAt, tz)}>{formatDateTimeInTz(bc.sentAt, tz)}</span>
                          <span className="flex items-center gap-1">
                            <Users size={11} />
                            {t('superAdmin.broadcast.tenantCount', { count: total })}
                          </span>
                          <span className="flex items-center gap-1 text-green-400">
                            <Eye size={11} />
                            {t('superAdmin.broadcast.readCount', { read, total })}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 self-start">
                        {bc.active ? (
                          <button onClick={() => askDeactivate(bc)}
                            className="p-2 rounded-lg text-muted hover:text-amber-400 transition-colors" title={t('superAdmin.broadcast.deactivateTooltip')}>
                            <EyeOff size={15} />
                          </button>
                        ) : (
                          <button onClick={() => handleActivate(bc)}
                            className="p-2 rounded-lg text-muted hover:text-green-400 transition-colors" title={t('superAdmin.broadcast.activateTooltip')}>
                            <Eye size={15} />
                          </button>
                        )}
                        <button onClick={() => askDelete(bc)}
                          className="p-2 rounded-lg text-muted hover:text-red-400 transition-colors" title={t('superAdmin.broadcast.deleteTooltip')}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )
            })}
            {remaining > 0 && (
              <div className="pt-2 flex justify-center">
                <Button variant="secondary" size="sm" loading={isFetching} onClick={() => setLimit(l => l + PAGE_LIMIT)}>
                  {t('superAdmin.broadcast.loadMore', { remaining })}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Send Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('superAdmin.broadcast.modalSendTitle')}>
        <div className="space-y-4">
          <Input
            label={t('superAdmin.broadcast.titleLabel')}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder={t('superAdmin.broadcast.titlePlaceholder')}
          />
          <div>
            <label className="block text-xs text-muted mb-1.5">{t('superAdmin.broadcast.messageLabel')}</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={4}
              placeholder={t('superAdmin.broadcast.messagePlaceholder')}
              className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-gold/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">{t('superAdmin.broadcast.typeLabel')}</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_KEYS).map(([key, cfg]) => {
                const Icn = cfg.icon
                return (
                  <button key={key} onClick={() => setForm(f => ({ ...f, type: key }))}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm transition-all ${form.type === key ? 'border-gold bg-gold/10 text-off-white' : 'border-dark-border text-muted hover:border-gold/30'}`}>
                    <Icn size={14} className={cfg.color} />
                    {t(`superAdmin.broadcast.${cfg.i18n}`)}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">{t('superAdmin.broadcast.targetLabel')}</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setForm(f => ({ ...f, mode: 'all' }))}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm transition-all ${form.mode === 'all' ? 'border-gold bg-gold/10 text-gold' : 'border-dark-border text-muted'}`}>
                <Users size={14} />{t('superAdmin.broadcast.targetAll')}
              </button>
              <button onClick={() => setForm(f => ({ ...f, mode: 'specific' }))}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm transition-all ${form.mode === 'specific' ? 'border-gold bg-gold/10 text-gold' : 'border-dark-border text-muted'}`}>
                <User size={14} />{t('superAdmin.broadcast.targetSpecific')}
              </button>
            </div>
            {form.mode === 'specific' && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {tenants.map(tt => (
                  <label key={tt.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${selectedTenantIds.includes(tt.id) ? 'border-gold bg-gold/5' : 'border-dark-border hover:border-gold/30'}`}>
                    <input type="checkbox" checked={selectedTenantIds.includes(tt.id)} onChange={() => toggleTenant(tt.id)} className="accent-gold" />
                    <span className="text-sm text-off-white flex-1 truncate">{tt.name}</span>
                    {tt.package && (
                      <Badge variant={tt.status === 'active' ? 'success' : 'danger'} className="ml-auto">{tt.package}</Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setShowModal(false)}>{t('superAdmin.broadcast.cancel')}</Button>
            <Button fullWidth icon={Send} onClick={handleSend} disabled={sending} loading={sending}>
              {sending ? t('superAdmin.broadcast.sending') : t('superAdmin.broadcast.sendNow')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => { await confirmAction.run(); setConfirmAction(null) }}
        title={confirmAction?.title}
        description={confirmAction?.description}
        confirmText={t('superAdmin.broadcast.confirmYes')}
        cancelText={t('superAdmin.broadcast.confirmNo')}
        variant="danger"
      />
    </div>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  Tag, Plus, Power, Edit, CheckCircle, AlertCircle, Calendar,
  Filter, X, Search, Radio, RefreshCw, AlertTriangle, Eye,
} from 'lucide-react'
import {
  usePromotions, useCreatePromotion, useUpdatePromotion,
  useDeactivatePromotion, useActivatePromotion,
} from '../../hooks/usePromotions.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge from '../../components/ui/Badge.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatRupiah } from '../../utils/format.js'
import { formatDateInTz, getTenantTimezone, DEFAULT_TZ } from '../../utils/timezone.js'

const APPLIES_OPTIONS = [
  { id: 'subscription', i18nKey: 'appliesSubscription' },
  { id: 'upgrade',      i18nKey: 'appliesUpgrade' },
  { id: 'branch_addon', i18nKey: 'appliesBranchAddon' },
]
const PACKAGE_OPTIONS = ['Basic', 'Pro', 'Enterprise']
const CYCLE_OPTIONS   = [
  { id: 'monthly', i18nKey: 'cycleMonthly' },
  { id: 'annual',  i18nKey: 'cycleAnnual'  },
]

const empty = {
  code: '', description: '',
  discountType: 'percent', discountValue: 10,
  validFrom: '', validUntil: '',
  maxUses: '',
  appliesTo: [],
  packageScope: [],
  cycleScope: [],
  isActive: true,
}

export default function SAPromotionsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const tz = getTenantTimezone() || DEFAULT_TZ

  const { data: promos = [], isLoading, isError, refetch, isFetching } = usePromotions()
  const createPromo = useCreatePromotion()
  const updatePromo = useUpdatePromotion()
  const deactivate  = useDeactivatePromotion()
  const activate    = useActivatePromotion()

  const [filterStatus, setFilterStatus]       = useState('') // ''|active|inactive
  const [filterApplies, setFilterApplies]     = useState('')
  const [search, setSearch]                   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(empty)
  const [confirmAction, setConfirmAction] = useState(null)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const filteredPromos = useMemo(() => {
    let list = promos
    if (filterStatus === 'active')   list = list.filter(p => p.isActive)
    if (filterStatus === 'inactive') list = list.filter(p => !p.isActive)
    if (filterApplies) list = list.filter(p => p.appliesTo?.includes(filterApplies))
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(p =>
        p.code.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [promos, filterStatus, filterApplies, debouncedSearch])

  const hasFilter = filterStatus || filterApplies || debouncedSearch
  const handleResetFilters = () => { setFilterStatus(''); setFilterApplies(''); setSearch('') }

  const stats = useMemo(() => {
    const now = Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    return {
      total: promos.length,
      active: promos.filter(p => p.isActive).length,
      redemptions: promos.reduce((s, p) => s + (p.usedCount || 0), 0),
      expiring: promos.filter(p =>
        p.isActive && p.validUntil &&
        new Date(p.validUntil).getTime() - now > 0 &&
        new Date(p.validUntil).getTime() - now < sevenDays
      ).length,
    }
  }, [promos])

  function openNew() { setForm(empty); setEditing('new') }
  function openEdit(p) {
    setForm({
      code: p.code, description: p.description || '',
      discountType: p.discountType, discountValue: p.discountValue,
      validFrom:  p.validFrom  ? p.validFrom.slice(0, 10)  : '',
      validUntil: p.validUntil ? p.validUntil.slice(0, 10) : '',
      maxUses: p.maxUses ?? '',
      appliesTo: p.appliesTo || [], packageScope: p.packageScope || [], cycleScope: p.cycleScope || [],
      isActive: p.isActive,
    })
    setEditing(p)
  }

  async function handleSubmit() {
    // Client-side guards (mirror backend validation, present localized errors).
    if (form.code.trim().length < 3) return toast.error(t('superAdmin.promotions.validationCodeMin'))
    if (form.discountType === 'percent' && Number(form.discountValue) > 100) {
      return toast.error(t('superAdmin.promotions.validationPercentMax'))
    }
    try {
      const payload = {
        code:          form.code.toUpperCase(),
        description:   form.description || null,
        discountType:  form.discountType,
        discountValue: Number(form.discountValue),
        validFrom:  form.validFrom  ? new Date(`${form.validFrom}T00:00:00`).toISOString()  : null,
        validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null,
        maxUses: form.maxUses === '' ? null : Number(form.maxUses),
        appliesTo: form.appliesTo,
        packageScope: form.packageScope,
        cycleScope: form.cycleScope,
        isActive: form.isActive,
      }
      if (editing === 'new') {
        await createPromo.mutateAsync(payload)
        toast.success(t('superAdmin.promotions.toastCreated'))
      } else {
        await updatePromo.mutateAsync({ id: editing.id, ...payload })
        toast.success(t('superAdmin.promotions.toastUpdated'))
      }
      setEditing(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('superAdmin.promotions.toastSaveFailed'))
    }
  }

  const askDeactivate = (p) => setConfirmAction({
    title: t('superAdmin.promotions.confirmDeactivateTitle', { code: p.code }),
    description: t('superAdmin.promotions.confirmDeactivateDesc'),
    run: async () => {
      try {
        await deactivate.mutateAsync(p.id)
        toast.success(t('superAdmin.promotions.toastDeactivated'))
      } catch (err) {
        toast.error(err?.response?.data?.error || t('superAdmin.promotions.toastDeactivateFailed'))
      }
    },
  })

  const handleActivate = async (p) => {
    try {
      await activate.mutateAsync(p.id)
      toast.success(t('superAdmin.promotions.toastActivated'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('superAdmin.promotions.toastActivateFailed'))
    }
  }

  function toggleArrayItem(field, item) {
    setForm(f => {
      const cur = f[field] || []
      return { ...f, [field]: cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item] }
    })
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-off-white">{t('superAdmin.promotions.pageTitle')}</h1>
        <Card className="p-8 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <h3 className="font-semibold text-off-white mb-1">{t('superAdmin.promotions.errorLoading')}</h3>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            {t('superAdmin.promotions.retry')}
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('superAdmin.promotions.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.promotions.pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-[10px] text-green-400 font-medium">
            <Radio size={10} className="animate-pulse" /> {t('realtime.live')}
          </span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
            {t('superAdmin.promotions.retry')}
          </Button>
          <Button icon={Plus} size="sm" onClick={openNew}>{t('superAdmin.promotions.createBtn')}</Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t('superAdmin.promotions.kpiTotal')}       value={stats.total}       color="text-brand"        icon={Tag} delay={0} />
        <KpiCard label={t('superAdmin.promotions.kpiActive')}      value={stats.active}      color="text-green-400"   icon={CheckCircle} delay={0.05} />
        <KpiCard label={t('superAdmin.promotions.kpiRedemptions')} value={stats.redemptions} color="text-blue-400"    icon={Eye} delay={0.1} />
        <KpiCard label={t('superAdmin.promotions.kpiExpiring')}    value={stats.expiring}    color="text-amber-400"   icon={Calendar} delay={0.15} />
      </div>

      {/* Filter */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted flex-shrink-0" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('superAdmin.promotions.filterAllStatus')}</option>
            <option value="active">{t('superAdmin.promotions.filterActive')}</option>
            <option value="inactive">{t('superAdmin.promotions.filterInactive')}</option>
          </select>
          <select value={filterApplies} onChange={e => setFilterApplies(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="">{t('superAdmin.promotions.filterAllAppliesTo')}</option>
            {APPLIES_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{t(`superAdmin.promotions.${opt.i18nKey}`)}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('superAdmin.promotions.searchPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-brand/40" />
          </div>
          {hasFilter && (
            <button onClick={handleResetFilters} className="flex items-center gap-1 text-xs text-muted hover:text-off-white">
              <X size={12} /> {t('superAdmin.promotions.resetFilter')}
            </button>
          )}
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 bg-dark-card rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredPromos.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12 text-muted">
            <Tag size={32} className="mx-auto mb-3 opacity-30" />
            <p>{hasFilter ? t('superAdmin.promotions.noResults') : t('superAdmin.promotions.empty')}</p>
            {hasFilter && (
              <button onClick={handleResetFilters} className="text-xs text-brand hover:underline mt-2">
                {t('superAdmin.promotions.resetFilter')}
              </button>
            )}
          </CardBody>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid md:grid-cols-2 gap-4">
          {filteredPromos.map(p => {
            const usagePct = p.maxUses ? Math.min(100, Math.round((p.usedCount / p.maxUses) * 100)) : null
            const quotaLabel = p.maxUses ? ` / ${p.maxUses}` : t('superAdmin.promotions.unlimited')
            return (
              <Card key={p.id} className={`p-4 border ${p.isActive ? 'border-brand/30' : 'border-dark-border opacity-60'}`}>
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-mono text-base font-bold text-brand">{p.code}</p>
                      <Badge variant={p.isActive ? 'success' : 'muted'}>
                        {p.isActive ? t('superAdmin.promotions.badgeActive') : t('superAdmin.promotions.badgeInactive')}
                      </Badge>
                    </div>
                    {p.description && <p className="text-xs text-muted mt-1">{p.description}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-dark-surface text-muted hover:text-off-white" title={t('superAdmin.promotions.tooltipEdit')}>
                      <Edit size={14} />
                    </button>
                    {p.isActive ? (
                      <button onClick={() => askDeactivate(p)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400" title={t('superAdmin.promotions.tooltipDeactivate')}>
                        <Power size={14} />
                      </button>
                    ) : (
                      <button onClick={() => handleActivate(p)} className="p-1.5 rounded-lg hover:bg-green-500/10 text-muted hover:text-green-400" title={t('superAdmin.promotions.tooltipActivate')}>
                        <Power size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-2xl font-bold text-off-white mb-2">
                  {p.discountType === 'percent' ? `${p.discountValue}%` : formatRupiah(p.discountValue)}
                  <span className="text-xs text-muted font-normal ml-1">{t('superAdmin.promotions.discountSuffix')}</span>
                </p>

                <div className="space-y-1 text-xs text-muted">
                  {p.validFrom && (
                    <p className="flex items-center gap-1">
                      <Calendar size={11} /> {t('superAdmin.promotions.validFrom', { date: formatDateInTz(p.validFrom, tz) })}
                    </p>
                  )}
                  {p.validUntil && (
                    <p className="flex items-center gap-1">
                      <Calendar size={11} /> {t('superAdmin.promotions.validUntil', { date: formatDateInTz(p.validUntil, tz) })}
                    </p>
                  )}
                  <p>{t('superAdmin.promotions.usageInfo', { used: p.usedCount, quotaLabel })}</p>
                  {usagePct != null && (
                    <div className="h-1 bg-dark-surface rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-brand transition-all" style={{ width: `${usagePct}%` }} />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {p.appliesTo.map(a => {
                    const lbl = APPLIES_OPTIONS.find(o => o.id === a)
                    return (
                      <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 border border-blue-400/20">
                        {lbl ? t(`superAdmin.promotions.${lbl.i18nKey}`) : a}
                      </span>
                    )
                  })}
                  {p.packageScope.map(pk => (
                    <span key={pk} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">{pk}</span>
                  ))}
                  {p.cycleScope.map(c => {
                    const lbl = CYCLE_OPTIONS.find(o => o.id === c)
                    return (
                      <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 border border-green-400/20">
                        {lbl ? t(`superAdmin.promotions.${lbl.i18nKey}`) : c}
                      </span>
                    )
                  })}
                  {!p.appliesTo.length && !p.packageScope.length && !p.cycleScope.length && (
                    <span className="text-[10px] text-muted">{t('superAdmin.promotions.appliesAll')}</span>
                  )}
                </div>
              </Card>
            )
          })}
        </motion.div>
      )}

      {/* Editor modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)}
        title={editing === 'new'
          ? t('superAdmin.promotions.modalTitleNew')
          : t('superAdmin.promotions.modalTitleEdit', { code: editing?.code || '' })}
      >
        <div className="space-y-4">
          <Input
            label={t('superAdmin.promotions.fieldCode')}
            placeholder={t('superAdmin.promotions.codePlaceholder')}
            value={form.code}
            onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            disabled={editing !== 'new'}
          />
          <Input
            label={t('superAdmin.promotions.fieldDescription')}
            placeholder={t('superAdmin.promotions.descriptionPlaceholder')}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />

          <div>
            <label className="text-xs text-muted block mb-1">{t('superAdmin.promotions.fieldDiscountType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'percent', i18n: 'typePercent' },
                { id: 'flat',    i18n: 'typeFlat'    },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setForm(f => ({ ...f, discountType: opt.id }))}
                  className={`p-2 rounded-lg border text-sm transition-colors ${
                    form.discountType === opt.id ? 'border-brand/60 bg-brand/10 text-brand' : 'border-dark-border bg-dark-card text-off-white'
                  }`}
                >{t(`superAdmin.promotions.${opt.i18n}`)}</button>
              ))}
            </div>
          </div>

          <Input
            label={form.discountType === 'percent' ? t('superAdmin.promotions.fieldDiscountPercent') : t('superAdmin.promotions.fieldDiscountFlat')}
            type="number"
            value={form.discountValue}
            onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input label={t('superAdmin.promotions.fieldValidFrom')}  type="date" value={form.validFrom}  onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} />
            <Input label={t('superAdmin.promotions.fieldValidUntil')} type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
          </div>

          <Input
            label={t('superAdmin.promotions.fieldMaxUses')}
            type="number"
            value={form.maxUses}
            onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
          />

          <ScopeSelector
            label={t('superAdmin.promotions.fieldAppliesTo')}
            options={APPLIES_OPTIONS}
            selected={form.appliesTo}
            onToggle={(v) => toggleArrayItem('appliesTo', v)}
            t={t}
          />
          <ScopeSelector
            label={t('superAdmin.promotions.fieldPackageScope')}
            options={PACKAGE_OPTIONS.map(p => ({ id: p, label: p }))}
            selected={form.packageScope}
            onToggle={(v) => toggleArrayItem('packageScope', v)}
            t={t}
          />
          <ScopeSelector
            label={t('superAdmin.promotions.fieldCycleScope')}
            options={CYCLE_OPTIONS}
            selected={form.cycleScope}
            onToggle={(v) => toggleArrayItem('cycleScope', v)}
            t={t}
          />

          <p className="text-xs text-muted flex items-start gap-1.5">
            <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
            {t('superAdmin.promotions.scopeNote')}
          </p>

          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setEditing(null)}>{t('superAdmin.promotions.btnCancel')}</Button>
            <Button fullWidth icon={CheckCircle} loading={createPromo.isPending || updatePromo.isPending} onClick={handleSubmit}>
              {t('superAdmin.promotions.btnSave')}
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
        confirmText={t('superAdmin.promotions.confirmYes')}
        cancelText={t('superAdmin.promotions.confirmNo')}
        variant="danger"
      />
    </div>
  )
}

function ScopeSelector({ label, options, selected, onToggle, t }) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const id = opt.id
          const lbl = opt.label || (opt.i18nKey ? t(`superAdmin.promotions.${opt.i18nKey}`) : id)
          const isOn = selected.includes(id)
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isOn ? 'border-brand/60 bg-brand/10 text-brand' : 'border-dark-border bg-dark-card text-muted hover:text-off-white'
              }`}
            >{lbl}</button>
          )
        })}
      </div>
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

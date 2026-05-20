import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flag, RotateCcw, Loader2, Search, CheckSquare, Square,
  Copy, ChevronDown, AlertTriangle, Sparkles, X, Radio, RefreshCw,
  Package as PackageIcon, ShieldCheck, ChevronRight,
} from 'lucide-react'
import { useTenants } from '../../hooks/useTenants.js'
import {
  useFeatureFlags, useUpdateFeatureFlags,
  useSyncTenantToPackage, useFeatureFlagAudit, useSyncAllTenants,
} from '../../hooks/useFeatureFlags.js'
import { ALL_FEATURE_FLAGS, PACKAGE_FLAG_DEFAULTS } from '../../store/featureFlagStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import api from '../../lib/api.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  Core:        'text-blue-400',
  Analytics:   'text-purple-400',
  Operations:  'text-green-400',
  UX:          'text-gold',
  Enterprise:  'text-pink-400',
}

const PACKAGE_COLORS = {
  Basic:      'text-blue-400 border-blue-400/30 bg-blue-400/10',
  Pro:        'text-gold border-gold/30 bg-gold/10',
  Enterprise: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function flagDeviation(flagId, enabled, pkgDefaults) {
  if (!pkgDefaults) return null
  const inDefault = pkgDefaults.includes(flagId)
  if (enabled && !inDefault) return 'bonus'
  if (!enabled && inDefault) return 'missing'
  return null
}

function categoryLabel(t, category) {
  return t(`superAdmin.featureFlags.category${category}`, { defaultValue: category })
}

// ── Copy from tenant dropdown ─────────────────────────────────────────────────
function CopyFromMenu({ tenants, currentTenantId, onPick, t }) {
  const [open, setOpen] = useState(false)
  const others = tenants.filter(tt => tt.id !== currentTenantId)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border text-xs text-muted hover:border-gold/30 hover:text-off-white transition-all"
      >
        <Copy size={12} />
        {t('superAdmin.featureFlags.copyFromMenu')}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] max-h-72 overflow-y-auto bg-dark-card border border-dark-border rounded-xl shadow-xl"
            >
              {others.length === 0 && (
                <p className="text-xs text-muted px-3 py-2.5">{t('superAdmin.featureFlags.copyFromEmpty')}</p>
              )}
              {others.map(tt => (
                <button
                  key={tt.id}
                  onClick={() => { onPick(tt); setOpen(false) }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-off-white hover:bg-dark-surface transition-colors text-left"
                >
                  <span className="truncate">{tt.name}</span>
                  {tt.package && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${PACKAGE_COLORS[tt.package] || 'text-muted border-dark-border'}`}>
                      {tt.package}
                    </span>
                  )}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SAFeatureFlagsPage() {
  const { t } = useTranslation()
  const toast = useToast()

  const { data: tenants = [], isLoading: loadingTenants, isError: tenantsError, refetch: refetchTenants } = useTenants({ limit: 100 })

  const [tenantQuery,   setTenantQuery]   = useState('')
  const [searchQuery,   setSearchQuery]   = useState('')
  const [selectedTenantId, setSelectedTenantId] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  const filteredTenants = useMemo(() => {
    if (!tenantQuery.trim()) return tenants
    const q = tenantQuery.trim().toLowerCase()
    return tenants.filter(tt =>
      tt.name?.toLowerCase().includes(q) ||
      tt.slug?.toLowerCase().includes(q) ||
      tt.email?.toLowerCase().includes(q)
    )
  }, [tenants, tenantQuery])

  // Pick the first tenant once tenants load if user hasn't picked yet.
  useEffect(() => {
    if (!selectedTenantId && tenants.length > 0) setSelectedTenantId(tenants[0].id)
  }, [tenants, selectedTenantId])

  const effectiveTenantId = selectedTenantId || filteredTenants[0]?.id || tenants[0]?.id || null

  const { data: flags = [], isLoading: loadingFlags } = useFeatureFlags(effectiveTenantId)
  const updateFlags = useUpdateFeatureFlags()
  const syncOne     = useSyncTenantToPackage()
  const syncAll     = useSyncAllTenants()
  const { data: audit, isLoading: loadingAudit, refetch: refetchAudit } = useFeatureFlagAudit()
  const isSaving    = updateFlags.isPending

  const selectedTenant = tenants.find(tt => tt.id === effectiveTenantId)
  const pkgDefaults    = selectedTenant?.package ? (PACKAGE_FLAG_DEFAULTS[selectedTenant.package] || []) : null

  const filteredFlags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return ALL_FEATURE_FLAGS
    return ALL_FEATURE_FLAGS.filter(f =>
      f.label.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const groupedFlags = useMemo(() => filteredFlags.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = []
    acc[f.category].push(f)
    return acc
  }, {}), [filteredFlags])

  const deviationStats = useMemo(() => {
    if (!pkgDefaults) return { bonus: 0, missing: 0, custom: 0 }
    const bonus   = flags.filter(f => !pkgDefaults.includes(f)).length
    const missing = pkgDefaults.filter(f => !flags.includes(f)).length
    return { bonus, missing, custom: bonus + missing }
  }, [flags, pkgDefaults])

  // Platform-wide KPI: how many tenants have at least one customization vs default.
  const platformKpi = useMemo(() => {
    let customized = 0
    for (const tt of tenants) {
      // We only know live counts for the loaded tenant; use a heuristic based on
      // package defaults vs any prior caches. Still useful as an approximate
      // "tenants with non-default config" indicator.
      const def = tt.package && PACKAGE_FLAG_DEFAULTS[tt.package]
      if (!def) continue
      // Conservative: only count the active tenant for now (live truth).
      if (tt.id === effectiveTenantId && deviationStats.custom > 0) customized++
    }
    return {
      tenantCount: tenants.length,
      activeFlags: flags.length,
      customized,
    }
  }, [tenants, effectiveTenantId, deviationStats.custom, flags.length])

  // ── Mutation helpers ───────────────────────────────────────────────────────
  const save = (newFlags, successMsg, failMsg) =>
    updateFlags.mutate(
      { tenantId: effectiveTenantId, flags: newFlags },
      {
        onSuccess: () => toast.info(successMsg),
        onError:   () => toast.error(failMsg || t('superAdmin.featureFlags.saveFailed')),
      }
    )

  const handleToggle = (flagId, flagLabel) => {
    const isEnabled = flags.includes(flagId)
    const newFlags  = isEnabled ? flags.filter(f => f !== flagId) : [...flags, flagId]
    save(newFlags, isEnabled
      ? t('superAdmin.featureFlags.toastDisabled', { label: flagLabel })
      : t('superAdmin.featureFlags.toastEnabled',  { label: flagLabel })
    )
  }

  const askReset = () => {
    const pkg = selectedTenant?.package
    if (!pkg) return
    setConfirmAction({
      title: t('superAdmin.featureFlags.confirmResetTitle'),
      description: t('superAdmin.featureFlags.confirmResetDesc', { pkg }),
      run: () => {
        const defaults = PACKAGE_FLAG_DEFAULTS[pkg] || []
        save(
          defaults,
          t('superAdmin.featureFlags.toastReset', { pkg }),
          t('superAdmin.featureFlags.resetFailed'),
        )
      },
    })
  }

  const askCopyFrom = (sourceTenant) => {
    setConfirmAction({
      title: t('superAdmin.featureFlags.confirmCopyTitle', { name: sourceTenant.name }),
      description: t('superAdmin.featureFlags.confirmCopyDesc', { name: sourceTenant.name }),
      run: async () => {
        try {
          const res = await api.get(`/feature-flags/${sourceTenant.id}`)
          const data = res.data.data || []
          const sourceFlags = typeof data[0] === 'string'
            ? data
            : data.filter(f => f.enabled).map(f => f.id)
          save(
            sourceFlags,
            t('superAdmin.featureFlags.copyToastSuccess', { name: sourceTenant.name })
          )
        } catch {
          toast.error(t('superAdmin.featureFlags.copyToastFailed'))
        }
      },
    })
  }

  const handleBulkCategory = (category, categoryFlags, enableAll) => {
    const categoryIds = categoryFlags.map(f => f.id)
    const apply = () => {
      const newFlags = enableAll
        ? [...new Set([...flags, ...categoryIds])]
        : flags.filter(f => !categoryIds.includes(f))
      save(
        newFlags,
        enableAll
          ? t('superAdmin.featureFlags.bulkAllToast', { category: categoryLabel(t, category) })
          : t('superAdmin.featureFlags.bulkNoneToast', { category: categoryLabel(t, category) })
      )
    }
    if (!enableAll) {
      setConfirmAction({
        title: t('superAdmin.featureFlags.confirmBulkOffTitle', { category: categoryLabel(t, category) }),
        description: t('superAdmin.featureFlags.confirmBulkOffDesc', { category: categoryLabel(t, category) }),
        run: apply,
      })
    } else {
      apply()
    }
  }

  function tenantFlagHint(tenant) {
    if (tenant.id === effectiveTenantId) return `${flags.length}/${ALL_FEATURE_FLAGS.length}`
    const pkg = tenant.package
    if (!pkg || !PACKAGE_FLAG_DEFAULTS[pkg]) return null
    return `${PACKAGE_FLAG_DEFAULTS[pkg].length}/${ALL_FEATURE_FLAGS.length}`
  }

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loadingTenants) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 bg-dark-card animate-pulse rounded-lg" />
        <div className="h-20 bg-dark-card animate-pulse rounded-2xl" />
        <p className="text-xs text-muted">{t('superAdmin.featureFlags.loadingTenants')}</p>
      </div>
    )
  }
  if (tenantsError) {
    return (
      <Card className="p-8 flex flex-col items-center text-center">
        <AlertTriangle size={32} className="text-amber-400 mb-3" />
        <h3 className="font-semibold text-off-white mb-1">{t('superAdmin.featureFlags.errorLoading')}</h3>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetchTenants()} className="mt-4">
          {t('superAdmin.featureFlags.retry')}
        </Button>
      </Card>
    )
  }
  if (tenants.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.featureFlags.pageTitle')}</h1>
        <Card className="p-10 text-center">
          <Flag size={32} className="mx-auto text-muted mb-3" />
          <p className="text-muted text-sm">{t('superAdmin.featureFlags.noTenantsHint')}</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.featureFlags.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.featureFlags.pageSubtitle')}</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-[10px] text-green-400 font-medium">
          <Radio size={10} className="animate-pulse" /> {t('realtime.live')}
        </span>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label={t('superAdmin.featureFlags.kpiTotalTenants')} value={platformKpi.tenantCount} color="text-blue-400" delay={0} />
        <KpiCard label={t('superAdmin.featureFlags.kpiActiveFlags')}   value={`${flags.length}/${ALL_FEATURE_FLAGS.length}`} color="text-gold" delay={0.05} />
        <KpiCard label={t('superAdmin.featureFlags.kpiCustomized')}    value={deviationStats.custom > 0 ? '1+' : '0'} color="text-emerald-400" delay={0.1} />
      </div>

      {/* Audit panel — fitur per tenant vs Package.features (source of truth) */}
      <AuditPanel
        audit={audit}
        loading={loadingAudit}
        onRefresh={refetchAudit}
        onSyncOne={(tenantId) =>
          setConfirmAction({
            title: 'Sinkronkan fitur ke paket?',
            description: 'Semua flag tenant ini akan disetel ulang sesuai daftar fitur paketnya. Override manual akan dihapus.',
            run: async () => {
              try {
                await syncOne.mutateAsync(tenantId)
                toast.info('Fitur disinkronkan ke paket.')
                refetchAudit()
              } catch (err) {
                toast.error(err?.response?.data?.error || 'Gagal sinkronisasi.')
              }
            },
          })
        }
        onSyncAll={() =>
          setConfirmAction({
            title: 'Sinkronkan SEMUA tenant?',
            description: 'Semua flag tenant aktif akan disetel ulang sesuai daftar fitur paket masing-masing dan flag tak dikenal dihapus. Pakai saat perlu cleanup massal — override manual akan hilang.',
            run: async () => {
              try {
                const res = await syncAll.mutateAsync()
                toast.info(`Selesai: ${res?.synced ?? '?'} tenant disync, ${res?.orphansRemoved ?? 0} flag tak dikenal dihapus.`)
                refetchAudit()
              } catch (err) {
                toast.error(err?.response?.data?.error || 'Gagal sinkronisasi massal.')
              }
            },
          })
        }
        onPickTenant={(id) => setSelectedTenantId(id)}
        syncingId={syncOne.isPending ? syncOne.variables : null}
        syncingAll={syncAll.isPending}
      />

      {/* Tenant Selector with search */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Search size={13} className="text-muted flex-shrink-0" />
          <input
            value={tenantQuery}
            onChange={e => setTenantQuery(e.target.value)}
            placeholder={t('superAdmin.featureFlags.tenantSearchPlaceholder')}
            className="flex-1 bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filteredTenants.map(tenant => {
            const hint     = tenantFlagHint(tenant)
            const isActive = effectiveTenantId === tenant.id
            return (
              <button
                key={tenant.id}
                onClick={() => setSelectedTenantId(tenant.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm transition-all ${isActive ? 'border-gold bg-gold/10 text-off-white' : 'border-dark-border text-muted hover:border-gold/30'}`}
              >
                <span className="font-medium">{tenant.name}</span>
                {tenant.package && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${PACKAGE_COLORS[tenant.package] || 'text-muted border-dark-border'}`}>
                    {tenant.package}
                  </span>
                )}
                {hint && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-gold/20 text-gold' : 'bg-dark-surface text-muted'}`}>
                    {hint}
                  </span>
                )}
              </button>
            )
          })}
          {filteredTenants.length === 0 && (
            <p className="text-xs text-muted">{t('superAdmin.featureFlags.noTenantsHint')}</p>
          )}
        </div>
      </Card>

      {/* Selected tenant info + actions */}
      {effectiveTenantId && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-off-white">{selectedTenant?.name}</h2>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <p className="text-sm text-muted">
                {loadingFlags
                  ? t('superAdmin.featureFlags.loadingFlags')
                  : t('superAdmin.featureFlags.featuresActiveInfo', { active: flags.length, total: ALL_FEATURE_FLAGS.length })}
                {selectedTenant?.package && (
                  <span className="text-muted">{t('superAdmin.featureFlags.packagePrefix', { pkg: selectedTenant.package })}</span>
                )}
              </p>
              {!loadingFlags && deviationStats.custom > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {deviationStats.bonus > 0 && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
                      <Sparkles size={10} />
                      {t('superAdmin.featureFlags.bonusCount', { count: deviationStats.bonus })}
                    </span>
                  )}
                  {deviationStats.missing > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={10} />
                      {t('superAdmin.featureFlags.missingCount', { count: deviationStats.missing })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CopyFromMenu tenants={tenants} currentTenantId={effectiveTenantId} onPick={askCopyFrom} t={t} />
            <Button
              variant="secondary"
              icon={syncOne.isPending ? Loader2 : ShieldCheck}
              size="sm"
              onClick={() =>
                setConfirmAction({
                  title: 'Sinkronkan fitur ke paket?',
                  description: `Semua flag ${selectedTenant?.name} akan disetel ulang sesuai daftar fitur paket ${selectedTenant?.package}. Override manual hilang.`,
                  run: async () => {
                    try {
                      await syncOne.mutateAsync(effectiveTenantId)
                      toast.info('Fitur disinkronkan ke paket.')
                      refetchAudit()
                    } catch (err) {
                      toast.error(err?.response?.data?.error || 'Gagal sinkronisasi.')
                    }
                  },
                })
              }
              disabled={syncOne.isPending || loadingFlags || !selectedTenant?.package}
            >
              Sync ke Paket
            </Button>
            <Button
              variant="secondary"
              icon={isSaving ? Loader2 : RotateCcw}
              size="sm"
              onClick={askReset}
              disabled={isSaving || loadingFlags || !selectedTenant?.package}
            >
              {t('superAdmin.featureFlags.resetButton')}
            </Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t('superAdmin.featureFlags.searchPlaceholder')}
          className="w-full bg-dark-card border border-dark-border rounded-xl pl-9 pr-9 py-2.5 text-sm text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40 transition-colors"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white">
            <X size={14} />
          </button>
        )}
      </div>

      {filteredFlags.length === 0 && (
        <div className="text-center py-12 text-muted text-sm">
          {t('superAdmin.featureFlags.noFlagsFound', { q: searchQuery })}
        </div>
      )}

      {/* Feature Flags by Category */}
      {loadingFlags ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-dark-card animate-pulse rounded-2xl" />)}
        </div>
      ) : Object.entries(groupedFlags).map(([category, categoryFlags]) => {
        const activeInCat = categoryFlags.filter(f => flags.includes(f.id)).length
        const allActive   = activeInCat === categoryFlags.length
        const noneActive  = activeInCat === 0
        return (
          <motion.div key={category} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Flag size={15} className={CATEGORY_COLORS[category] || 'text-muted'} />
                    <h3 className="font-semibold text-off-white">{categoryLabel(t, category)}</h3>
                    <span className="text-xs text-muted ml-1">
                      {t('superAdmin.featureFlags.activeInCategory', { active: activeInCat, total: categoryFlags.length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleBulkCategory(category, categoryFlags, true)}
                      disabled={isSaving || allActive}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted border border-dark-border hover:border-gold/30 hover:text-off-white disabled:opacity-40 transition-all"
                    >
                      <CheckSquare size={11} />
                      {t('superAdmin.featureFlags.bulkAll')}
                    </button>
                    <button
                      onClick={() => handleBulkCategory(category, categoryFlags, false)}
                      disabled={isSaving || noneActive}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted border border-dark-border hover:border-red-400/30 hover:text-red-400 disabled:opacity-40 transition-all"
                    >
                      <Square size={11} />
                      {t('superAdmin.featureFlags.bulkNone')}
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="divide-y divide-dark-border">
                {categoryFlags.map(flag => {
                  const enabled   = flags.includes(flag.id)
                  const deviation = pkgDefaults ? flagDeviation(flag.id, enabled, pkgDefaults) : null
                  return (
                    <div key={flag.id} className="flex items-center justify-between py-3 group gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-off-white">{flag.label}</p>
                          {pkgDefaults?.includes(flag.id) && (
                            <span className="text-[10px] text-gold border border-gold/30 rounded px-1.5 py-0.5">
                              {t('superAdmin.featureFlags.defaultLabel')}
                            </span>
                          )}
                          {deviation === 'bonus' && (
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 border border-emerald-400/30 bg-emerald-400/10 rounded px-1.5 py-0.5">
                              <Sparkles size={8} />
                              {t('superAdmin.featureFlags.bonusBadge')}
                            </span>
                          )}
                          {deviation === 'missing' && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded px-1.5 py-0.5">
                              <AlertTriangle size={8} />
                              {t('superAdmin.featureFlags.missingBadge')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">{flag.description}</p>
                      </div>
                      <button
                        onClick={() => !isSaving && handleToggle(flag.id, flag.label)}
                        disabled={isSaving || !effectiveTenantId}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0
                          ${enabled ? 'bg-gold' : 'bg-dark-border'} disabled:opacity-50`}
                        role="switch"
                        aria-checked={enabled}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                          ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                  )
                })}
              </CardBody>
            </Card>
          </motion.div>
        )
      })}

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => { await confirmAction.run(); setConfirmAction(null) }}
        title={confirmAction?.title}
        description={confirmAction?.description}
        confirmText={t('superAdmin.featureFlags.confirmYes')}
        cancelText={t('superAdmin.featureFlags.confirmNo')}
        variant="danger"
      />
    </div>
  )
}

// Panel audit drift — bandingkan TenantFeatureFlag vs Package.features (DB).
// Tampil hanya jika ada drift agar tidak ribet saat semuanya sehat.
function AuditPanel({ audit, loading, onRefresh, onSyncOne, onSyncAll, onPickTenant, syncingId, syncingAll }) {
  const [open, setOpen] = useState(true)
  if (loading) {
    return (
      <Card className="p-3 flex items-center gap-2 text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> Memuat audit fitur tenant…
      </Card>
    )
  }
  if (!audit) return null
  const { driftCount = 0, totalActive = 0, rows = [] } = audit
  const allGood = driftCount === 0

  return (
    <Card className={`p-0 overflow-hidden border ${allGood ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-amber-500/30 bg-amber-500/[0.04]'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-dark-card/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {allGood
            ? <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            : <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold text-off-white text-sm">
              {allGood
                ? 'Fitur semua tenant sesuai paketnya'
                : `${driftCount} tenant fiturnya TIDAK sesuai paket`}
            </p>
            <p className="text-[11px] text-muted">
              {totalActive} tenant aktif diperiksa terhadap Package.features di /super-admin/packages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRefresh() }}
            className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-card"
            aria-label="Refresh audit"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <ChevronDown className={`w-4 h-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && !allGood && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-2 border-t border-dark-border/60 pt-3">
              <div className="flex items-center justify-end mb-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={syncingAll ? Loader2 : ShieldCheck}
                  onClick={onSyncAll}
                  disabled={syncingAll}
                >
                  Sinkronkan Semua ({driftCount})
                </Button>
              </div>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                {rows.map((r) => (
                  <div key={r.tenantId} className="rounded-lg border border-dark-border bg-dark-card/40 p-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onPickTenant(r.tenantId)}
                        className="text-left flex items-center gap-2 min-w-0 hover:text-gold transition-colors"
                      >
                        <PackageIcon className="w-3.5 h-3.5 text-gold shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-off-white truncate">{r.name}</p>
                          <p className="text-[10px] text-muted truncate">
                            {r.slug} · paket {r.package} · {r.status}{r.isSuspended ? ' · suspend' : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted shrink-0" />
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={syncingId === r.tenantId ? Loader2 : ShieldCheck}
                        onClick={() => onSyncOne(r.tenantId)}
                        disabled={!!syncingId}
                      >
                        Sync
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {r.missing.map((f) => (
                        <span key={`m-${f}`} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          tidak ada: {f}
                        </span>
                      ))}
                      {r.extra.map((f) => (
                        <span key={`e-${f}`} className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          ekstra: {f}
                        </span>
                      ))}
                      {r.orphans.map((o) => (
                        <span key={`o-${o.flagId}`} className="px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
                          tak dikenal: {o.flagId}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function KpiCard({ label, value, color, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Flag size={14} className={color} />
        </div>
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      </Card>
    </motion.div>
  )
}

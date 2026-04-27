import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flag, RotateCcw, Loader2, Search, CheckSquare, Square,
  Copy, ChevronDown, AlertTriangle, Sparkles, X,
} from 'lucide-react'
import { useTenants } from '../../hooks/useTenants.js'
import { useFeatureFlags, useUpdateFeatureFlags } from '../../hooks/useFeatureFlags.js'
import { ALL_FEATURE_FLAGS, PACKAGE_FLAG_DEFAULTS } from '../../store/featureFlagStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
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
  if (enabled && !inDefault) return 'bonus'   // aktif tapi bukan default paket
  if (!enabled && inDefault) return 'missing' // harusnya aktif tapi dimatikan
  return null
}

// ── Copy from tenant dropdown ─────────────────────────────────────────────────
function CopyFromMenu({ tenants, currentTenantId, tenantFlagsCache, onCopy }) {
  const [open, setOpen] = useState(false)
  const others = tenants.filter(t => t.id !== currentTenantId)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dark-border text-xs text-muted hover:border-gold/30 hover:text-off-white transition-all"
      >
        <Copy size={12} />
        Salin dari…
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] bg-dark-card border border-dark-border rounded-xl shadow-xl overflow-hidden"
          >
            {others.length === 0 && (
              <p className="text-xs text-muted px-3 py-2.5">Tidak ada tenant lain</p>
            )}
            {others.map(t => (
              <button
                key={t.id}
                onClick={() => { onCopy(t); setOpen(false) }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-off-white hover:bg-dark-surface transition-colors text-left"
              >
                <span className="truncate">{t.name}</span>
                {t.package && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0 ${PACKAGE_COLORS[t.package] || 'text-muted border-dark-border'}`}>
                    {t.package}
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SAFeatureFlagsPage() {
  const { t } = useTranslation()
  const { data: tenants = [], isLoading: loadingTenants } = useTenants({ limit: 100 })
  const [selectedTenantId, setSelectedTenantId] = useState(null)
  const [searchQuery, setSearchQuery]           = useState('')
  const toast = useToast()

  const effectiveTenantId = selectedTenantId || tenants[0]?.id || null

  const { data: flags = [], isLoading: loadingFlags } = useFeatureFlags(effectiveTenantId)
  const updateFlags = useUpdateFeatureFlags()

  const selectedTenant  = tenants.find(t => t.id === effectiveTenantId)
  const pkgDefaults     = selectedTenant?.package ? (PACKAGE_FLAG_DEFAULTS[selectedTenant.package] || []) : null
  const isSaving        = updateFlags.isPending

  // ── Search filter ──────────────────────────────────────────────────────────
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

  // ── Deviation stats ────────────────────────────────────────────────────────
  const deviationStats = useMemo(() => {
    if (!pkgDefaults) return { bonus: 0, missing: 0, custom: 0 }
    const bonus   = flags.filter(f => !pkgDefaults.includes(f)).length
    const missing = pkgDefaults.filter(f => !flags.includes(f)).length
    return { bonus, missing, custom: bonus + missing }
  }, [flags, pkgDefaults])

  // ── Mutation helpers ───────────────────────────────────────────────────────
  const save = (newFlags, successMsg) =>
    updateFlags.mutate(
      { tenantId: effectiveTenantId, flags: newFlags },
      {
        onSuccess: () => toast.info(successMsg),
        onError:   () => toast.error('Gagal menyimpan perubahan'),
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

  const handleReset = () => {
    const pkg      = selectedTenant?.package
    const defaults = pkg ? (PACKAGE_FLAG_DEFAULTS[pkg] || []) : []
    updateFlags.mutate(
      { tenantId: effectiveTenantId, flags: defaults },
      {
        onSuccess: () => toast.success(t('superAdmin.featureFlags.toastReset', { pkg: pkg || '—' })),
        onError:   () => toast.error('Gagal reset fitur'),
      }
    )
  }

  const handleBulkCategory = (categoryFlags, enableAll) => {
    const categoryIds = categoryFlags.map(f => f.id)
    let newFlags
    if (enableAll) {
      newFlags = [...new Set([...flags, ...categoryIds])]
    } else {
      newFlags = flags.filter(f => !categoryIds.includes(f))
    }
    save(newFlags, enableAll ? 'Semua fitur kategori diaktifkan' : 'Semua fitur kategori dinonaktifkan')
  }

  const handleCopyFrom = (sourceTenant) => {
    api.get(`/feature-flags/${sourceTenant.id}`)
      .then(res => {
        const data = res.data.data || []
        const sourceFlags = typeof data[0] === 'string'
          ? data
          : data.filter(f => f.enabled).map(f => f.id)
        save(sourceFlags, `Konfigurasi disalin dari ${sourceTenant.name}`)
      })
      .catch(() => toast.error('Gagal mengambil konfigurasi sumber'))
  }

  // ── Mini flag count per tenant ─────────────────────────────────────────────
  // We only have live count for the currently-selected tenant; for others we show
  // their package default count as a proxy.
  function tenantFlagHint(tenant) {
    if (tenant.id === effectiveTenantId) return `${flags.length}/${ALL_FEATURE_FLAGS.length}`
    const pkg = tenant.package
    if (!pkg || !PACKAGE_FLAG_DEFAULTS[pkg]) return null
    return `${PACKAGE_FLAG_DEFAULTS[pkg].length}/${ALL_FEATURE_FLAGS.length}`
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadingTenants) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 bg-dark-card animate-pulse rounded-lg" />
        <div className="h-20 bg-dark-card animate-pulse rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.featureFlags.pageTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('superAdmin.featureFlags.pageSubtitle')}</p>
      </div>

      {/* Tenant Selector */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {tenants.map(tenant => {
            const hint     = tenantFlagHint(tenant)
            const isActive = effectiveTenantId === tenant.id
            return (
              <button
                key={tenant.id}
                onClick={() => setSelectedTenantId(tenant.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm transition-all ${isActive ? 'border-gold bg-gold/10 text-off-white' : 'border-dark-border text-muted hover:border-gold/30'}`}
              >
                <span>{tenant.name}</span>
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
        </div>
      </Card>

      {/* Selected Tenant Info + Actions */}
      {effectiveTenantId && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: summary */}
          <div>
            <h2 className="text-lg font-semibold text-off-white">{selectedTenant?.name}</h2>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-sm text-muted">
                {loadingFlags ? 'Memuat…' : `${flags.length} dari ${ALL_FEATURE_FLAGS.length} fitur aktif`}
                {selectedTenant?.package && (
                  <span className="ml-1.5 text-muted/70">· paket {selectedTenant.package}</span>
                )}
              </p>
              {!loadingFlags && deviationStats.custom > 0 && (
                <div className="flex items-center gap-2">
                  {deviationStats.bonus > 0 && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
                      <Sparkles size={10} />
                      +{deviationStats.bonus} bonus
                    </span>
                  )}
                  {deviationStats.missing > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={10} />
                      {deviationStats.missing} kurang
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <CopyFromMenu
              tenants={tenants}
              currentTenantId={effectiveTenantId}
              onCopy={handleCopyFrom}
            />
            <Button
              variant="secondary"
              icon={isSaving ? Loader2 : RotateCcw}
              size="sm"
              onClick={handleReset}
              disabled={isSaving || loadingFlags || !selectedTenant?.package}
            >
              Reset ke Default
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
          placeholder="Cari fitur…"
          className="w-full bg-dark-card border border-dark-border rounded-xl pl-9 pr-9 py-2.5 text-sm text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40 transition-colors"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white">
            <X size={14} />
          </button>
        )}
      </div>

      {/* No results */}
      {filteredFlags.length === 0 && (
        <div className="text-center py-12 text-muted text-sm">
          Tidak ada fitur yang cocok dengan pencarian "{searchQuery}"
        </div>
      )}

      {/* Feature Flags by Category */}
      {loadingFlags ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-dark-card animate-pulse rounded-2xl" />)}
        </div>
      ) : Object.entries(groupedFlags).map(([category, categoryFlags]) => {
        const activeInCat  = categoryFlags.filter(f => flags.includes(f.id)).length
        const allActive    = activeInCat === categoryFlags.length
        const noneActive   = activeInCat === 0

        return (
          <motion.div key={category} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flag size={15} className={CATEGORY_COLORS[category] || 'text-muted'} />
                    <h3 className="font-semibold text-off-white">{category}</h3>
                    <span className="text-xs text-muted ml-1">
                      {activeInCat}/{categoryFlags.length} aktif
                    </span>
                  </div>
                  {/* Bulk actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleBulkCategory(categoryFlags, true)}
                      disabled={isSaving || allActive}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted border border-dark-border hover:border-gold/30 hover:text-off-white disabled:opacity-40 transition-all"
                    >
                      <CheckSquare size={11} />
                      Semua
                    </button>
                    <button
                      onClick={() => handleBulkCategory(categoryFlags, false)}
                      disabled={isSaving || noneActive}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] text-muted border border-dark-border hover:border-red-400/30 hover:text-red-400 disabled:opacity-40 transition-all"
                    >
                      <Square size={11} />
                      Kosong
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardBody className="divide-y divide-dark-border">
                {categoryFlags.map(flag => {
                  const enabled   = flags.includes(flag.id)
                  const deviation = pkgDefaults ? flagDeviation(flag.id, enabled, pkgDefaults) : null

                  return (
                    <div key={flag.id} className="flex items-center justify-between py-3 group">
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-off-white">{flag.label}</p>
                          {/* Default paket badge */}
                          {pkgDefaults?.includes(flag.id) && (
                            <span className="text-[10px] text-gold border border-gold/30 rounded px-1.5 py-0.5">
                              {t('superAdmin.featureFlags.defaultLabel')}
                            </span>
                          )}
                          {/* Deviation badges */}
                          {deviation === 'bonus' && (
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 border border-emerald-400/30 bg-emerald-400/10 rounded px-1.5 py-0.5">
                              <Sparkles size={8} />
                              Bonus
                            </span>
                          )}
                          {deviation === 'missing' && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded px-1.5 py-0.5">
                              <AlertTriangle size={8} />
                              Kurang dari paket
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
    </div>
  )
}

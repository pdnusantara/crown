import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Activity, Info, AlertTriangle, XCircle, CheckCircle, Filter, Download } from 'lucide-react'
import { usePlatformAuditStore } from '../../store/platformAuditStore.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'

const SEVERITY_CONFIG = {
  info:    { icon: Info,          color: 'text-blue-400',  bg: 'bg-blue-400/10',  border: 'border-blue-400/20'  },
  warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  error:   { icon: XCircle,       color: 'text-red-400',   bg: 'bg-red-400/10',   border: 'border-red-400/20'   },
  success: { icon: CheckCircle,   color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
}

const ACTION_KEYS = {
  TENANT_CREATED:       'actionTenantCreated',
  TENANT_SUSPENDED:     'actionTenantSuspended',
  TENANT_ACTIVATED:     'actionTenantActivated',
  PACKAGE_CHANGED:      'actionPackageChanged',
  BROADCAST_SENT:       'actionBroadcastSent',
  SUBSCRIPTION_OVERDUE: 'actionSubscriptionOverdue',
  TICKET_REPLIED:       'actionTicketReplied',
  FLAG_TOGGLED:         'actionFlagToggled',
  LOGIN:                'actionLogin',
  IMPERSONATE:          'actionImpersonate',
}

const PAGE_SIZE = 15

export default function SAActivityLogPage() {
  const { t } = useTranslation()
  const { logs } = usePlatformAuditStore()

  const severityLabel = (key) => {
    if (key === 'info')    return t('superAdmin.activityLog.sevInfo')
    if (key === 'warning') return t('superAdmin.activityLog.sevWarning')
    if (key === 'error')   return t('superAdmin.activityLog.sevError')
    if (key === 'success') return t('superAdmin.activityLog.sevSuccess')
    return key
  }
  const actionLabel = (code) => ACTION_KEYS[code] ? t(`superAdmin.activityLog.${ACTION_KEYS[code]}`) : code

  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterAction, setFilterAction]     = useState('')
  const [filterActor, setFilterActor]       = useState('')
  const [page, setPage]                     = useState(1)

  const filtered = useMemo(() => {
    let result = [...logs]
    if (filterSeverity) result = result.filter(l => l.severity === filterSeverity)
    if (filterAction)   result = result.filter(l => l.action === filterAction)
    if (filterActor)    result = result.filter(l => l.actor.toLowerCase().includes(filterActor.toLowerCase()))
    return result
  }, [logs, filterSeverity, filterAction, filterActor])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const uniqueActions = [...new Set(logs.map(l => l.action))]

  const handleExport = () => {
    const rows = ['Timestamp,Actor,Action,Target,Detail,Severity', ...filtered.map(l =>
      `"${l.timestamp}","${l.actor}","${l.action}","${l.target}","${l.detail}","${l.severity}"`
    )]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const resetFilters = () => {
    setFilterSeverity('')
    setFilterAction('')
    setFilterActor('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.activityLog.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.activityLog.pageSubtitle')}</p>
        </div>
        <Button variant="secondary" icon={Download} size="sm" onClick={handleExport}>
          {t('superAdmin.activityLog.exportCsv')}
        </Button>
      </div>

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => {
          const count = logs.filter(l => l.severity === key).length
          return (
            <button
              key={key}
              onClick={() => { setFilterSeverity(filterSeverity === key ? '' : key); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${filterSeverity === key ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-dark-border text-muted hover:border-gold/30'}`}
            >
              <cfg.icon size={12} />
              {t('superAdmin.activityLog.chipCount', { label: severityLabel(key), count })}
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-muted mb-1">{t('superAdmin.activityLog.filterAction')}</label>
            <select
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(1) }}
              className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
            >
              <option value="">{t('superAdmin.activityLog.filterAllAction')}</option>
              {uniqueActions.map(a => (
                <option key={a} value={a}>{actionLabel(a)}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-muted mb-1">{t('superAdmin.activityLog.filterActor')}</label>
            <input
              value={filterActor}
              onChange={e => { setFilterActor(e.target.value); setPage(1) }}
              placeholder={t('superAdmin.activityLog.filterActorPlaceholder')}
              className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm placeholder-muted focus:outline-none focus:border-gold/50"
            />
          </div>
          {(filterSeverity || filterAction || filterActor) && (
            <Button variant="secondary" size="sm" icon={Filter} onClick={resetFilters}>
              {t('superAdmin.activityLog.resetFilter')}
            </Button>
          )}
        </div>
      </Card>

      {/* Log Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white">{t('superAdmin.activityLog.logTitle')}</h3>
            </div>
            <span className="text-xs text-muted">{t('superAdmin.activityLog.entriesCount', { count: filtered.length })}</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border text-xs text-muted uppercase">
                <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colTime')}</th>
                <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colSeverity')}</th>
                <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colActor')}</th>
                <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colAction')}</th>
                <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colTarget')}</th>
                <th className="px-4 py-3 text-left">{t('superAdmin.activityLog.colDetail')}</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((log, i) => {
                const sev = SEVERITY_CONFIG[log.severity] || SEVERITY_CONFIG.info
                const Icon = sev.icon
                return (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-dark-border/40 hover:bg-dark-surface/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{log.timestamp}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sev.bg} ${sev.border} ${sev.color}`}>
                        <Icon size={10} />
                        {severityLabel(log.severity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-off-white font-medium">{log.actor}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-lg">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-off-white">{log.target}</td>
                    <td className="px-4 py-3 text-muted text-xs max-w-[220px] truncate" title={log.detail}>{log.detail}</td>
                  </motion.tr>
                )
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-muted text-sm">
                    {t('superAdmin.activityLog.noLogs')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
            <span className="text-xs text-muted">
              {t('superAdmin.activityLog.pageInfo', { page, total: totalPages })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-dark-border text-muted disabled:opacity-40 hover:border-gold/30 transition-colors"
              >
                {t('superAdmin.activityLog.prev')}
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-dark-border text-muted disabled:opacity-40 hover:border-gold/30 transition-colors"
              >
                {t('superAdmin.activityLog.next')}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

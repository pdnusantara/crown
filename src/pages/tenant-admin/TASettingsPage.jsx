import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { useAuditStore } from '../../store/auditStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { Settings, Bell, Shield, Palette, Download, Upload, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const ACTION_COLORS = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'error',
}

function getActionColor(action) {
  for (const [prefix, color] of Object.entries(ACTION_COLORS)) {
    if (action.startsWith(prefix)) return color
  }
  return 'muted'
}

export default function TASettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { getTenantById, updateTenant, getBranchesByTenant, getServicesByTenant, getStaffByTenant, getCustomersByTenant, getProductsByTenant } = useTenantStore()
  const { getLogs } = useAuditStore()
  const toast = useToast()
  const fileInputRef = useRef(null)

  const tenant = getTenantById(user.tenantId)
  const [form, setForm] = useState({
    name: tenant?.name || '',
    ownerEmail: tenant?.ownerEmail || '',
    openTime: '09:00',
    closeTime: '21:00',
    taxRate: 10,
    currency: 'IDR',
  })
  const [notifications, setNotifications] = useState({ newBooking: true, queueFull: true, dailyReport: false })
  const [activeTab, setActiveTab] = useState('general')
  const [importData, setImportData] = useState(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [auditFilter, setAuditFilter] = useState({ action: '', search: '' })

  const handleSave = () => {
    updateTenant(user.tenantId, { name: form.name, ownerEmail: form.ownerEmail })
    toast.success(t('tenantAdmin.settings.settingsSaved'))
  }

  const handleExport = () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tenant: user.tenantId,
      branches: getBranchesByTenant(user.tenantId),
      services: getServicesByTenant(user.tenantId),
      staff: getStaffByTenant(user.tenantId),
      customers: getCustomersByTenant(user.tenantId),
      products: getProductsByTenant(user.tenantId),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `barberos-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('tenantAdmin.settings.backupDownloaded'))
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (!data.version || !data.tenant) throw new Error(t('tenantAdmin.settings.invalidFormat'))
        setImportData(data)
        setShowImportConfirm(true)
      } catch (err) {
        toast.error(t('tenantAdmin.settings.invalidBackupFile', { message: err.message }))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const auditLogs = getLogs(user.tenantId, 100).filter(l => {
    const matchAction = !auditFilter.action || l.action.startsWith(auditFilter.action)
    const matchSearch = !auditFilter.search || l.userName.toLowerCase().includes(auditFilter.search.toLowerCase()) || l.details.toLowerCase().includes(auditFilter.search.toLowerCase())
    return matchAction && matchSearch
  })

  const exportAuditCSV = () => {
    const header = `${t('tenantAdmin.settings.colTime')},${t('tenantAdmin.settings.colUser')},${t('tenantAdmin.settings.colAction')},${t('tenantAdmin.settings.colDetail')}\n`
    const rows = auditLogs.map(l => `"${l.timestamp}","${l.userName}","${l.action}","${l.details}"`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const TABS = [
    { id: 'general', label: t('tenantAdmin.settings.tabGeneral') },
    { id: 'backup', label: t('tenantAdmin.settings.tabBackup') },
    { id: 'audit', label: t('tenantAdmin.settings.tabAudit') },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.settings.title')}</h1>
        <p className="text-muted text-sm mt-1">{t('tenantAdmin.settings.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-card border border-dark-border rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.businessInfo')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input label={t('tenantAdmin.settings.tenantName')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input label={t('tenantAdmin.settings.ownerEmail')} type="email" value={form.ownerEmail} onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('tenantAdmin.settings.defaultOpenTime')} type="time" value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} />
                <Input label={t('tenantAdmin.settings.defaultCloseTime')} type="time" value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} />
              </div>
              <Input label={t('tenantAdmin.settings.taxPercent')} type="number" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))} />
              <Button onClick={handleSave} fullWidth>{t('tenantAdmin.settings.saveSettings')}</Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.notifications')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {[
                { key: 'newBooking', label: t('tenantAdmin.settings.notifNewBookingLabel'), desc: t('tenantAdmin.settings.notifNewBookingDesc') },
                { key: 'queueFull', label: t('tenantAdmin.settings.notifQueueFullLabel'), desc: t('tenantAdmin.settings.notifQueueFullDesc') },
                { key: 'dailyReport', label: t('tenantAdmin.settings.notifDailyReportLabel'), desc: t('tenantAdmin.settings.notifDailyReportDesc') },
              ].map(n => (
                <div key={n.key} className="flex items-center justify-between p-3 bg-dark-surface rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-off-white">{n.label}</p>
                    <p className="text-xs text-muted">{n.desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key] }))}
                    className={`w-11 h-6 rounded-full transition-colors relative ${notifications[n.key] ? 'bg-gold' : 'bg-dark-border'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${notifications[n.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.security')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input label={t('tenantAdmin.settings.currentPassword')} type="password" placeholder="••••••••" />
              <Input label={t('tenantAdmin.settings.newPassword')} type="password" placeholder="••••••••" />
              <Input label={t('tenantAdmin.settings.confirmPassword')} type="password" placeholder="••••••••" />
              <Button variant="secondary" fullWidth onClick={() => toast.info(t('tenantAdmin.settings.featureInDevelopment'))}>{t('tenantAdmin.settings.changePassword')}</Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.subscriptionPlan')}</h3>
              </div>
            </CardHeader>
            <CardBody>
              <div className="p-4 bg-gold/10 border border-gold/20 rounded-xl mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gold">{t('tenantAdmin.settings.packageName', { name: tenant?.package || 'Pro' })}</p>
                    <p className="text-sm text-muted mt-1">{t('tenantAdmin.settings.activeUntilDate')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-off-white">Rp 499K</p>
                    <p className="text-xs text-muted">{t('tenantAdmin.settings.perMonth')}</p>
                  </div>
                </div>
              </div>
              <Button variant="secondary" fullWidth onClick={() => toast.info(t('tenantAdmin.settings.contactUpgrade'))}>
                {t('tenantAdmin.settings.upgradePlan')}
              </Button>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.exportData')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-muted">{t('tenantAdmin.settings.exportDataDesc')}</p>
              <div className="space-y-2 text-xs text-muted">
                <p>{t('tenantAdmin.settings.branchCountLine', { count: getBranchesByTenant(user.tenantId).length })}</p>
                <p>{t('tenantAdmin.settings.serviceCountLine', { count: getServicesByTenant(user.tenantId).length })}</p>
                <p>{t('tenantAdmin.settings.staffCountLine', { count: getStaffByTenant(user.tenantId).length })}</p>
                <p>{t('tenantAdmin.settings.customerCountLine', { count: getCustomersByTenant(user.tenantId).length })}</p>
              </div>
              <Button icon={Download} fullWidth onClick={handleExport}>{t('tenantAdmin.settings.downloadBackup')}</Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.importData')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-muted">{t('tenantAdmin.settings.importDataDesc')}</p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-dark-border rounded-xl p-8 text-center cursor-pointer hover:border-gold/40 hover:bg-gold/5 transition-all"
              >
                <Upload className="w-8 h-8 text-muted mx-auto mb-2" />
                <p className="text-sm text-muted">{t('tenantAdmin.settings.clickToSelectBackup')}</p>
                <p className="text-xs text-muted/60 mt-1">{t('tenantAdmin.settings.formatJson')}</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            <input
              value={auditFilter.search}
              onChange={e => setAuditFilter(f => ({ ...f, search: e.target.value }))}
              placeholder={t('tenantAdmin.settings.searchUserDetailPlaceholder')}
              className="flex-1 min-w-[200px] bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60"
            />
            <select value={auditFilter.action} onChange={e => setAuditFilter(f => ({ ...f, action: e.target.value }))} className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2 text-sm outline-none focus:border-gold/60">
              <option value="">{t('tenantAdmin.settings.allActions')}</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
            <Button variant="secondary" icon={Download} onClick={exportAuditCSV}>{t('tenantAdmin.settings.exportCsv')}</Button>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colTime')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colUser')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colAction')}</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colDetail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id} className="border-b border-dark-border/50 hover:bg-dark-surface/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        <div>{format(new Date(log.timestamp), 'dd/MM HH:mm')}</div>
                        <div className="text-muted/60">{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true, locale: idLocale })}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-off-white">{log.userName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={getActionColor(log.action)} className="text-xs">{log.action}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted max-w-xs truncate">{log.details}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-muted">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>{t('tenantAdmin.settings.noAuditLogs')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Import Confirm Modal */}
      <Modal isOpen={showImportConfirm} onClose={() => setShowImportConfirm(false)} title={t('tenantAdmin.settings.confirmImport')}>
        {importData && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-sm text-amber-400 font-medium mb-2">{t('tenantAdmin.settings.warning')}</p>
              <p className="text-xs text-amber-300/80">{t('tenantAdmin.settings.importWarningDesc')}</p>
            </div>
            <div className="space-y-2 text-sm text-muted">
              <p>{t('tenantAdmin.settings.importFromPrefix')} <span className="text-off-white">{importData.tenant}</span>:</p>
              <p>{t('tenantAdmin.settings.branchCountLine', { count: importData.branches?.length || 0 })}</p>
              <p>{t('tenantAdmin.settings.serviceCountLine', { count: importData.services?.length || 0 })}</p>
              <p>{t('tenantAdmin.settings.staffCountLineShort', { count: importData.staff?.length || 0 })}</p>
              <p>{t('tenantAdmin.settings.customerCountLine', { count: importData.customers?.length || 0 })}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" fullWidth onClick={() => setShowImportConfirm(false)}>{t('tenantAdmin.settings.cancel')}</Button>
              <Button variant="danger" fullWidth onClick={() => {
                toast.info(t('tenantAdmin.settings.importSuccessSim'))
                setShowImportConfirm(false)
              }}>{t('tenantAdmin.settings.importData')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

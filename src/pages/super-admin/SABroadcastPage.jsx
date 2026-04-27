import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Megaphone, Send, Trash2, Eye, EyeOff, Users, User, Info, AlertTriangle, XCircle, CheckCircle } from 'lucide-react'
import { useAllBroadcasts, useCreateBroadcast } from '../../hooks/useBroadcasts.js'
import { useTenants } from '../../hooks/useTenants.js'
import { useBroadcastStore } from '../../store/broadcastStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'

const TYPE_CONFIG = {
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20' },
  error:   { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20' },
  success: { icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20' },
}

export default function SABroadcastPage() {
  const { t } = useTranslation()
  const typeLabel = (key) => {
    if (key === 'info')    return t('superAdmin.broadcast.typeInfo')
    if (key === 'warning') return t('superAdmin.broadcast.typeWarning')
    if (key === 'error')   return t('superAdmin.broadcast.typeError')
    if (key === 'success') return t('superAdmin.broadcast.typeSuccess')
    return key
  }
  const { data: broadcasts = [] } = useAllBroadcasts()
  const createBroadcast = useCreateBroadcast()
  const { data: tenants = [] } = useTenants()
  const { deleteBroadcast, deactivateBroadcast } = useBroadcastStore()
  const toast = useToast()

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', type: 'info', targetTenants: 'all' })
  const [selectedTenants, setSelectedTenants] = useState([])
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) return toast.error(t('superAdmin.broadcast.toastRequired'))
    setSending(true)
    try {
      await createBroadcast.mutateAsync({
        ...form,
        targetTenants: form.targetTenants === 'all' ? 'all' : selectedTenants,
      })
      toast.success(t('superAdmin.broadcast.toastSuccess'))
      setShowModal(false)
      setForm({ title: '', message: '', type: 'info', targetTenants: 'all' })
      setSelectedTenants([])
    } catch (err) {
      toast.error(err?.response?.data?.message || t('superAdmin.broadcast.toastFailed'))
    } finally {
      setSending(false)
    }
  }

  const toggleTenant = (id) => {
    setSelectedTenants(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.broadcast.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.broadcast.pageSubtitle')}</p>
        </div>
        <Button icon={Send} onClick={() => setShowModal(true)}>{t('superAdmin.broadcast.send')}</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('superAdmin.broadcast.totalBroadcast'), value: broadcasts.length },
          { label: t('superAdmin.broadcast.activeCount'),   value: broadcasts.filter(b => b.active).length },
          { label: t('superAdmin.broadcast.inactiveCount'), value: broadcasts.filter(b => !b.active).length },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-off-white">{s.value}</p>
              <p className="text-xs text-muted mt-1">{s.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Broadcast List */}
      <div className="space-y-3">
        {broadcasts.length === 0 && (
          <div className="text-center py-16 text-muted">
            <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
            <p>{t('superAdmin.broadcast.empty')}</p>
          </div>
        )}
        {broadcasts.map((bc, i) => {
          const cfg = TYPE_CONFIG[bc.type] || TYPE_CONFIG.info
          const Icon = cfg.icon
          const readCount = Array.isArray(bc.read) ? bc.read.length : 0
          const totalTarget = bc.targetTenants === 'all' ? tenants.length : (Array.isArray(bc.targetTenants) ? bc.targetTenants.length : 0)
          return (
            <motion.div key={bc.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className={`p-4 border ${bc.active ? '' : 'opacity-50'}`}>
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
                    <Icon size={18} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-off-white">{bc.title}</h3>
                        <p className="text-sm text-muted mt-0.5 line-clamp-2">{bc.message}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={bc.active ? 'success' : 'muted'}>{bc.active ? t('superAdmin.broadcast.badgeActive') : t('superAdmin.broadcast.badgeInactive')}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                      <span>{bc.sentAt}</span>
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {bc.targetTenants === 'all' ? t('superAdmin.broadcast.allTenants') : t('superAdmin.broadcast.tenantCount', { count: totalTarget })}
                      </span>
                      <span className="flex items-center gap-1 text-green-400">
                        <Eye size={11} />
                        {t('superAdmin.broadcast.readCount', { read: readCount, total: totalTarget })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {bc.active && (
                      <button onClick={() => { deactivateBroadcast(bc.id); toast.info(t('superAdmin.broadcast.deactivatedToast')) }}
                        className="p-2 rounded-lg text-muted hover:text-amber-400 transition-colors" title={t('superAdmin.broadcast.deactivateTooltip')}>
                        <EyeOff size={15} />
                      </button>
                    )}
                    <button onClick={() => { deleteBroadcast(bc.id); toast.success(t('superAdmin.broadcast.deletedToast')) }}
                      className="p-2 rounded-lg text-muted hover:text-red-400 transition-colors" title={t('superAdmin.broadcast.deleteTooltip')}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )
        })}
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
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button key={key} onClick={() => setForm(f => ({ ...f, type: key }))}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm transition-all ${form.type === key ? 'border-gold bg-gold/10 text-off-white' : 'border-dark-border text-muted hover:border-gold/30'}`}>
                    <Icon size={14} className={cfg.color} />
                    {typeLabel(key)}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5">{t('superAdmin.broadcast.targetLabel')}</label>
            <div className="flex gap-2 mb-2">
              <button onClick={() => setForm(f => ({ ...f, targetTenants: 'all' }))}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm transition-all ${form.targetTenants === 'all' ? 'border-gold bg-gold/10 text-gold' : 'border-dark-border text-muted'}`}>
                <Users size={14} />{t('superAdmin.broadcast.targetAll')}
              </button>
              <button onClick={() => setForm(f => ({ ...f, targetTenants: 'specific' }))}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm transition-all ${form.targetTenants === 'specific' ? 'border-gold bg-gold/10 text-gold' : 'border-dark-border text-muted'}`}>
                <User size={14} />{t('superAdmin.broadcast.targetSpecific')}
              </button>
            </div>
            {form.targetTenants === 'specific' && (
              <div className="space-y-2">
                {tenants.map(t => (
                  <label key={t.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${selectedTenants.includes(t.id) ? 'border-gold bg-gold/5' : 'border-dark-border hover:border-gold/30'}`}>
                    <input type="checkbox" checked={selectedTenants.includes(t.id)} onChange={() => toggleTenant(t.id)} className="accent-gold" />
                    <span className="text-sm text-off-white">{t.name}</span>
                    <Badge variant={t.status === 'active' ? 'success' : 'danger'} className="ml-auto">{t.package}</Badge>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setShowModal(false)}>{t('superAdmin.broadcast.cancel')}</Button>
            <Button fullWidth icon={Send} onClick={handleSend} disabled={sending}>
              {sending ? t('superAdmin.broadcast.sending') : t('superAdmin.broadcast.sendNow')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

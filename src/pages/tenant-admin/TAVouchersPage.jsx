import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Copy, Check, Trash2, Tag, ToggleLeft, ToggleRight } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useVoucherStore } from '../../store/voucherStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import { formatRupiah } from '../../utils/format.js'
import { format } from 'date-fns'

export default function TAVouchersPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { getVouchersByTenant, addVoucher, updateVoucher, deleteVoucher } = useVoucherStore()
  const toast = useToast()
  const [showModal, setShowModal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [form, setForm] = useState({
    code: '', type: 'percentage', value: '', minOrder: '', maxUses: '', expiresAt: '', description: ''
  })

  const vouchers = getVouchersByTenant(user.tenantId)

  const handleCopy = (code, id) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id)
      toast.success(t('tenantAdmin.vouchers.codeCopied', { code }))
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const handleToggle = (id, currentActive) => {
    updateVoucher(id, { active: !currentActive })
    toast.success(currentActive ? t('tenantAdmin.vouchers.voucherDeactivated') : t('tenantAdmin.vouchers.voucherActivated'))
  }

  const handleAdd = () => {
    if (!form.code || !form.value || !form.expiresAt) return toast.error(t('tenantAdmin.vouchers.requiredFields'))
    addVoucher({
      ...form,
      code: form.code.toUpperCase(),
      value: Number(form.value),
      minOrder: Number(form.minOrder) || 0,
      maxUses: Number(form.maxUses) || 100,
      tenantId: user.tenantId,
      active: true,
    })
    toast.success(t('tenantAdmin.vouchers.voucherAdded'))
    setShowModal(false)
    setForm({ code: '', type: 'percentage', value: '', minOrder: '', maxUses: '', expiresAt: '', description: '' })
  }

  const handleDelete = (id) => {
    deleteVoucher(id)
    toast.success(t('tenantAdmin.vouchers.voucherDeleted'))
    setConfirmDelete(null)
  }

  const isExpired = (expiresAt) => new Date(expiresAt) < new Date()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.vouchers.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.vouchers.voucherCountAvailable', { count: vouchers.length })}</p>
        </div>
        <Button icon={Plus} onClick={() => setShowModal(true)}>{t('tenantAdmin.vouchers.addVoucher')}</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('tenantAdmin.vouchers.totalVoucher'), value: vouchers.length, color: 'text-off-white' },
          { label: t('tenantAdmin.vouchers.active'), value: vouchers.filter(v => v.active && !isExpired(v.expiresAt)).length, color: 'text-green-400' },
          { label: t('tenantAdmin.vouchers.inactive'), value: vouchers.filter(v => !v.active).length, color: 'text-muted' },
          { label: t('tenantAdmin.vouchers.expired'), value: vouchers.filter(v => isExpired(v.expiresAt)).length, color: 'text-red-400' },
        ].map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-muted text-sm">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Voucher Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border">
                {[
                  t('tenantAdmin.vouchers.colCode'),
                  t('tenantAdmin.vouchers.colType'),
                  t('tenantAdmin.vouchers.colValue'),
                  t('tenantAdmin.vouchers.colMinOrder'),
                  t('tenantAdmin.vouchers.colUsedMax'),
                  t('tenantAdmin.vouchers.colExpires'),
                  t('tenantAdmin.vouchers.colStatus'),
                  t('tenantAdmin.vouchers.colActions'),
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vouchers.map(v => {
                const expired = isExpired(v.expiresAt)
                const usageRatio = v.maxUses > 0 ? v.usedCount / v.maxUses : 0
                return (
                  <tr key={v.id} className="border-b border-dark-border/50 hover:bg-dark-surface/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-gold">{v.code}</span>
                        <button onClick={() => handleCopy(v.code, v.id)} className="p-1 rounded text-muted hover:text-gold transition-colors">
                          {copiedId === v.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        </button>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{v.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={v.type === 'percentage' ? 'info' : 'gold'}>
                        {v.type === 'percentage' ? t('tenantAdmin.vouchers.typePercent') : t('tenantAdmin.vouchers.typeFlat')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-off-white font-medium">
                      {v.type === 'percentage' ? `${v.value}%` : formatRupiah(v.value)}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatRupiah(v.minOrder)}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className="text-off-white">{v.usedCount}/{v.maxUses}</span>
                        <div className="w-20 h-1.5 bg-dark-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, usageRatio * 100)}%`,
                              backgroundColor: usageRatio > 0.8 ? '#ef4444' : '#C9A84C'
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${expired ? 'text-red-400' : 'text-muted'}`}>
                        {format(new Date(v.expiresAt), 'dd/MM/yyyy')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {expired ? (
                        <Badge variant="error">{t('tenantAdmin.vouchers.expired')}</Badge>
                      ) : (
                        <Badge variant={v.active ? 'success' : 'muted'}>{v.active ? t('tenantAdmin.vouchers.active') : t('tenantAdmin.vouchers.inactive')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleToggle(v.id, v.active)} className={`p-1.5 rounded-lg transition-colors ${v.active ? 'text-green-400 hover:text-green-300' : 'text-muted hover:text-green-400'}`} title={v.active ? t('tenantAdmin.vouchers.deactivate') : t('tenantAdmin.vouchers.activate')}>
                          {v.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button onClick={() => setConfirmDelete(v.id)} className="p-1.5 rounded-lg text-muted hover:text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {vouchers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">
                    <Tag size={32} className="mx-auto mb-3 opacity-30" />
                    <p>{t('tenantAdmin.vouchers.noVouchers')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={t('tenantAdmin.vouchers.addVoucher')}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.vouchers.voucherCode')}</label>
            <input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="HEMAT20"
              className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 font-mono font-bold uppercase tracking-widest"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.vouchers.type')}</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: 'percentage', label: t('tenantAdmin.vouchers.percentOption') }, { value: 'flat', label: t('tenantAdmin.vouchers.nominalOption') }].map(opt => (
                <button key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, type: opt.value }))}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${form.type === opt.value ? 'bg-gold/10 border-gold text-gold' : 'border-dark-border text-muted hover:border-gold/30'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={form.type === 'percentage' ? t('tenantAdmin.vouchers.valuePercent') : t('tenantAdmin.vouchers.valueRupiah')} type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder={form.type === 'percentage' ? '20' : '10000'} />
            <Input label={t('tenantAdmin.vouchers.minOrderRupiah')} type="number" value={form.minOrder} onChange={e => setForm(f => ({ ...f, minOrder: e.target.value }))} placeholder="50000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('tenantAdmin.vouchers.maxUsesLabel')} type="number" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="100" />
            <Input label={t('tenantAdmin.vouchers.expiryLabel')} type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
          </div>
          <Input label={t('tenantAdmin.vouchers.descriptionLabel')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('tenantAdmin.vouchers.descriptionPlaceholder')} />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('tenantAdmin.vouchers.cancel')}</Button>
            <Button fullWidth onClick={handleAdd}>{t('tenantAdmin.vouchers.addVoucher')}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title={t('tenantAdmin.vouchers.deleteVoucher')}>
        <div className="space-y-4">
          <p className="text-muted text-sm">{t('tenantAdmin.vouchers.deleteConfirmDesc')}</p>
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setConfirmDelete(null)}>{t('tenantAdmin.vouchers.cancel')}</Button>
            <Button variant="danger" fullWidth onClick={() => handleDelete(confirmDelete)}>{t('tenantAdmin.vouchers.delete')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

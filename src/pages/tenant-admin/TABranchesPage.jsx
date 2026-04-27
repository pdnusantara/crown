import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit2, Trash2, MapPin, Phone, Clock, Building2, AlertTriangle, Info, GitBranch } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch } from '../../hooks/useBranches.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useSubscription } from '../../hooks/useSubscription.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import { formatRupiah } from '../../utils/format.js'

export default function TABranchesPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const toast = useToast()

  const [showFormModal, setShowFormModal]       = useState(false)
  const [showFeeModal, setShowFeeModal]         = useState(false)
  const [editBranch, setEditBranch]             = useState(null)
  const [pendingForm, setPendingForm]           = useState(null)
  const [form, setForm] = useState({ name: '', address: '', phone: '', openTime: '09:00', closeTime: '21:00' })

  const { data: branches = [], isLoading } = useBranches(user?.tenantId)
  const { data: staff = [] } = useUsers({ tenantId: user?.tenantId })
  const { data: sub } = useSubscription(user?.tenantId)
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const deleteBranch = useDeleteBranch()

  // Derive package info from subscription data
  const pkg = sub?.package ? sub : null
  const maxBranches      = sub?.maxBranches || 1
  const branchAddonPrice = sub?.branchAddonPrice || 0
  const branchAddonType  = sub?.branchAddonType || 'monthly'
  const currentCount     = branches.length
  const withinFreeQuota  = currentCount < maxBranches
  const remaining        = Math.max(0, maxBranches - currentCount)

  const openAdd = () => {
    setEditBranch(null)
    setForm({ name: '', address: '', phone: '', openTime: '09:00', closeTime: '21:00' })
    setShowFormModal(true)
  }

  const openEdit = (branch) => {
    setEditBranch(branch)
    setForm({ name: branch.name, address: branch.address, phone: branch.phone, openTime: branch.openTime, closeTime: branch.closeTime })
    setShowFormModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.address) return toast.error(t('tenantAdmin.branches.nameAddressRequired'))

    if (editBranch) {
      try {
        await updateBranch.mutateAsync({ id: editBranch.id, tenantId: user.tenantId, ...form })
        toast.success(t('tenantAdmin.branches.branchUpdated'))
        setShowFormModal(false)
      } catch {
        toast.error(t('tenantAdmin.branches.updateFailed'))
      }
      return
    }

    // Adding new branch
    if (!withinFreeQuota && branchAddonPrice > 0) {
      setPendingForm({ ...form })
      setShowFormModal(false)
      setShowFeeModal(true)
      return
    }

    if (!withinFreeQuota && branchAddonPrice === 0) {
      toast.error(t('tenantAdmin.branches.quotaReached', { package: sub?.package, max: maxBranches }))
      return
    }

    try {
      await createBranch.mutateAsync({ ...form, tenantId: user.tenantId })
      toast.success(t('tenantAdmin.branches.branchAdded'))
      setShowFormModal(false)
    } catch {
      toast.error(t('tenantAdmin.branches.addFailed'))
    }
  }

  const handleConfirmFee = async () => {
    if (!pendingForm) return
    try {
      await createBranch.mutateAsync({ ...pendingForm, tenantId: user.tenantId })
      toast.success(t('tenantAdmin.branches.branchAddedWithFee', { name: pendingForm.name, fee: formatRupiah(branchAddonPrice) }))
      setShowFeeModal(false)
      setPendingForm(null)
    } catch {
      toast.error(t('tenantAdmin.branches.addFailed'))
    }
  }

  const handleDelete = async (branch) => {
    try {
      await deleteBranch.mutateAsync({ id: branch.id, tenantId: user.tenantId })
      toast.success(t('tenantAdmin.branches.branchDeleted'))
    } catch {
      toast.error(t('tenantAdmin.branches.deleteFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.branches.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.branches.activeCount', { count: currentCount })}</p>
        </div>
        <Button icon={Plus} onClick={openAdd}>{t('tenantAdmin.branches.addBranch')}</Button>
      </div>

      {/* Quota Banner */}
      {sub && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
            remaining === 0 && branchAddonPrice > 0
              ? 'bg-amber-400/5 border-amber-400/20'
              : remaining === 0
              ? 'bg-red-400/5 border-red-400/20'
              : 'bg-dark-surface border-dark-border'
          }`}>
            <GitBranch size={15} className={remaining === 0 ? (branchAddonPrice > 0 ? 'text-amber-400' : 'text-red-400') : 'text-gold'} />
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-off-white font-medium">
                  {t('tenantAdmin.branches.quotaLabel')} <span className="text-gold">{sub?.package}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: maxBranches }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full border ${i < currentCount ? 'bg-gold border-gold' : 'bg-transparent border-dark-border'}`}
                    />
                  ))}
                  {currentCount > maxBranches && (
                    <span className="text-xs text-amber-400 font-semibold ml-1">
                      {t('tenantAdmin.branches.paidExtra', { n: currentCount - maxBranches })}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted mt-1">
                {t('tenantAdmin.branches.freeQuotaUsed', { current: currentCount, max: maxBranches })}
                {remaining > 0 && ` · ${t('tenantAdmin.branches.freeSlotsRemaining', { n: remaining })}`}
                {remaining === 0 && branchAddonPrice > 0 && (
                  <span className="text-amber-400">
                    {' '}· {t('tenantAdmin.branches.addonFeeNote', { fee: formatRupiah(branchAddonPrice), period: branchAddonType === 'monthly' ? t('tenantAdmin.branches.perMonth') : t('tenantAdmin.branches.oneTime') })}
                  </span>
                )}
                {remaining === 0 && branchAddonPrice === 0 && (
                  <span className="text-red-400"> · {t('tenantAdmin.branches.upgradeToAdd')}</span>
                )}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Branch Grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {branches.map((branch, i) => (
            <motion.div key={branch.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-5 card-hover">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-off-white text-lg">{branch.name}</h3>
                    <Badge variant="success" dot className="mt-1">{t('common.active')}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(branch)} className="p-2 rounded-lg text-muted hover:text-blue-400 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(branch)} className="p-2 rounded-lg text-muted hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 text-sm">
                  <div className="flex gap-2">
                    <MapPin className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
                    <span className="text-muted leading-snug">{branch.address}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Phone className="w-4 h-4 text-muted" />
                    <span className="text-muted">{branch.phone}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Clock className="w-4 h-4 text-muted" />
                    <span className="text-muted">{branch.openTime} – {branch.closeTime}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-dark-border grid grid-cols-2 gap-3">
                  <div className="bg-dark-surface rounded-xl p-3 text-center">
                    <p className="text-lg font-bold text-off-white">{staff.filter(s => s.branchId === branch.id).length}</p>
                    <p className="text-xs text-muted">{t('nav.staff')}</p>
                  </div>
                  <div className="bg-dark-surface rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-gold">{formatRupiah(branch.monthlyRevenue || 0)}</p>
                    <p className="text-xs text-muted">{t('tenantAdmin.branches.revenueMTD')}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <Modal isOpen={showFormModal} onClose={() => setShowFormModal(false)} title={editBranch ? t('tenantAdmin.branches.editBranch') : t('tenantAdmin.branches.addBranch')}>
        <div className="space-y-4">
          {!editBranch && !withinFreeQuota && branchAddonPrice > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-300">
                {t('tenantAdmin.branches.feeWarning', { fee: formatRupiah(branchAddonPrice), period: branchAddonType === 'monthly' ? t('tenantAdmin.branches.perMonthLong') : t('tenantAdmin.branches.oneTimeLong') })}
              </p>
            </div>
          )}
          <Input label={t('tenantAdmin.branches.branchName')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jakarta Pusat" />
          <Input label={t('common.address')} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Jl. ..." />
          <Input label={t('common.phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="021-..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('tenantAdmin.branches.openTime')} type="time" value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} />
            <Input label={t('tenantAdmin.branches.closeTime')} type="time" value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowFormModal(false)}>{t('common.cancel')}</Button>
            <Button fullWidth onClick={handleSave}>{editBranch ? t('common.save') : t('common.next')}</Button>
          </div>
        </div>
      </Modal>

      {/* Fee Confirmation Modal */}
      <Modal isOpen={showFeeModal} onClose={() => { setShowFeeModal(false); setPendingForm(null) }} title={t('tenantAdmin.branches.feeConfirmTitle')}>
        <div className="space-y-5">
          <div className="p-4 bg-dark-card rounded-2xl border border-dark-border space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
                <Building2 size={18} className="text-gold" />
              </div>
              <div>
                <p className="font-semibold text-off-white">{pendingForm?.name}</p>
                <p className="text-xs text-muted">{pendingForm?.address}</p>
              </div>
            </div>
            <div className="border-t border-dark-border pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t('tenantAdmin.branches.feeAddBranch')}</span>
                <span className="font-semibold text-gold">{formatRupiah(branchAddonPrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t('tenantAdmin.branches.feeType')}</span>
                <span className="text-off-white">{branchAddonType === 'monthly' ? t('tenantAdmin.branches.feeTypeMonthly') : t('tenantAdmin.branches.feeTypeOneTime')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t('tenantAdmin.branches.currentPackage')}</span>
                <span className="text-off-white">{sub?.package}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-400/5 border border-blue-400/20 rounded-xl">
            <Info size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted">
              {t('tenantAdmin.branches.feeInvoiceNote')}
              {branchAddonType === 'monthly' && ' ' + t('tenantAdmin.branches.feeMonthlyNote')}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => { setShowFeeModal(false); setPendingForm(null) }}>
              {t('common.cancel')}
            </Button>
            <Button fullWidth icon={Plus} onClick={handleConfirmFee}>
              {t('tenantAdmin.branches.payAndAdd')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

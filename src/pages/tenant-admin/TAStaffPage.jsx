import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Star, Search } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from '../../hooks/useUsers.js'
import { useBranches } from '../../hooks/useBranches.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import Avatar from '../../components/ui/Avatar.jsx'

const ROLES = [
  { value: 'barber', label: 'Barber' },
  { value: 'kasir', label: 'Kasir' },
  { value: 'manager', label: 'Manager' },
]

export default function TAStaffPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const toast = useToast()
  const [showModal, setShowModal] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [form, setForm] = useState({ name: '', role: 'barber', branchId: '', commissionRate: 0.35 })

  const { data: allStaff = [], isLoading: isLoadingStaff } = useUsers({ tenantId: user?.tenantId })
  const { data: branches = [] } = useBranches(user?.tenantId)
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const isLoading = isLoadingStaff

  const filtered = allStaff.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase())
    const matchBranch = !branchFilter || s.branchId === branchFilter
    const matchRole = !roleFilter || s.role === roleFilter
    return matchSearch && matchBranch && matchRole
  })

  const openAdd = () => {
    setEditStaff(null)
    setForm({ name: '', role: 'barber', branchId: branches[0]?.id || '', commissionRate: 0.35 })
    setShowModal(true)
  }

  const openEdit = (member) => {
    setEditStaff(member)
    setForm({ name: member.name, role: member.role, branchId: member.branchId, commissionRate: member.commissionRate })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.branchId) return toast.error(t('tenantAdmin.staff.nameBranchRequired'))
    try {
      if (editStaff) {
        await updateUser.mutateAsync({ id: editStaff.id, ...form, tenantId: user.tenantId })
        toast.success(t('tenantAdmin.staff.staffUpdated'))
      } else {
        await createUser.mutateAsync({ ...form, tenantId: user.tenantId, rating: null, totalClients: 0, specializations: [] })
        toast.success(t('tenantAdmin.staff.staffAdded'))
      }
      setShowModal(false)
    } catch {
      toast.error(t('tenantAdmin.staff.saveFailed'))
    }
  }

  const handleDelete = async (member) => {
    try {
      await deleteUser.mutateAsync(member.id)
      toast.success(t('tenantAdmin.staff.staffDeleted'))
    } catch {
      toast.error(t('tenantAdmin.staff.deleteFailed'))
    }
  }

  const roleColors = { barber: 'gold', kasir: 'info', manager: 'purple' }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.staff.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.staff.registeredCount', { count: allStaff.length })}</p>
        </div>
        <Button icon={Plus} onClick={openAdd}>{t('tenantAdmin.staff.addStaff')}</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('tenantAdmin.staff.searchPlaceholder')}
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-gold/60"
          />
        </div>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2 text-sm outline-none focus:border-gold/60">
          <option value="">{t('tenantAdmin.staff.allBranches')}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2 text-sm outline-none focus:border-gold/60">
          <option value="">{t('tenantAdmin.staff.allRoles')}</option>
          <option value="barber">{t('tenantAdmin.staff.roleBarber')}</option>
          <option value="kasir">{t('tenantAdmin.staff.roleKasir')}</option>
          <option value="manager">{t('tenantAdmin.staff.roleManager')}</option>
        </select>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Staff grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((member, i) => (
            <motion.div key={member.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4 card-hover">
                <div className="flex items-start gap-4">
                  <Avatar src={member.photo} name={member.name} size="lg" ring={member.role === 'barber'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-off-white">{member.name}</h3>
                        <Badge variant={roleColors[member.role] || 'muted'} className="mt-1">{member.role}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(member)} className="p-1.5 rounded-lg text-muted hover:text-blue-400 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(member)} className="p-1.5 rounded-lg text-muted hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-muted mt-1.5">
                      {branches.find(b => b.id === member.branchId)?.name || '-'}
                    </p>

                    {member.role === 'barber' && (
                      <div className="flex items-center gap-3 mt-2">
                        {member.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                            <span className="text-xs text-gold">{member.rating}</span>
                          </div>
                        )}
                        <span className="text-xs text-muted">{t('tenantAdmin.staff.clientsCount', { count: member.totalClients })}</span>
                        <span className="text-xs text-muted">{t('tenantAdmin.staff.commissionPercent', { percent: (member.commissionRate * 100).toFixed(0) })}</span>
                      </div>
                    )}

                    {member.specializations?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {member.specializations.slice(0, 3).map(spec => (
                          <span key={spec} className="px-2 py-0.5 bg-gold/10 text-gold rounded-md text-xs">{spec}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editStaff ? t('tenantAdmin.staff.editStaff') : t('tenantAdmin.staff.addStaff')}>
        <div className="space-y-4">
          <Input label={t('common.name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('tenantAdmin.staff.fullNamePlaceholder')} />
          <Select label={t('tenantAdmin.staff.role')} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={ROLES} placeholder="" />
          <Select
            label={t('tenantAdmin.staff.branch')}
            value={form.branchId}
            onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
            options={branches.map(b => ({ value: b.id, label: b.name }))}
          />
          {form.role === 'barber' && (
            <Input label={t('tenantAdmin.staff.commissionRateLabel')} type="number" step="0.01" min="0.3" max="0.45" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: parseFloat(e.target.value) }))} />
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button fullWidth onClick={handleSave}>{editStaff ? t('common.save') : t('common.add')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

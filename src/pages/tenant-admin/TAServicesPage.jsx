import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Clock, Search } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useServices, useCreateService, useUpdateService, useDeleteService } from '../../hooks/useServices.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import { formatRupiah } from '../../utils/format.js'

const CATEGORIES = ['Potong Rambut', 'Perawatan', 'Warna', 'Combo']

export default function TAServicesPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const toast = useToast()
  const [showModal, setShowModal] = useState(false)
  const [editService, setEditService] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [form, setForm] = useState({ name: '', category: 'Potong Rambut', price: '', duration: '', description: '', icon: '✂️' })

  const { data: services = [], isLoading } = useServices()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const filtered = services.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = categoryFilter === 'All' || s.category === categoryFilter
    return matchSearch && matchCat
  })

  const openAdd = () => {
    setEditService(null)
    setForm({ name: '', category: 'Potong Rambut', price: '', duration: '', description: '', icon: '✂️' })
    setShowModal(true)
  }

  const openEdit = (svc) => {
    setEditService(svc)
    setForm({ name: svc.name, category: svc.category, price: svc.price, duration: svc.duration, description: svc.description || '', icon: svc.icon || '✂️' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.price) return toast.error(t('tenantAdmin.services.namePriceRequired'))
    const data = { ...form, price: Number(form.price), duration: Number(form.duration), tenantId: user.tenantId }
    try {
      if (editService) {
        await updateService.mutateAsync({ id: editService.id, ...data })
        toast.success(t('tenantAdmin.services.serviceUpdated'))
      } else {
        await createService.mutateAsync(data)
        toast.success(t('tenantAdmin.services.serviceAdded'))
      }
      setShowModal(false)
    } catch {
      toast.error(t('tenantAdmin.services.saveFailed'))
    }
  }

  const handleDelete = async (svc) => {
    try {
      await deleteService.mutateAsync(svc.id)
      toast.success(t('tenantAdmin.services.serviceDeleted'))
    } catch {
      toast.error(t('tenantAdmin.services.deleteFailed'))
    }
  }

  const catCounts = CATEGORIES.map(c => ({ cat: c, count: services.filter(s => s.category === c).length }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.services.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.services.availableCount', { count: services.length })}</p>
        </div>
        <Button icon={Plus} onClick={openAdd}>{t('tenantAdmin.services.addService')}</Button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['All', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              categoryFilter === cat
                ? 'bg-gold text-dark'
                : 'bg-dark-card border border-dark-border text-muted hover:text-off-white'
            }`}
          >
            {cat === 'All' ? t('common.all') : cat} {cat !== 'All' && <span className="ml-1 text-xs">({catCounts.find(c => c.cat === cat)?.count || 0})</span>}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('tenantAdmin.services.searchPlaceholder')}
          className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-gold/60"
        />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Services grid */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((svc, i) => (
            <motion.div key={svc.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4 card-hover">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center text-xl">
                      {svc.icon}
                    </div>
                    <div>
                      <h3 className="font-medium text-off-white">{svc.name}</h3>
                      <Badge variant="muted" className="mt-0.5">{svc.category}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(svc)} className="p-1.5 rounded-lg text-muted hover:text-blue-400 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(svc)} className="p-1.5 rounded-lg text-muted hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-gold font-semibold">{formatRupiah(svc.price)}</span>
                  <div className="flex items-center gap-1 text-muted text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{t('tenantAdmin.services.minutesValue', { n: svc.duration })}</span>
                  </div>
                </div>
                {svc.description && <p className="text-xs text-muted mt-2 leading-snug">{svc.description}</p>}
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted">
          <div className="text-4xl mb-3">✂️</div>
          <p>{t('tenantAdmin.services.noServicesFound')}</p>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editService ? t('tenantAdmin.services.editService') : t('tenantAdmin.services.addService')}>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {['✂️','🪒','💊','🎨','🔥','✨','💈','😌','👑','⚡','🌿','💎'].map(emoji => (
              <button
                key={emoji}
                onClick={() => setForm(f => ({ ...f, icon: emoji }))}
                className={`p-3 rounded-xl text-2xl transition-all ${form.icon === emoji ? 'bg-gold/20 border border-gold/40' : 'bg-dark-surface hover:bg-dark-card border border-dark-border'}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <Input label={t('tenantAdmin.services.serviceName')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('tenantAdmin.services.namePlaceholder')} />
          <Select label={t('common.category')} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} options={CATEGORIES.map(c => ({ value: c, label: c }))} placeholder="" />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('tenantAdmin.services.priceLabel')} type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="35000" />
            <Input label={t('tenantAdmin.services.duration')} type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="30" />
          </div>
          <Input label={t('tenantAdmin.services.descriptionLabel')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('tenantAdmin.services.descriptionPlaceholder')} />
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button fullWidth onClick={handleSave}>{editService ? t('common.save') : t('common.add')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

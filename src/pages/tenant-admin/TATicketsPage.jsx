import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Send, MessageSquare, AlertCircle, Clock, CheckCircle, ChevronRight, ShieldCheck, User, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useTickets, useTicket, useCreateTicket, useReplyToTicket } from '../../hooks/useTickets.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import { timeAgo, formatDateTime } from '../../utils/format.js'

const STATUS_CONFIG = {
  open:        { label: 'Open',        variant: 'danger',  icon: AlertCircle, color: 'text-red-400' },
  in_progress: { label: 'In Progress', variant: 'warning', icon: Clock,       color: 'text-amber-400' },
  resolved:    { label: 'Selesai',     variant: 'success', icon: CheckCircle, color: 'text-green-400' },
}

const CATEGORIES = ['Bug', 'Feature Request', 'Billing', 'General']
const PRIORITIES  = [
  { value: 'high',   label: 'Tinggi',  color: 'text-red-400 bg-red-400/10 border-red-400/30' },
  { value: 'medium', label: 'Sedang',  color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  { value: 'low',    label: 'Rendah',  color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
]

export default function TATicketsPage() {
  const { user }  = useAuthStore()
  const toast = useToast()
  const { t } = useTranslation()

  const [showNew,        setShowNew]        = useState(false)
  const [selectedId,     setSelectedId]     = useState(null)
  const [replyText,      setReplyText]      = useState('')
  const [sending,        setSending]        = useState(false)
  const [form, setForm] = useState({ subject: '', description: '', category: 'Bug', priority: 'medium' })

  const { data: myTickets = [], isLoading } = useTickets(user?.tenantId)
  const { data: ticketDetail } = useTicket(selectedId)
  const selectedTicket = ticketDetail || (selectedId ? myTickets.find(t => t.id === selectedId) : null)
  const createTicket = useCreateTicket()
  const replyToTicket = useReplyToTicket()

  const openCount     = myTickets.filter(t => t.status === 'open').length
  const resolvedCount = myTickets.filter(t => t.status === 'resolved').length

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim())
      return toast.error('Judul dan deskripsi wajib diisi')
    try {
      await createTicket.mutateAsync({
        tenantId:    user.tenantId,
        tenantName:  user.tenantName || user.tenantId,
        subject:     form.subject,
        description: form.description,
        category:    form.category,
        priority:    form.priority,
        createdBy:   user.name,
      })
      toast.success(t('tickets.toast.created'))
      setForm({ subject: '', description: '', category: 'Bug', priority: 'medium' })
      setShowNew(false)
    } catch {
      toast.error(t('tickets.toast.createFailed'))
    }
  }

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicket) return
    setSending(true)
    try {
      await replyToTicket.mutateAsync({ id: selectedTicket.id, author: user.name, message: replyText, isAdmin: false })
      setReplyText('')
      toast.success(t('tickets.toast.replied'))
    } catch {
      toast.error(t('tickets.toast.replyFailed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Support Tickets</h1>
          <p className="text-muted text-sm mt-1">Hubungi tim support platform BarberOS</p>
        </div>
        <Button icon={Plus} onClick={() => setShowNew(true)}>Buat Tiket</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tiket', value: myTickets.length, color: 'text-off-white' },
          { label: 'Open',        value: openCount,        color: 'text-red-400' },
          { label: 'Selesai',     value: resolvedCount,    color: 'text-green-400' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted mt-1">{s.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Layout */}
      {!isLoading && (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Ticket List */}
          <div className="lg:col-span-2 space-y-2">
            {myTickets.length === 0 && (
              <div className="text-center py-16 text-muted">
                <MessageSquare size={36} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Belum ada tiket. Klik "Buat Tiket" untuk menghubungi support.</p>
              </div>
            )}
            {myTickets.map((ticket, i) => {
              const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
              const pr = PRIORITIES.find(p => p.value === ticket.priority)
              const isSelected = selectedId === ticket.id
              const hasNewReply = ticket.replies?.some(r => r.isAdmin)
              return (
                <motion.button
                  key={ticket.id}
                  onClick={() => setSelectedId(ticket.id)}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${isSelected ? 'border-gold bg-gold/5' : 'border-dark-border bg-dark-surface hover:border-gold/30'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-off-white line-clamp-1 flex-1">{ticket.subject}</p>
                    <ChevronRight size={14} className="text-muted flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {pr && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${pr.color}`}>{pr.label}</span>}
                    <Badge variant={sc.variant} className="text-[10px]">{sc.label}</Badge>
                    <span className="text-xs text-muted">{ticket.category}</span>
                    {hasNewReply && <span className="text-[10px] text-gold bg-gold/10 px-1.5 py-0.5 rounded-full">Ada balasan</span>}
                  </div>
                  <p className="text-xs text-muted mt-1.5" title={formatDateTime(ticket.createdAt)}>{timeAgo(ticket.createdAt)}</p>
                </motion.button>
              )
            })}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {selectedTicket ? (
                <motion.div key={selectedTicket.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-off-white">{selectedTicket.subject}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={STATUS_CONFIG[selectedTicket.status]?.variant}>
                              {STATUS_CONFIG[selectedTicket.status]?.label}
                            </Badge>
                            <span className="text-xs text-muted">{selectedTicket.category}</span>
                            <span className="text-xs text-muted" title={formatDateTime(selectedTicket.createdAt)}>{timeAgo(selectedTicket.createdAt)}</span>
                          </div>
                        </div>
                        <button onClick={() => setSelectedId(null)} className="text-muted hover:text-off-white p-1">
                          <X size={15} />
                        </button>
                      </div>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      {/* Original message */}
                      <div className="p-3 bg-dark-card rounded-xl border border-dark-border">
                        <div className="flex items-center gap-2 mb-2">
                          <User size={13} className="text-muted" />
                          <span className="text-xs font-medium text-off-white">{selectedTicket.createdBy?.name || selectedTicket.createdBy?.email || '—'}</span>
                          <span className="text-xs text-muted" title={formatDateTime(selectedTicket.createdAt)}>{timeAgo(selectedTicket.createdAt)}</span>
                        </div>
                        <p className="text-sm text-off-white">{selectedTicket.description}</p>
                      </div>

                      {/* Replies */}
                      {(selectedTicket.replies || []).map((r, i) => (
                        <div key={r.id || i} className={`p-3 rounded-xl border ${r.isAdmin ? 'border-gold/20 bg-gold/5 ml-4' : 'border-dark-border bg-dark-card'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            {r.isAdmin
                              ? <><ShieldCheck size={13} className="text-gold" /><span className="text-xs font-semibold text-gold">{r.author?.name || r.author?.email || '—'} (Support)</span></>
                              : <><User size={13} className="text-muted" /><span className="text-xs font-medium text-off-white">{r.author?.name || r.author?.email || '—'}</span></>
                            }
                            <span className="text-xs text-muted" title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                          </div>
                          <p className="text-sm text-off-white">{r.message}</p>
                        </div>
                      ))}

                      {/* Reply */}
                      {selectedTicket.status !== 'resolved' ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            rows={3}
                            placeholder="Tambah informasi atau pertanyaan lanjutan..."
                            className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-gold/50"
                          />
                          <Button icon={Send} size="sm" onClick={handleReply} disabled={sending || !replyText.trim()}>
                            {sending ? 'Mengirim...' : 'Kirim'}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted text-center py-2">Tiket ini sudah diselesaikan oleh tim support.</p>
                      )}
                    </CardBody>
                  </Card>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-64">
                  <div className="text-center text-muted">
                    <MessageSquare size={40} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Pilih tiket untuk melihat detail</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* New Ticket Modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Buat Tiket Support">
        <div className="space-y-4">
          <Input
            label="Judul / Subjek"
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="Contoh: Laporan tidak bisa diexport"
          />
          <div>
            <label className="block text-xs text-muted mb-1.5">Deskripsi Masalah</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              placeholder="Jelaskan masalah secara detail, langkah reproduksi, dll."
              className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-gold/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1.5">Kategori</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold/50">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Prioritas</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gold/50">
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setShowNew(false)}>Batal</Button>
            <Button fullWidth onClick={handleSubmit}>Kirim Tiket</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

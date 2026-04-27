import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Send, CheckCircle, Clock, AlertCircle, Filter, X, ChevronRight, User, ShieldCheck } from 'lucide-react'
import { useAllTickets, useTicket, useUpdateTicketStatus, useReplyToTicket } from '../../hooks/useTickets.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import { timeAgo, formatDateTime } from '../../utils/format.js'

const STATUS_CONFIG = {
  open:        { label: 'Open',        variant: 'danger',  icon: AlertCircle, color: 'text-red-400' },
  in_progress: { label: 'In Progress', variant: 'warning', icon: Clock,       color: 'text-amber-400' },
  resolved:    { label: 'Resolved',    variant: 'success', icon: CheckCircle, color: 'text-green-400' },
}

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: 'text-red-400 bg-red-400/10 border-red-400/30' },
  medium: { label: 'Medium', color: 'text-amber-400 bg-amber-400/10 border-amber-400/30' },
  low:    { label: 'Low',    color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
}

const CATEGORY_COLORS = {
  Bug:             'text-red-400',
  'Feature Request': 'text-purple-400',
  Billing:         'text-gold',
  General:         'text-blue-400',
}

export default function SATicketsPage() {
  const { data: tickets = [] } = useAllTickets()
  const updateStatus = useUpdateTicketStatus()
  const replyToTicket = useReplyToTicket()
  const toast = useToast()
  const { t } = useTranslation()

  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const { data: ticketDetail } = useTicket(selectedId)
  const selectedTicket = ticketDetail || (selectedId ? tickets.find(t => t.id === selectedId) : null)

  const stats = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
  }

  const filtered = tickets.filter(t => {
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPriority && t.priority !== filterPriority) return false
    return true
  })

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicket) return
    setSending(true)
    try {
      await replyToTicket.mutateAsync({ id: selectedTicket.id, message: replyText, isAdmin: true })
      setReplyText('')
      toast.success(t('tickets.toast.replied'))
    } catch (err) {
      toast.error(err?.response?.data?.message || t('tickets.toast.replyFailed'))
    } finally {
      setSending(false)
    }
  }

  const handleStatusChange = async (ticketId, status) => {
    try {
      await updateStatus.mutateAsync({ id: ticketId, status })
      toast.info(t('tickets.toast.statusChanged', { label: STATUS_CONFIG[status]?.label }))
    } catch (err) {
      toast.error(err?.response?.data?.message || t('tickets.toast.statusFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold gold-text">Support Tickets</h1>
        <p className="text-muted text-sm mt-1">Kelola permintaan dan laporan dari semua tenant</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open', value: stats.open, color: 'text-red-400', bg: 'bg-red-400/10' },
          { label: 'In Progress', value: stats.in_progress, color: 'text-amber-400', bg: 'bg-amber-400/10' },
          { label: 'Resolved', value: stats.resolved, color: 'text-green-400', bg: 'bg-green-400/10' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-4 text-center">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted mt-1">{s.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-2 space-y-3">
          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="flex-1 bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
            >
              <option value="">Semua Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value)}
              className="flex-1 bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
            >
              <option value="">Semua Prioritas</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Tidak ada tiket ditemukan</p>
            </div>
          )}

          {filtered.map((ticket, i) => {
            const statusCfg = STATUS_CONFIG[ticket.status]
            const priorityCfg = PRIORITY_CONFIG[ticket.priority]
            const isSelected = selectedTicket?.id === ticket.id
            return (
              <motion.div key={ticket.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <button
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${isSelected ? 'border-gold bg-gold/5' : 'border-dark-border bg-dark-surface hover:border-gold/30'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-off-white line-clamp-1">{ticket.subject}</p>
                    <ChevronRight size={14} className="text-muted flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${priorityCfg.color}`}>
                      {priorityCfg.label}
                    </span>
                    <Badge variant={statusCfg.variant} className="text-[10px]">{statusCfg.label}</Badge>
                    <span className={`text-xs ${CATEGORY_COLORS[ticket.category] || 'text-muted'}`}>{ticket.category}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                    <span>{ticket.tenant?.name || '—'}</span>
                    <span>·</span>
                    <span>{ticket._count?.replies ?? ticket.replies?.length ?? 0} balasan</span>
                  </div>
                </button>
              </motion.div>
            )
          })}
        </div>

        {/* Ticket Detail */}
        <div className="lg:col-span-3">
          <AnimatePresence mode="wait">
            {selectedTicket ? (
              <motion.div key={selectedTicket.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-off-white">{selectedTicket.subject}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted">{selectedTicket.tenant?.name || '—'}</span>
                          <span className="text-xs text-muted">·</span>
                          <span className="text-xs text-muted" title={formatDateTime(selectedTicket.createdAt)}>{timeAgo(selectedTicket.createdAt)}</span>
                          <Badge variant={STATUS_CONFIG[selectedTicket.status]?.variant}>
                            {STATUS_CONFIG[selectedTicket.status]?.label}
                          </Badge>
                        </div>
                      </div>
                      <button onClick={() => setSelectedId(null)} className="text-muted hover:text-off-white p-1">
                        <X size={16} />
                      </button>
                    </div>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    {/* Original message */}
                    <div className="p-3 bg-dark-card rounded-xl border border-dark-border">
                      <div className="flex items-center gap-2 mb-2">
                        <User size={14} className="text-muted" />
                        <span className="text-xs font-medium text-off-white">{selectedTicket.createdBy?.name || selectedTicket.createdBy?.email || '—'}</span>
                        <span className="text-xs text-muted" title={formatDateTime(selectedTicket.createdAt)}>{timeAgo(selectedTicket.createdAt)}</span>
                      </div>
                      <p className="text-sm text-off-white">{selectedTicket.description}</p>
                    </div>

                    {/* Replies */}
                    {(selectedTicket.replies || []).map((reply, i) => (
                      <div key={reply.id || i} className={`p-3 rounded-xl border ${reply.isAdmin ? 'border-gold/20 bg-gold/5 ml-4' : 'border-dark-border bg-dark-card'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {reply.isAdmin
                            ? <ShieldCheck size={14} className="text-gold" />
                            : <User size={14} className="text-muted" />}
                          <span className={`text-xs font-medium ${reply.isAdmin ? 'text-gold' : 'text-off-white'}`}>{reply.author?.name || reply.author?.email || '—'}</span>
                          <span className="text-xs text-muted" title={formatDateTime(reply.createdAt)}>{timeAgo(reply.createdAt)}</span>
                        </div>
                        <p className="text-sm text-off-white">{reply.message}</p>
                      </div>
                    ))}

                    {/* Status Controls */}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => handleStatusChange(selectedTicket.id, key)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${selectedTicket.status === key ? 'border-gold bg-gold/10 text-gold' : 'border-dark-border text-muted hover:border-gold/30'}`}
                        >
                          <cfg.icon size={12} className={cfg.color} />
                          {cfg.label}
                        </button>
                      ))}
                    </div>

                    {/* Reply Box */}
                    {selectedTicket.status !== 'resolved' && (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          rows={3}
                          placeholder="Tulis balasan sebagai Platform Admin..."
                          className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-gold/50 transition-colors"
                        />
                        <Button icon={Send} size="sm" onClick={handleReply} disabled={sending || !replyText.trim()}>
                          {sending ? 'Mengirim...' : 'Kirim Balasan'}
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center h-80">
                <div className="text-center text-muted">
                  <MessageSquare size={48} className="mx-auto mb-3 opacity-20" />
                  <p>Pilih tiket untuk melihat detail</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

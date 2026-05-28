import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Edit2, Trash2, MapPin, Phone, Clock, Building2, AlertTriangle,
  Info, GitBranch, Lock, CheckCircle2, XCircle, CreditCard, ArrowUpCircle,
  ChevronRight, Receipt, RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore.js'
import { useBranches, useCreateBranch, useUpdateBranch, useDeleteBranch, useBranchLicenseSummary } from '../../hooks/useBranches.js'
import { useSubscription } from '../../hooks/useSubscription.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import { formatRupiah } from '../../utils/format.js'
import { formatDateInTz } from '../../utils/timezone.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUB_STATUS_CFG = {
  active:  { label: 'Aktif',   variant: 'success', color: 'text-green-400' },
  trial:   { label: 'Trial',   variant: 'info',    color: 'text-blue-400' },
  overdue: { label: 'Overdue', variant: 'danger',  color: 'text-amber-400' },
  expired: { label: 'Expired', variant: 'muted',   color: 'text-red-400' },
}

function QuotaDots({ current, max, extra = 0 }) {
  const dots = Math.max(max, current)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {Array.from({ length: dots }, (_, i) => {
        const paid  = i < max
        const used  = i < current
        const addon = i >= max && used
        return (
          <div
            key={i}
            className={`w-3 h-3 rounded-full border transition-all ${
              used && paid  ? 'bg-brand border-brand' :
              addon         ? 'bg-amber-400 border-amber-400' :
                              'bg-transparent border-dark-border'
            }`}
            title={addon ? 'Cabang add-on' : used ? 'Dipakai' : 'Tersedia'}
          />
        )
      })}
      {extra > 0 && <span className="text-xs text-amber-400 font-semibold">+{extra} add-on</span>}
    </div>
  )
}

// Rincian staf per peran → "1 Kasir · 2 Barber" (lebih jelas dari angka tunggal).
const STAFF_ROLE_LABEL = { kasir: 'Kasir', barber: 'Barber', tenant_admin: 'Admin' }
function staffBreakdown(byRole) {
  if (!byRole) return ''
  return Object.entries(byRole)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `${n} ${STAFF_ROLE_LABEL[role] || role}`)
    .join(' · ')
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TABranchesPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const toast = useToast()
  const tenantId = user?.tenantId

  const [showFormModal, setShowFormModal] = useState(false)
  const [showFeeModal,  setShowFeeModal]  = useState(false)
  const [showDelModal,  setShowDelModal]  = useState(null)
  const [editBranch,    setEditBranch]    = useState(null)
  const [pendingForm,   setPendingForm]   = useState(null)
  const [form, setForm] = useState({ name: '', code: '', address: '', phone: '', openTime: '09:00', closeTime: '21:00' })

  const { data: branches = [], isLoading, isError, refetch, isFetching } = useBranches(tenantId)
  const { data: sub }                       = useSubscription(tenantId)
  const { data: lic }                       = useBranchLicenseSummary(tenantId)
  const createBranch = useCreateBranch()
  const updateBranch = useUpdateBranch()
  const deleteBranch = useDeleteBranch()

  // ── Derived state ──────────────────────────────────────────────────────────
  const maxBranches      = sub?.maxBranches      ?? 1
  const addonPrice       = sub?.branchAddonPrice ?? 0
  const addonType        = sub?.branchAddonType  ?? 'monthly'
  const subStatus        = sub?.status
  const currentCount     = branches.length
  const withinQuota      = currentCount < maxBranches
  const canAddon         = addonPrice > 0
  const isSuspended      = sub?.tenant?.isSuspended ?? false
  const isExpired        = subStatus === 'expired'
  const isOverdue        = subStatus === 'overdue'

  const pendingInvoices  = (sub?.invoices ?? []).filter(
    inv => inv.type === 'branch_addon' && inv.status !== 'paid'
  )
  const paidAddonCount   = lic?.paidAddonCount   ?? 0

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openAdd = () => {
    if (isSuspended) { toast.error('Akun tenant sedang di-suspend. Hubungi super admin.'); return }
    if (!withinQuota && !canAddon) {
      toast.error(`Kuota paket ${sub?.package} sudah penuh. Upgrade paket untuk menambah cabang.`)
      return
    }
    setEditBranch(null)
    setForm({ name: '', code: '', address: '', phone: '', openTime: '09:00', closeTime: '21:00' })
    setShowFormModal(true)
  }

  const openEdit = (branch) => {
    setEditBranch(branch)
    setForm({ name: branch.name, code: branch.code || '', address: branch.address || '', phone: branch.phone || '', openTime: branch.openTime || '09:00', closeTime: branch.closeTime || '21:00' })
    setShowFormModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim()) {
      return toast.error('Nama dan alamat wajib diisi')
    }
    const codeTrim = form.code.trim().toLowerCase()
    if (codeTrim && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(codeTrim)) {
      return toast.error('Kode cabang hanya boleh huruf kecil, angka, dan tanda hubung')
    }
    const payload = { ...form, code: codeTrim || undefined }

    if (editBranch) {
      try {
        await updateBranch.mutateAsync({ id: editBranch.id, tenantId, ...payload })
        toast.success('Cabang berhasil diperbarui')
        setShowFormModal(false)
      } catch (err) {
        if (err?.response?.data?.code === 'BRANCH_CODE_TAKEN') {
          toast.error('Kode cabang sudah dipakai, pilih yang lain')
        } else { toast.error('Gagal memperbarui cabang') }
      }
      return
    }
    if (!withinQuota && canAddon) {
      setPendingForm(payload)
      setShowFormModal(false)
      setShowFeeModal(true)
      return
    }
    try {
      await createBranch.mutateAsync({ ...payload, tenantId })
      toast.success('Cabang berhasil ditambahkan')
      setShowFormModal(false)
    } catch (err) {
      const code = err?.response?.data?.code
      if (code === 'QUOTA_EXCEEDED_UPGRADE_REQUIRED') toast.error(err.response.data.error)
      else if (code === 'BRANCH_CODE_TAKEN') toast.error('Kode cabang sudah dipakai, pilih yang lain')
      else if (code === 'SUSPENDED') toast.error('Akun tenant sedang di-suspend')
      else toast.error('Gagal menambahkan cabang')
    }
  }

  const handleConfirmFee = async () => {
    if (!pendingForm) return
    try {
      await createBranch.mutateAsync({ ...pendingForm, tenantId })
      toast.success(`Cabang "${pendingForm.name}" berhasil dibuat. Invoice dikirim ke super admin untuk konfirmasi.`)
      setShowFeeModal(false)
      setPendingForm(null)
    } catch (err) {
      const code = err?.response?.data?.code
      if (code === 'SUSPENDED') toast.error('Akun tenant sedang di-suspend')
      else toast.error('Gagal menambahkan cabang')
    }
  }

  const handleDelete = async (branch) => {
    try {
      await deleteBranch.mutateAsync({ id: branch.id, tenantId })
      toast.success('Cabang dihapus')
      setShowDelModal(null)
    } catch { toast.error('Gagal menghapus cabang') }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Cabang</h1>
          <p className="text-muted text-sm mt-1">{currentCount} cabang aktif</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Muat ulang"
            title="Muat ulang"
            className="p-2 rounded-lg border border-dark-border text-muted hover:text-off-white hover:bg-dark-card transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <Button icon={Plus} onClick={openAdd} disabled={isSuspended || (!withinQuota && !canAddon)}>
            Tambah Cabang
          </Button>
        </div>
      </div>

      {/* ── Status Banners ── */}
      <AnimatePresence>
        {isSuspended && (
          <motion.div key="suspended" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-3 p-4 rounded-2xl border bg-red-500/5 border-red-500/20">
            <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">Akun Tenant Di-Suspend</p>
              <p className="text-xs text-muted mt-0.5">Semua operasi dinonaktifkan. Hubungi super admin untuk reaktivasi.</p>
            </div>
          </motion.div>
        )}

        {!isSuspended && isExpired && (
          <motion.div key="expired" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-3 p-4 rounded-2xl border bg-red-500/5 border-red-500/20">
            <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-400">Langganan Sudah Berakhir</p>
              <p className="text-xs text-muted mt-0.5">Cabang yang melebihi kuota tidak berlisensi. Hubungi super admin untuk perpanjang.</p>
            </div>
            <button onClick={() => navigate('/admin/billing')} className="text-xs text-red-400 hover:text-red-400 underline flex-shrink-0">
              Lihat Tagihan
            </button>
          </motion.div>
        )}

        {!isSuspended && isOverdue && (
          <motion.div key="overdue" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-3 p-4 rounded-2xl border bg-amber-400/5 border-amber-400/20">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-400">Pembayaran Tertunggak</p>
              <p className="text-xs text-muted mt-0.5">Segera lunasi tagihan agar layanan tidak terputus.</p>
            </div>
            <button onClick={() => navigate('/admin/billing')} className="text-xs text-amber-400 hover:text-amber-400 underline flex-shrink-0">
              Lihat Tagihan
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quota Card ── */}
      {sub && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`p-4 ${!withinQuota && !canAddon ? 'border-red-400/30 bg-red-400/5' : !withinQuota ? 'border-amber-400/30 bg-amber-400/5' : ''}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <GitBranch size={14} className="text-brand" />
                  <span className="text-sm font-medium text-off-white">Kuota Cabang — Paket <span className="text-brand">{sub.package}</span></span>
                  <Badge variant={SUB_STATUS_CFG[subStatus]?.variant || 'muted'}>
                    {SUB_STATUS_CFG[subStatus]?.label || subStatus}
                  </Badge>
                </div>
                <QuotaDots current={currentCount} max={maxBranches} extra={paidAddonCount} />
                <p className="text-xs text-muted">
                  {currentCount} dari {maxBranches} slot terpakai
                  {paidAddonCount > 0 && ` · ${paidAddonCount} cabang add-on berlisensi`}
                  {pendingInvoices.length > 0 && (
                    <span className="text-amber-400"> · {pendingInvoices.length} tagihan add-on menunggu konfirmasi</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {!withinQuota && !canAddon && (
                  <Button size="sm" icon={ArrowUpCircle} variant="secondary" onClick={() => navigate('/admin/billing')}>
                    Upgrade Paket
                  </Button>
                )}
                {!withinQuota && canAddon && (
                  <div className="text-right">
                    <p className="text-xs text-amber-400 font-medium">{formatRupiah(addonPrice)}<span className="text-muted font-normal">/{addonType === 'monthly' ? 'bulan' : 'sekali bayar'}</span></p>
                    <p className="text-[10px] text-muted">per cabang tambahan</p>
                  </div>
                )}
              </div>
            </div>

            {/* Upgrade prompt for Basic */}
            {!withinQuota && !canAddon && (
              <div className="mt-3 pt-3 border-t border-red-400/20 flex items-center gap-2">
                <Info size={12} className="text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">
                  Paket {sub.package} hanya mendukung {maxBranches} cabang. Upgrade ke Pro atau Enterprise untuk cabang tak terbatas.
                </p>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* ── Pending Invoices ── */}
      {pendingInvoices.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-amber-400/30 bg-amber-400/5">
            <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-amber-400/20">
              <Receipt size={14} className="text-amber-400" />
              <p className="text-sm font-semibold text-amber-400">Tagihan Cabang Menunggu Konfirmasi</p>
            </div>
            <div className="divide-y divide-amber-400/10">
              {pendingInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-off-white">{inv.period}</p>
                    <p className="text-xs text-muted mt-0.5">
                      Dibuat {formatDateInTz(inv.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-amber-400">{formatRupiah(inv.amount)}</p>
                    <p className="text-[10px] text-amber-400 mt-0.5">Hubungi admin untuk konfirmasi</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-amber-400/20 flex items-center gap-2">
              <Info size={12} className="text-amber-400 flex-shrink-0" />
              <p className="text-xs text-muted">
                Cabang add-on akan aktif setelah super admin mengkonfirmasi pembayaran.
                Transfer ke rekening yang tertera, lalu hubungi via tiket.
              </p>
              <button onClick={() => navigate('/admin/tickets')} className="ml-auto text-xs text-brand underline flex-shrink-0 hover:text-brand/80">
                Buka Tiket
              </button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-56 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {!isLoading && isError && (
        <Card className="p-10 text-center border-red-400/30 bg-red-400/5">
          <AlertTriangle className="w-9 h-9 text-red-400 mx-auto mb-3" />
          <p className="text-off-white font-medium">Gagal memuat daftar cabang</p>
          <p className="text-muted text-sm mt-1">Periksa koneksi internet lalu coba lagi.</p>
          <Button size="sm" className="mt-4" icon={RefreshCw} variant="secondary" onClick={() => refetch()}>
            Coba Lagi
          </Button>
        </Card>
      )}

      {/* ── Branch Grid ── */}
      {!isLoading && !isError && branches.length === 0 && (
        <Card className="p-12 text-center">
          <Building2 className="w-10 h-10 text-muted/30 mx-auto mb-3" />
          <p className="text-off-white font-medium">Belum ada cabang</p>
          <p className="text-muted text-sm mt-1">Tambahkan cabang pertama untuk mulai beroperasi.</p>
          {!isSuspended && (
            <Button size="sm" className="mt-4" icon={Plus} onClick={openAdd}>Tambah Cabang</Button>
          )}
        </Card>
      )}

      {!isLoading && !isError && branches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {branches.map((branch, i) => {
            const unlicensed = branch.isLicensed === false
            const staffByRole = branch.staffByRole || {}
            const staffCount = branch._count?.users ?? Object.values(staffByRole).reduce((a, b) => a + b, 0)
            const staffDetail = staffBreakdown(staffByRole)
            return (
              <motion.div key={branch.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className={`p-5 card-hover relative ${unlicensed ? 'border-amber-400/30 bg-amber-400/5' : ''}`}>

                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        unlicensed ? 'bg-amber-400/10 border-amber-400/20' : 'bg-brand/10 border-brand/20'
                      }`}>
                        <Building2 size={18} className={unlicensed ? 'text-amber-400' : 'text-brand'} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-off-white truncate">{branch.name}</h3>
                        {unlicensed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-400 mt-0.5">
                            <Lock size={9} /> Belum Berlisensi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-green-400/30 bg-green-400/10 text-green-400 mt-0.5">
                            <CheckCircle2 size={9} /> Berlisensi
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(branch)} className="p-1.5 rounded-lg text-muted hover:text-blue-400 hover:bg-blue-400/10 transition-colors">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => setShowDelModal(branch)} className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 text-sm mb-3">
                    {branch.address && (
                      <div className="flex gap-2">
                        <MapPin size={13} className="text-muted flex-shrink-0 mt-0.5" />
                        <span className="text-muted leading-snug text-xs">{branch.address}</span>
                      </div>
                    )}
                    {branch.phone && (
                      <div className="flex gap-2 items-center">
                        <Phone size={13} className="text-muted" />
                        <span className="text-muted text-xs">{branch.phone}</span>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <Clock size={13} className="text-muted" />
                      <span className="text-muted text-xs">{branch.openTime || '09:00'} – {branch.closeTime || '21:00'}</span>
                    </div>
                  </div>

                  {/* Unlicensed warning */}
                  {unlicensed && (
                    <div className="mb-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/25">
                      <Lock size={12} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-400 leading-snug">
                        Cabang ini melebihi kuota paket. Kasir tidak bisa beroperasi sampai lisensi aktif.{' '}
                        <button onClick={() => navigate('/admin/tickets')} className="text-amber-400 underline font-medium">
                          Hubungi admin.
                        </button>
                      </p>
                    </div>
                  )}

                  {/* Stats footer */}
                  <div className="pt-3 border-t border-dark-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-dark-surface rounded-xl p-2.5 text-center">
                        <p className="text-base font-bold text-off-white">{staffCount}</p>
                        <p className="text-[10px] text-muted">Staf aktif</p>
                      </div>
                      <div className="bg-dark-surface rounded-xl p-2.5 text-center">
                        <p className="text-sm font-bold text-brand">{formatRupiah(branch.monthlyRevenue || 0)}</p>
                        <p className="text-[10px] text-muted">Omzet bulan ini</p>
                      </div>
                    </div>
                    {staffDetail && (
                      <p className="text-[10px] text-muted text-center mt-2">{staffDetail}</p>
                    )}
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── Upgrade CTA (when quota full, no addon) ── */}
      {!withinQuota && !canAddon && !isLoading && sub && (
        <Card className="p-5 border-blue-400/20 bg-blue-400/3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-400/10 border border-blue-400/20 flex items-center justify-center flex-shrink-0">
              <ArrowUpCircle size={22} className="text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-off-white">Butuh lebih banyak cabang?</p>
              <p className="text-xs text-muted mt-0.5">
                Upgrade ke <strong className="text-brand">Pro</strong> (maks 5 cabang) atau{' '}
                <strong className="text-purple-400">Enterprise</strong> (tidak terbatas). Hubungi super admin atau buka halaman tagihan.
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => navigate('/admin/billing')}>
              Lihat Paket
            </Button>
          </div>
        </Card>
      )}

      {/* ── Form Modal ── */}
      <Modal
        isOpen={showFormModal}
        onClose={() => !createBranch.isPending && !updateBranch.isPending && setShowFormModal(false)}
        title={editBranch ? 'Edit Cabang' : 'Tambah Cabang'}
      >
        <div className="space-y-4">
          {!editBranch && !withinQuota && canAddon && (
            <div className="flex items-start gap-2 p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl">
              <AlertTriangle size={13} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-400">
                Cabang ini di luar kuota paket. Akan dikenakan biaya{' '}
                <strong>{formatRupiah(addonPrice)}/{addonType === 'monthly' ? 'bulan' : 'sekali bayar'}</strong>.
                Invoice akan dibuat dan dikirim ke super admin.
              </p>
            </div>
          )}
          <Input label="Nama Cabang" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jakarta Pusat" />
          <div>
            <Input
              label="Kode Cabang (untuk URL)"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="mis. kuningan"
              maxLength={24}
            />
            <p className="text-xs text-muted mt-1">URL kasir jadi seperti <span className="font-mono text-off-white">/{form.code || 'kode-cabang'}/kasir/pos</span></p>
          </div>
          <Input label="Alamat" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Jl. ..." />
          <Input label="Telepon" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="021-..." />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Jam Buka" type="time" value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} />
            <Input label="Jam Tutup" type="time" value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowFormModal(false)}>Batal</Button>
            <Button fullWidth onClick={handleSave} disabled={createBranch.isPending || updateBranch.isPending}>
              {createBranch.isPending || updateBranch.isPending ? 'Menyimpan...' : editBranch ? 'Simpan' : (!withinQuota && canAddon ? 'Lanjut →' : 'Tambah')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Fee Confirmation Modal ── */}
      <Modal
        isOpen={showFeeModal}
        onClose={() => !createBranch.isPending && (setShowFeeModal(false), setPendingForm(null))}
        title="Konfirmasi Cabang Berbayar"
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-4 bg-dark-card rounded-2xl border border-dark-border space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                <Building2 size={18} className="text-brand" />
              </div>
              <div>
                <p className="font-semibold text-off-white">{pendingForm?.name}</p>
                <p className="text-xs text-muted">{pendingForm?.address}</p>
              </div>
            </div>
            <div className="border-t border-dark-border pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Biaya cabang add-on</span>
                <span className="font-semibold text-brand">{formatRupiah(addonPrice)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Jenis biaya</span>
                <span className="text-off-white">{addonType === 'monthly' ? 'Per bulan' : 'Sekali bayar'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Paket aktif</span>
                <span className="text-off-white">{sub?.package}</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-400/5 border border-blue-400/20 rounded-xl">
            <Info size={13} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted">
              Cabang akan langsung dibuat namun status <strong className="text-amber-400">belum berlisensi</strong> sampai invoice dikonfirmasi oleh super admin.
              {addonType === 'monthly' && ' Tagihan berulang tiap bulan.'}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => { setShowFeeModal(false); setPendingForm(null) }} disabled={createBranch.isPending}>
              Batal
            </Button>
            <Button fullWidth icon={CreditCard} onClick={handleConfirmFee} disabled={createBranch.isPending}>
              {createBranch.isPending ? 'Memproses...' : 'Buat Cabang & Tagihan'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirm ── */}
      <Modal
        isOpen={!!showDelModal}
        onClose={() => !deleteBranch.isPending && setShowDelModal(null)}
        title="Hapus Cabang?"
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
            <p className="text-sm text-red-400 font-medium">Tindakan ini tidak dapat dibatalkan</p>
            <p className="text-xs text-muted mt-1">
              Cabang <strong className="text-off-white">{showDelModal?.name}</strong> akan dihapus beserta semua konfigurasinya.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setShowDelModal(null)} disabled={deleteBranch.isPending}>Batal</Button>
            <Button variant="danger" fullWidth onClick={() => handleDelete(showDelModal)} disabled={deleteBranch.isPending}>
              {deleteBranch.isPending ? 'Menghapus...' : 'Hapus'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

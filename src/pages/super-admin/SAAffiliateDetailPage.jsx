import React, { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Edit, ShieldOff, ShieldCheck, Key, Mail, Phone,
  Building2, TrendingUp, Wallet, Banknote, CheckCircle, XCircle,
  Eye, EyeOff, Copy, AlertCircle, Loader2,
} from 'lucide-react'
import {
  useAffiliate, useAffiliateReferrals, useAffiliateCommissions, useAffiliatePayouts,
  useUpdateAffiliate, useApproveAffiliate, useSuspendAffiliate, useReactivateAffiliate,
  useResetAffiliatePassword, useApproveCommission, useVoidCommission,
  useProcessPayout, useRejectPayout, useApproveClaim, useRejectClaim,
} from '../../hooks/useAffiliates.js'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge from '../../components/ui/Badge.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'

const PAYOUT_METHOD_LABEL = {
  bank_transfer: 'Transfer Bank',
  gopay: 'GoPay', ovo: 'OVO', dana: 'DANA',
}

function statusBadge(status) {
  if (status === 'active')    return <Badge variant="success" dot>Aktif</Badge>
  if (status === 'pending')   return <Badge variant="warning" dot>Menunggu</Badge>
  if (status === 'suspended') return <Badge variant="danger" dot>Dibekukan</Badge>
  if (status === 'rejected')  return <Badge variant="muted">Ditolak</Badge>
  return <Badge variant="muted">{status}</Badge>
}

function commStatusBadge(s) {
  if (s === 'pending')  return <Badge variant="warning">Menunggu</Badge>
  if (s === 'approved') return <Badge variant="info">Disetujui</Badge>
  if (s === 'paid')     return <Badge variant="success">Dibayar</Badge>
  if (s === 'void')     return <Badge variant="danger">Batal</Badge>
  return <Badge variant="muted">{s}</Badge>
}

function payoutStatusBadge(s) {
  if (s === 'requested')  return <Badge variant="warning">Diajukan</Badge>
  if (s === 'processing') return <Badge variant="info">Diproses</Badge>
  if (s === 'paid')       return <Badge variant="success">Dibayar</Badge>
  if (s === 'rejected')   return <Badge variant="danger">Ditolak</Badge>
  return <Badge variant="muted">{s}</Badge>
}

export default function SAAffiliateDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: aff, isLoading } = useAffiliate(id)
  const [tab, setTab] = useState('referrals')
  const [editing, setEditing] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [passwordResetInfo, setPasswordResetInfo] = useState(null)
  const [showPass, setShowPass] = useState(false)
  const [processPayout, setProcessPayout] = useState(null) // {payout, mode}

  const update = useUpdateAffiliate()
  const approve = useApproveAffiliate()
  const suspend = useSuspendAffiliate()
  const reactivate = useReactivateAffiliate()
  const resetPw = useResetAffiliatePassword()

  if (isLoading) {
    return <div className="space-y-4"><div className="h-12 bg-dark-card rounded-2xl animate-pulse" /><div className="h-48 bg-dark-card rounded-2xl animate-pulse" /></div>
  }
  if (!aff) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle size={28} className="text-amber-400 mx-auto mb-2" />
        <p className="text-off-white">Affiliate tidak ditemukan</p>
        <Link to="/super-admin/affiliates" className="text-gold text-sm mt-3 inline-block">← Kembali</Link>
      </Card>
    )
  }

  const run = async (mut, payload, ok, fail) => {
    try { await mut.mutateAsync(payload); toast.success(ok) }
    catch (err) { toast.error(err?.response?.data?.error || fail) }
  }

  const doResetPassword = async () => {
    try {
      const res = await resetPw.mutateAsync({ id: aff.id })
      setPasswordResetInfo(res)
      toast.success('Password direset')
    } catch (err) { toast.error(err?.response?.data?.error || 'Gagal mereset password') }
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="text-sm text-muted hover:text-off-white inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Kembali ke daftar affiliate
      </button>

      {/* Profile header */}
      <Card className="p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <p className="font-mono text-xl font-bold text-gold">{aff.referralCode}</p>
              {statusBadge(aff.status)}
              <Badge variant="info">Komisi {Math.round(aff.commissionRate * 100)}%</Badge>
            </div>
            <h1 className="font-display text-2xl font-bold text-off-white">{aff.displayName || aff.user.name}</h1>
            <div className="text-xs text-muted mt-1 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1"><Mail size={12} /> {aff.user.email}</span>
              {aff.user.phone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {aff.user.phone}</span>}
              <span>Bergabung {new Date(aff.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            {aff.bio && <p className="text-sm text-muted mt-3 max-w-2xl">{aff.bio}</p>}
          </div>
          <div className="flex flex-col gap-2 min-w-[180px]">
            <Button size="sm" variant="outline" icon={Edit} onClick={() => setEditing(true)}>Edit profil</Button>
            <Button size="sm" variant="ghost" icon={Key} onClick={() => setConfirmAction({
              title: 'Reset password?',
              description: 'Password baru akan ditampilkan sekali — pastikan disalin & dikirim ke affiliate.',
              run: doResetPassword,
            })}>Reset password</Button>
            {aff.status === 'pending' && (
              <Button size="sm" variant="primary" icon={CheckCircle}
                loading={approve.isPending}
                onClick={() => run(approve, { id: aff.id }, 'Disetujui', 'Gagal menyetujui')}>
                Setujui pendaftaran
              </Button>
            )}
            {aff.status === 'active' && (
              <Button size="sm" variant="danger" icon={ShieldOff}
                onClick={() => setConfirmAction({
                  title: `Bekukan ${aff.referralCode}?`,
                  description: 'Komisi baru tak akan tercatat selama dibekukan.',
                  run: () => run(suspend, { id: aff.id }, 'Dibekukan', 'Gagal membekukan'),
                })}>Bekukan</Button>
            )}
            {(aff.status === 'suspended' || aff.status === 'rejected') && (
              <Button size="sm" variant="primary" icon={ShieldCheck}
                onClick={() => run(reactivate, { id: aff.id }, 'Diaktifkan', 'Gagal mengaktifkan')}>Aktifkan</Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Stat label="Tenant Rujukan" value={aff._count.referrals} icon={Building2} />
          <Stat label="Komisi Diakui" value={formatRupiahShort(aff.totalEarned)} icon={TrendingUp} sub={formatRupiah(aff.totalEarned)} />
          <Stat label="Sudah Dibayar" value={formatRupiahShort(aff.totalPaid)} icon={Wallet} sub={formatRupiah(aff.totalPaid)} />
          <Stat label="Komisi Tercatat" value={aff._count.commissions} icon={Banknote} />
        </div>

        {/* Payout method */}
        <div className="mt-5 pt-5 border-t border-dark-border grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted mb-1">Metode pencairan</p>
            {aff.payoutMethod ? (
              <div className="space-y-0.5 text-sm">
                <p className="text-off-white">{PAYOUT_METHOD_LABEL[aff.payoutMethod] || aff.payoutMethod}</p>
                <p className="text-off-white font-mono">{aff.payoutAccount}</p>
                <p className="text-xs text-muted">a.n. {aff.payoutHolder || '—'}</p>
              </div>
            ) : <p className="text-sm text-muted italic">Belum diisi oleh affiliate</p>}
          </div>
          <div>
            <p className="text-xs text-muted mb-1">Catatan internal</p>
            <p className="text-sm text-off-white whitespace-pre-wrap">{aff.internalNotes || <span className="text-muted italic">— Belum ada catatan</span>}</p>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-dark-border overflow-x-auto">
        {[
          { id: 'referrals',   label: `Tenant Rujukan (${aff._count.referrals})` },
          { id: 'commissions', label: `Komisi (${aff._count.commissions})` },
          { id: 'payouts',     label: `Payout (${aff._count.payouts})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-off-white'
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === 'referrals' && <ReferralsTab id={id} />}
      {tab === 'commissions' && <CommissionsTab id={id} />}
      {tab === 'payouts' && <PayoutsTab id={id} onProcess={p => setProcessPayout(p)} />}

      {/* Edit modal */}
      <EditModal affiliate={aff} isOpen={editing} onClose={() => setEditing(false)} updateMutation={update} />

      {/* Password reset result */}
      <Modal isOpen={!!passwordResetInfo} onClose={() => { setPasswordResetInfo(null); setShowPass(false) }} title="Password baru" size="sm">
        <div className="space-y-3">
          <p className="text-xs text-muted">Salin sekarang — password ini tidak akan ditampilkan kembali.</p>
          <div className="flex items-center gap-2 bg-dark-surface border border-gold/30 rounded-xl p-3">
            <code className="flex-1 font-mono text-base text-gold">
              {showPass ? passwordResetInfo?.password : '•'.repeat(Math.max(8, (passwordResetInfo?.password || '').length))}
            </code>
            <button onClick={() => setShowPass(s => !s)} className="text-muted hover:text-off-white">
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => {
              navigator.clipboard.writeText(passwordResetInfo?.password || '').catch(() => {})
              toast.success('Tersalin')
            }} className="text-muted hover:text-off-white"><Copy size={14} /></button>
          </div>
          <Button fullWidth onClick={() => { setPasswordResetInfo(null); setShowPass(false) }}>Tutup</Button>
        </div>
      </Modal>

      {/* Payout process modal */}
      <PayoutActionModal payout={processPayout} onClose={() => setProcessPayout(null)} />

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => { await confirmAction.run(); setConfirmAction(null) }}
        title={confirmAction?.title}
        description={confirmAction?.description}
        confirmText="Ya"
        cancelText="Batal"
        variant="danger"
      />
    </div>
  )
}

// ── Referrals tab ─────────────────────────────────────────────────────────
function refStatusBadge(s) {
  if (s === 'active')   return <Badge variant="success" dot>Aktif</Badge>
  if (s === 'pending')  return <Badge variant="warning" dot>Klaim menunggu</Badge>
  if (s === 'rejected') return <Badge variant="danger">Ditolak</Badge>
  if (s === 'churned')  return <Badge variant="muted">Berhenti</Badge>
  return <Badge variant="muted">{s || '—'}</Badge>
}

function ReferralsTab({ id }) {
  const toast = useToast()
  const { data = [], isLoading } = useAffiliateReferrals(id)
  const approveClaim = useApproveClaim()
  const rejectClaim  = useRejectClaim()
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectNote, setRejectNote] = useState('')

  const pendingCount = data.filter(r => r.status === 'pending').length

  const doApprove = async (r) => {
    try { await approveClaim.mutateAsync({ rid: r.id }); toast.success('Klaim disetujui — komisi mulai dihitung.') }
    catch (e) { toast.error(e?.response?.data?.error || 'Gagal menyetujui') }
  }

  if (isLoading) return <SkeletonTable />
  if (!data.length) return <Card className="p-8 text-center text-muted">Belum ada tenant yang direkrut.</Card>
  return (
    <>
      {pendingCount > 0 && (
        <div className="mb-3 flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{pendingCount} klaim manual menunggu peninjauan. Verifikasi sebelum menyetujui — komisi baru jalan setelah disetujui.</span>
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-dark-surface text-xs text-muted">
              <tr>
                <Th>Tenant</Th>
                <Th>Sumber</Th>
                <Th>Status</Th>
                <Th>Langganan</Th>
                <Th right>Total Komisi</Th>
                <Th>Bergabung</Th>
                <Th right>Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.id} className="border-t border-dark-border hover:bg-dark-surface/40">
                  <Td>
                    <p className="text-off-white font-medium">{r.tenant?.name || '—'}</p>
                    <p className="text-xs text-muted">{r.tenant?.slug ? `${r.tenant.slug}.sembapos.com` : ''}</p>
                    {r.status === 'pending' && r.claimNote && (
                      <p className="text-[11px] text-muted mt-0.5 italic max-w-[260px]">“{r.claimNote}”</p>
                    )}
                  </Td>
                  <Td>{r.source === 'manual'
                    ? <Badge variant="gold">Klaim manual</Badge>
                    : <span className="text-xs text-muted">Link</span>}</Td>
                  <Td>{refStatusBadge(r.status)}</Td>
                  <Td>
                    <Badge variant={r.tenant?.subscription?.status === 'active' ? 'success' : r.tenant?.subscription?.status === 'trial' ? 'info' : 'muted'}>
                      {r.tenant?.subscription?.status || '—'}
                    </Badge>
                  </Td>
                  <Td right><span className="text-gold tabular-nums">{formatRupiah(r.totalCommission)}</span></Td>
                  <Td className="text-xs text-muted">{new Date(r.createdAt).toLocaleDateString('id-ID')}</Td>
                  <Td right>
                    {r.status === 'pending' ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => doApprove(r)} disabled={approveClaim.isPending}
                          className="text-[11px] px-2 py-0.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20">Setujui</button>
                        <button onClick={() => { setRejectTarget(r); setRejectNote('') }}
                          className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20">Tolak</button>
                      </div>
                    ) : <span className="text-muted text-xs">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Tolak klaim?" size="sm">
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Tolak klaim <span className="text-off-white">{rejectTarget?.tenant?.name || rejectTarget?.tenant?.slug}</span>.
            Alasan akan ditampilkan ke affiliate.
          </p>
          <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} maxLength={500}
            className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white placeholder-muted"
            placeholder="Mis. tenant ini bukan hasil rujukan Anda." />
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setRejectTarget(null)}>Batal</Button>
            <Button variant="danger" fullWidth loading={rejectClaim.isPending}
              onClick={async () => {
                try {
                  await rejectClaim.mutateAsync({ rid: rejectTarget.id, note: rejectNote || 'Klaim ditolak admin' })
                  toast.success('Klaim ditolak')
                  setRejectTarget(null)
                } catch (e) { toast.error(e?.response?.data?.error || 'Gagal') }
              }}>Tolak klaim</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Commissions tab ───────────────────────────────────────────────────────
function CommissionsTab({ id }) {
  const toast = useToast()
  const [status, setStatus] = useState('all')
  const { data = [], isLoading } = useAffiliateCommissions(id, status === 'all' ? undefined : status)
  const approve = useApproveCommission()
  const void_   = useVoidCommission()
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        {['all', 'pending', 'approved', 'paid', 'void'].map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1 text-xs rounded-full border ${
              status === s ? 'bg-gold/15 text-gold border-gold/40' : 'border-dark-border text-muted hover:text-off-white'
            }`}>{s === 'all' ? 'Semua' : s}</button>
        ))}
      </div>
      {isLoading ? <SkeletonTable /> : !data.length ? (
        <Card className="p-8 text-center text-muted">Tidak ada komisi pada filter ini.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-surface text-xs text-muted">
                <tr>
                  <Th>Tanggal</Th>
                  <Th>Tenant</Th>
                  <Th>Periode</Th>
                  <Th right>Dasar</Th>
                  <Th right>Komisi</Th>
                  <Th>Status</Th>
                  <Th right>Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {data.map(c => (
                  <tr key={c.id} className="border-t border-dark-border hover:bg-dark-surface/40">
                    <Td className="text-xs">{new Date(c.createdAt).toLocaleDateString('id-ID')}</Td>
                    <Td>{c.referral?.tenant?.name || '—'}</Td>
                    <Td className="text-xs">{c.period || '—'}</Td>
                    <Td right className="tabular-nums">{formatRupiah(c.baseAmount)}</Td>
                    <Td right><span className="text-gold tabular-nums">{formatRupiah(c.amount)}</span></Td>
                    <Td>{commStatusBadge(c.status)}</Td>
                    <Td right>
                      {c.status === 'pending' && (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={async () => {
                              try { await approve.mutateAsync(c.id); toast.success('Komisi disetujui') }
                              catch (e) { toast.error(e?.response?.data?.error || 'Gagal') }
                            }}
                            className="text-[11px] px-2 py-0.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20"
                          >Setujui</button>
                          <button
                            onClick={() => { setVoidTarget(c); setVoidReason('') }}
                            className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
                          >Batalkan</button>
                        </div>
                      )}
                      {c.status === 'approved' && (
                        <button
                          onClick={() => { setVoidTarget(c); setVoidReason('') }}
                          className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
                        >Batalkan</button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal isOpen={!!voidTarget} onClose={() => setVoidTarget(null)} title="Batalkan komisi?" size="sm">
        <div className="space-y-3">
          <p className="text-xs text-muted">Alasan singkat — akan tampil di histori affiliate.</p>
          <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} rows={3} maxLength={500}
            className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white" />
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setVoidTarget(null)}>Batal</Button>
            <Button variant="danger" fullWidth loading={void_.isPending}
              onClick={async () => {
                try {
                  await void_.mutateAsync({ cid: voidTarget.id, reason: voidReason || 'Dibatalkan oleh admin' })
                  toast.success('Komisi dibatalkan')
                  setVoidTarget(null)
                } catch (e) { toast.error(e?.response?.data?.error || 'Gagal') }
              }}>Batalkan komisi</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// ── Payouts tab ───────────────────────────────────────────────────────────
function PayoutsTab({ id, onProcess }) {
  const { data = [], isLoading } = useAffiliatePayouts(id)
  if (isLoading) return <SkeletonTable />
  if (!data.length) return <Card className="p-8 text-center text-muted">Belum ada permintaan pencairan.</Card>
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-dark-surface text-xs text-muted">
            <tr>
              <Th>Diajukan</Th>
              <Th right>Nominal</Th>
              <Th>Metode</Th>
              <Th>Status</Th>
              <Th>Diproses</Th>
              <Th right>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id} className="border-t border-dark-border hover:bg-dark-surface/40">
                <Td className="text-xs">{new Date(p.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</Td>
                <Td right><span className="text-gold tabular-nums">{formatRupiah(p.amount)}</span></Td>
                <Td>
                  <p className="text-off-white text-xs">{PAYOUT_METHOD_LABEL[p.method] || p.method}</p>
                  <p className="text-muted text-[11px] font-mono">{p.account}</p>
                </Td>
                <Td>{payoutStatusBadge(p.status)}</Td>
                <Td className="text-xs text-muted">
                  {p.processedAt ? new Date(p.processedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short' }) : '—'}
                  {p.adminNote && <p className="text-[10px] truncate max-w-[140px]" title={p.adminNote}>{p.adminNote}</p>}
                </Td>
                <Td right>
                  {(p.status === 'requested' || p.status === 'processing') && (
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => onProcess({ ...p, mode: 'paid' })}
                        className="text-[11px] px-2 py-0.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20"
                      >Tandai dibayar</button>
                      <button
                        onClick={() => onProcess({ ...p, mode: 'reject' })}
                        className="text-[11px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
                      >Tolak</button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function PayoutActionModal({ payout, onClose }) {
  const toast = useToast()
  const [adminNote, setAdminNote] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const processMut = useProcessPayout()
  const rejectMut  = useRejectPayout()

  React.useEffect(() => {
    if (payout) { setAdminNote(''); setProofUrl('') }
  }, [payout?.id])

  if (!payout) return null
  const isReject = payout.mode === 'reject'
  return (
    <Modal isOpen={!!payout} onClose={onClose} title={isReject ? 'Tolak permintaan payout' : 'Tandai payout dibayar'} size="md">
      <div className="space-y-3">
        <div className="bg-dark-surface rounded-xl p-3 text-sm space-y-1">
          <p className="text-off-white">Nominal: <span className="text-gold font-semibold">{formatRupiah(payout.amount)}</span></p>
          <p className="text-muted text-xs">Tujuan: {PAYOUT_METHOD_LABEL[payout.method] || payout.method} · {payout.account} {payout.holder ? `(${payout.holder})` : ''}</p>
        </div>
        {!isReject && (
          <Input label="URL bukti transfer (opsional)" value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="https://…" />
        )}
        <div>
          <label className="text-xs text-muted block mb-1.5">Catatan untuk affiliate</label>
          <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} maxLength={500}
            className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={onClose}>Batal</Button>
          <Button
            variant={isReject ? 'danger' : 'primary'}
            fullWidth
            loading={processMut.isPending || rejectMut.isPending}
            onClick={async () => {
              try {
                if (isReject) await rejectMut.mutateAsync({ pid: payout.id, adminNote: adminNote || 'Ditolak oleh admin' })
                else await processMut.mutateAsync({ pid: payout.id, adminNote: adminNote || undefined, proofUrl: proofUrl || undefined })
                toast.success(isReject ? 'Payout ditolak' : 'Payout ditandai dibayar')
                onClose()
              } catch (e) {
                toast.error(e?.response?.data?.error || 'Gagal memproses')
              }
            }}
          >
            {isReject ? 'Tolak Permintaan' : 'Tandai Dibayar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────
function EditModal({ affiliate, isOpen, onClose, updateMutation }) {
  const toast = useToast()
  const [form, setForm] = useState(null)

  React.useEffect(() => {
    if (affiliate && isOpen) {
      setForm({
        name: affiliate.user.name,
        phone: affiliate.user.phone || '',
        displayName: affiliate.displayName || '',
        bio: affiliate.bio || '',
        commissionRate: Math.round(affiliate.commissionRate * 100),
        payoutMethod: affiliate.payoutMethod || '',
        payoutAccount: affiliate.payoutAccount || '',
        payoutHolder: affiliate.payoutHolder || '',
        internalNotes: affiliate.internalNotes || '',
      })
    }
  }, [affiliate?.id, isOpen])

  if (!form) return null
  const submit = async () => {
    try {
      await updateMutation.mutateAsync({
        id: affiliate.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        displayName: form.displayName.trim() || undefined,
        bio: form.bio.trim() || undefined,
        commissionRate: Number(form.commissionRate) / 100,
        payoutMethod: form.payoutMethod || undefined,
        payoutAccount: form.payoutAccount.trim() || undefined,
        payoutHolder: form.payoutHolder.trim() || undefined,
        internalNotes: form.internalNotes,
      })
      toast.success('Profil disimpan')
      onClose()
    } catch (e) { toast.error(e?.response?.data?.error || 'Gagal menyimpan') }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit profil affiliate" size="lg">
      <div className="space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <Input label="Nama" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="HP / WhatsApp" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <Input label="Nama publik" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
          <Input label="Komisi (%)" type="number" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">Bio</label>
          <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={2}
            className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white" />
        </div>
        <div className="border-t border-dark-border pt-3">
          <p className="text-xs text-muted mb-2">Metode pencairan</p>
          <div className="grid md:grid-cols-3 gap-3">
            <select value={form.payoutMethod} onChange={e => setForm(f => ({ ...f, payoutMethod: e.target.value }))}
              className="bg-dark-surface border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white">
              <option value="">— Pilih —</option>
              <option value="bank_transfer">Transfer Bank</option>
              <option value="gopay">GoPay</option>
              <option value="ovo">OVO</option>
              <option value="dana">DANA</option>
            </select>
            <Input value={form.payoutAccount} onChange={e => setForm(f => ({ ...f, payoutAccount: e.target.value }))} placeholder="No. rekening" />
            <Input value={form.payoutHolder} onChange={e => setForm(f => ({ ...f, payoutHolder: e.target.value }))} placeholder="Nama pemilik" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">Catatan internal</label>
          <textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))} rows={2}
            className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={onClose}>Batal</Button>
          <Button fullWidth icon={CheckCircle} loading={updateMutation.isPending} onClick={submit}>Simpan</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── helpers ───────────────────────────────────────────────────────────────
function Stat({ label, value, sub, icon: Icon }) {
  return (
    <div className="bg-dark-surface rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
        {Icon && <Icon size={13} className="text-muted" />}
      </div>
      <p className="text-base font-bold text-off-white tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}
function Th({ children, right }) {
  return <th className={`px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}
function Td({ children, right, className = '' }) {
  return <td className={`px-3 py-2.5 ${right ? 'text-right' : ''} ${className}`}>{children}</td>
}
function SkeletonTable() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-dark-card animate-pulse rounded-xl" />)}
    </div>
  )
}

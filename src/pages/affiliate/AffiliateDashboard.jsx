import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, Wallet, TrendingUp, Clock, Copy, ExternalLink,
  Share2, CheckCircle, ArrowUpRight, Sparkles, AlertCircle,
  MessageCircle, Facebook,
} from 'lucide-react'
import {
  useAffiliateMe, useAffiliateSelfStats, useAffiliateChart,
  useAffiliateSelfReferrals, useRequestPayout,
} from '../../hooks/useAffiliates.js'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Modal from '../../components/ui/Modal.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'
import { PLATFORM_DOMAIN } from '../../utils/platform.js'

export default function AffiliateDashboard() {
  const toast = useToast()
  const { data: me, isLoading: meLoading } = useAffiliateMe()
  const { data: stats, isLoading: statsLoading } = useAffiliateSelfStats()
  const { data: chart = [], isLoading: chartLoading } = useAffiliateChart(30)
  const { data: refs = [], isLoading: refsLoading } = useAffiliateSelfReferrals()
  const requestPayout = useRequestPayout()

  const [payoutOpen, setPayoutOpen] = useState(false)
  const [payoutNote, setPayoutNote] = useState('')
  const [copiedKind, setCopiedKind] = useState(null)

  // Selalu pakai PLATFORM_DOMAIN (sembapos.com) — landing & form register hanya
  // tersedia di main domain, bukan subdomain tenant. Cara lama strip subdomain
  // dari window.location.host bisa salah saat di main domain itu sendiri (mis.
  // "sembapos.com" → "com").
  const refUrl  = me ? `https://${PLATFORM_DOMAIN}/register?ref=${me.referralCode}` : ''
  const shareMessage = me
    ? `Halo! Lagi kelola barbershop? Coba SembaPOS — kasir, antrian, booking online, semua jadi satu aplikasi. Daftar via link saya, gratis 14 hari trial:\n${refUrl}`
    : ''

  const handleCopy = async (text, kind) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKind(kind)
      setTimeout(() => setCopiedKind(null), 1500)
    } catch { /* noop */ }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'SembaPOS', text: shareMessage, url: refUrl }) } catch { /* canceled */ }
    } else {
      handleCopy(shareMessage, 'message')
      toast.success('Pesan tersalin — siap tempel ke chat/postingan')
    }
  }

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener')
  }
  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(refUrl)}`, '_blank', 'noopener')
  }
  const shareTelegram = () => {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(refUrl)}&text=${encodeURIComponent(shareMessage)}`, '_blank', 'noopener')
  }

  // Normalize chart for sparkline render.
  const chartMax = useMemo(() => Math.max(1, ...chart.map(d => d.commission)), [chart])

  const submitPayout = async () => {
    try {
      await requestPayout.mutateAsync({ note: payoutNote.trim() || undefined })
      toast.success('Permintaan pencairan dikirim. Tim kami akan memprosesnya secepatnya.')
      setPayoutOpen(false); setPayoutNote('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Gagal mengajukan pencairan')
    }
  }

  const isLoading = meLoading || statsLoading

  if (me && me.status === 'pending') {
    return (
      <Card className="p-8 text-center max-w-md mx-auto">
        <Clock size={28} className="mx-auto text-amber-400 mb-3" />
        <h1 className="font-display text-xl font-bold text-off-white">Akun Anda menunggu persetujuan</h1>
        <p className="text-muted text-sm mt-2">Tim kami akan meninjau pendaftaran dan mengaktifkan akun Anda secepatnya. Anda akan menerima email saat akun aktif.</p>
      </Card>
    )
  }

  if (me && me.status === 'suspended') {
    return (
      <Card className="p-8 text-center max-w-md mx-auto">
        <AlertCircle size={28} className="mx-auto text-red-400 mb-3" />
        <h1 className="font-display text-xl font-bold text-off-white">Akun affiliate Anda dibekukan</h1>
        <p className="text-muted text-sm mt-2">Komisi baru tidak akan terhitung selama dibekukan. Hubungi tim BarberOS untuk informasi lebih lanjut.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">
            Halo, {me?.user.name?.split(' ')[0] || 'Mitra'}!
          </h1>
          <p className="text-muted text-sm mt-1">Kelola rujukan dan komisi Anda di sini.</p>
        </div>
        <Badge variant="gold">Komisi {me ? Math.round(me.commissionRate * 100) : 0}%</Badge>
      </div>

      {/* Hero — referral link */}
      {me && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 border-gold/30 bg-gradient-to-br from-gold/10 via-dark-card to-dark-card">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-gold" />
              <p className="text-xs text-gold uppercase tracking-wide font-semibold">Link rujukan Anda</p>
            </div>

            {/* URL bar */}
            <div className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-xl p-3 mb-3">
              <code className="flex-1 font-mono text-sm text-gold truncate select-all">{refUrl}</code>
              <button onClick={() => handleCopy(refUrl, 'link')}
                className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-dark-card border border-dark-border text-xs text-muted hover:text-off-white">
                {copiedKind === 'link' ? <><CheckCircle size={12} className="text-green-400" /> Tersalin</> : <><Copy size={12} /> Salin</>}
              </button>
            </div>

            {/* Share buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={shareWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-300 text-xs hover:bg-green-500/25 transition-colors">
                <MessageCircle size={12} /> WhatsApp
              </button>
              <button onClick={shareTelegram}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-500/25 transition-colors">
                <Share2 size={12} /> Telegram
              </button>
              <button onClick={shareFacebook}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs hover:bg-indigo-500/25 transition-colors">
                <Facebook size={12} /> Facebook
              </button>
              <button onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-card border border-dark-border text-xs text-muted hover:text-off-white">
                <Share2 size={12} /> Lainnya
              </button>
              <button onClick={() => handleCopy(shareMessage, 'message')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-card border border-dark-border text-xs text-muted hover:text-off-white">
                <Copy size={11} /> Salin pesan ajakan
                {copiedKind === 'message' && <CheckCircle size={11} className="text-green-400" />}
              </button>
            </div>

            {/* Code & open page */}
            <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-dark-border">
              <button onClick={() => handleCopy(me.referralCode, 'code')}
                className="px-3 py-1.5 rounded-xl bg-dark-surface border border-dark-border text-xs text-muted hover:text-off-white inline-flex items-center gap-1.5">
                <Copy size={11} />
                Kode: <span className="font-mono text-gold font-bold">{me.referralCode}</span>
                {copiedKind === 'code' && <CheckCircle size={11} className="text-green-400" />}
              </button>
              <a href={refUrl} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 rounded-xl bg-dark-surface border border-dark-border text-xs text-muted hover:text-off-white inline-flex items-center gap-1.5">
                <ExternalLink size={11} /> Buka halaman daftar
              </a>
            </div>

            <p className="text-[11px] text-muted mt-3">Setiap tenant yang daftar via link Anda dan membayar langganan, Anda dapat komisi {me ? Math.round(me.commissionRate * 100) : 0}% dari nilai invoice — selama mereka berlangganan.</p>
          </Card>
        </motion.div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Rujukan" sub={`+${stats?.referrals.last30 || 0} dalam 30 hari`} value={stats?.referrals.total ?? '—'} color="text-gold" icon={Users} loading={isLoading} delay={0} />
        <KpiCard label="Komisi Bulan Lalu" value={formatRupiahShort(stats?.commissionApproved.amount || 0)} sub={`${stats?.commissionApproved.count || 0} transaksi`} color="text-emerald-400" icon={TrendingUp} loading={isLoading} delay={0.05} />
        <KpiCard label="Saldo Siap Tarik" value={formatRupiahShort(stats?.balance || 0)} sub={formatRupiah(stats?.balance || 0)} color="text-blue-400" icon={Wallet} loading={isLoading} delay={0.10} />
        <KpiCard label="Sudah Diterima" value={formatRupiahShort(stats?.commissionPaid.amount || 0)} sub={formatRupiah(stats?.commissionPaid.amount || 0)} color="text-purple-400" icon={CheckCircle} loading={isLoading} delay={0.15} />
      </div>

      {/* Chart */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-off-white">Tren 30 hari terakhir</p>
            <p className="text-xs text-muted">Komisi & rujukan harian</p>
          </div>
          <ChartLegend />
        </div>
        {chartLoading ? (
          <div className="h-48 bg-dark-surface animate-pulse rounded-xl" />
        ) : (
          <Sparkline data={chart} max={chartMax} />
        )}
      </Card>

      {/* Saldo + payout */}
      <Card className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-muted">Saldo siap dicairkan</p>
            <p className="font-display text-3xl font-bold text-gold mt-1">{formatRupiah(stats?.balance || 0)}</p>
            <p className="text-xs text-muted mt-1">Minimum pencairan: {formatRupiah(stats?.minPayout || 100000)}</p>
          </div>
          <div className="flex flex-col gap-2 min-w-[200px]">
            <Button icon={ArrowUpRight} fullWidth disabled={!stats || stats.balance < (stats.minPayout || 100000) || (stats.payoutPending?.count || 0) > 0}
              onClick={() => setPayoutOpen(true)}>
              {stats?.payoutPending?.count ? 'Ada payout berjalan' : 'Ajukan pencairan'}
            </Button>
            <Link to="/affiliate/payouts" className="text-xs text-muted hover:text-off-white text-center inline-flex items-center justify-center gap-1">
              Riwayat pencairan <ArrowUpRight size={11} />
            </Link>
          </div>
        </div>
        {!me?.payoutMethod && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>Anda belum mengatur metode pencairan. <Link to="/affiliate/profile" className="underline">Lengkapi profil →</Link></span>
          </div>
        )}
      </Card>

      {/* Recent referrals */}
      <Card>
        <div className="px-5 py-3 border-b border-dark-border flex items-center justify-between">
          <p className="font-semibold text-off-white">Rujukan terbaru</p>
          <Link to="/affiliate/referrals" className="text-xs text-gold hover:underline">Lihat semua →</Link>
        </div>
        {refsLoading ? (
          <div className="p-5 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-dark-surface animate-pulse rounded-lg" />)}</div>
        ) : refs.length === 0 ? (
          <div className="p-8 text-center text-muted">
            <Users size={28} className="mx-auto opacity-30 mb-2" />
            <p className="text-sm">Belum ada tenant yang daftar via link Anda.</p>
            <p className="text-xs mt-1">Bagikan link rujukan di atas untuk mulai dapat komisi.</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-border">
            {refs.slice(0, 5).map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between hover:bg-dark-surface/40">
                <div className="min-w-0">
                  <p className="text-sm text-off-white truncate">{r.tenant?.name}</p>
                  <p className="text-xs text-muted">
                    {r.tenant?.subscription?.package || '—'} ·
                    <span className="ml-1">{new Date(r.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                  </p>
                </div>
                <span className="text-gold tabular-nums text-sm">{formatRupiah(r.totalCommission)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Payout request modal */}
      <Modal isOpen={payoutOpen} onClose={() => setPayoutOpen(false)} title="Ajukan pencairan" size="md">
        <div className="space-y-3">
          <div className="bg-dark-surface rounded-xl p-3 text-sm">
            <p className="text-muted text-xs">Nominal pencairan</p>
            <p className="text-gold text-2xl font-bold tabular-nums mt-0.5">{formatRupiah(stats?.balance || 0)}</p>
          </div>
          {me?.payoutMethod ? (
            <div className="bg-dark-surface rounded-xl p-3 text-sm">
              <p className="text-muted text-xs">Akan ditransfer ke</p>
              <p className="text-off-white mt-0.5">{me.payoutMethod === 'bank_transfer' ? 'Transfer Bank' : me.payoutMethod.toUpperCase()}</p>
              <p className="text-off-white font-mono">{me.payoutAccount}</p>
              <p className="text-xs text-muted">a.n. {me.payoutHolder || '—'}</p>
            </div>
          ) : (
            <p className="text-xs text-red-400">Metode pencairan belum diisi. Lengkapi profil dulu.</p>
          )}
          <div>
            <label className="text-xs text-muted block mb-1.5">Catatan untuk tim BarberOS (opsional)</label>
            <textarea value={payoutNote} onChange={e => setPayoutNote(e.target.value)} rows={2} maxLength={500}
              className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40"
              placeholder="Mis. mohon transfer secepatnya" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setPayoutOpen(false)}>Batal</Button>
            <Button fullWidth loading={requestPayout.isPending} disabled={!me?.payoutMethod} onClick={submitPayout}>Kirim Permintaan</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function KpiCard({ label, value, sub, color, icon: Icon, loading, delay }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Icon size={15} className={color} />
        </div>
        {loading ? (
          <div className="h-7 w-24 bg-dark-surface animate-pulse rounded" />
        ) : (
          <>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value ?? '—'}</p>
            {sub && <p className="text-[10px] text-muted mt-1 truncate">{sub}</p>}
          </>
        )}
      </Card>
    </motion.div>
  )
}

function ChartLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="inline-flex items-center gap-1 text-muted">
        <span className="w-3 h-3 rounded bg-gold/70" /> Komisi
      </span>
      <span className="inline-flex items-center gap-1 text-muted">
        <span className="w-3 h-3 rounded bg-blue-400/50" /> Rujukan
      </span>
    </div>
  )
}

function Sparkline({ data, max }) {
  if (!data?.length) return <div className="h-48 flex items-center justify-center text-muted text-sm">Belum ada aktivitas</div>
  const refMax = Math.max(1, ...data.map(d => d.referrals))
  return (
    <div className="grid grid-cols-30 gap-1 items-end h-48 px-1" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
      {data.map((d, i) => (
        <div key={d.date} className="flex flex-col gap-0.5 items-center group relative" title={`${d.date} — Komisi ${d.commission.toLocaleString('id-ID')}, ${d.referrals} rujukan`}>
          <div className="flex-1 w-full flex flex-col-reverse gap-0.5">
            <div className="w-full bg-gold/70 rounded-t" style={{ height: `${(d.commission / max) * 100}%` }} />
            <div className="w-full bg-blue-400/50 rounded-t" style={{ height: `${(d.referrals / refMax) * 30}%` }} />
          </div>
          {(i === 0 || i === data.length - 1) && (
            <span className="text-[9px] text-muted truncate">{d.date.slice(5)}</span>
          )}
        </div>
      ))}
    </div>
  )
}

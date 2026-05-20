import React, { useEffect, useState } from 'react'
import { CheckCircle, Save, Copy } from 'lucide-react'
import { useAffiliateMe, useUpdateAffiliateMe } from '../../hooks/useAffiliates.js'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import { useToast } from '../../components/ui/Toast.jsx'

const METHOD_OPTS = [
  { id: '',              label: '— Pilih metode —' },
  { id: 'bank_transfer', label: 'Transfer Bank' },
  { id: 'gopay',         label: 'GoPay' },
  { id: 'ovo',           label: 'OVO' },
  { id: 'dana',          label: 'DANA' },
]

export default function AffiliateProfilePage() {
  const toast = useToast()
  const { data: me, isLoading } = useAffiliateMe()
  const update = useUpdateAffiliateMe()
  const [form, setForm] = useState(null)

  useEffect(() => {
    if (me) setForm({
      displayName: me.displayName || me.user.name || '',
      bio: me.bio || '',
      phone: me.user.phone || '',
      payoutMethod: me.payoutMethod || '',
      payoutAccount: me.payoutAccount || '',
      payoutHolder: me.payoutHolder || '',
    })
  }, [me?.id])

  if (isLoading || !form) {
    return <div className="h-64 bg-dark-card animate-pulse rounded-2xl" />
  }

  const submit = async () => {
    try {
      await update.mutateAsync({
        displayName: form.displayName.trim() || undefined,
        bio: form.bio.trim() || undefined,
        phone: form.phone.trim() || undefined,
        payoutMethod: form.payoutMethod || undefined,
        payoutAccount: form.payoutAccount.trim() || undefined,
        payoutHolder: form.payoutHolder.trim() || undefined,
      })
      toast.success('Profil disimpan')
    } catch (e) { toast.error(e?.response?.data?.error || 'Gagal menyimpan') }
  }

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(me.referralCode); toast.success('Kode tersalin') } catch { /* noop */ }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">Profil Affiliate</h1>
        <p className="text-muted text-sm mt-1">Atur informasi & metode pencairan saldo komisi Anda.</p>
      </div>

      <Card className="p-5 border-gold/20">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-muted">Kode rujukan Anda</p>
            <p className="font-mono text-2xl font-bold text-gold mt-1">{me.referralCode}</p>
            <p className="text-[11px] text-muted mt-0.5">Komisi: {Math.round(me.commissionRate * 100)}% per pembayaran</p>
          </div>
          <Button variant="outline" size="sm" icon={Copy} onClick={copyCode}>Salin kode</Button>
        </div>
      </Card>

      <Card className="p-5">
        <p className="font-semibold text-off-white mb-3">Informasi tampilan</p>
        <div className="grid md:grid-cols-2 gap-3">
          <Input label="Nama publik (tampil di halaman daftar)" value={form.displayName}
            onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
          <Input label="No. WhatsApp" value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08xxx" />
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-muted block mb-1.5">Bio singkat</label>
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} maxLength={500}
              className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white focus:outline-none focus:border-gold/40" />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="font-semibold text-off-white mb-1">Metode pencairan</p>
        <p className="text-xs text-muted mb-3">Saldo komisi akan ditransfer ke akun ini saat Anda ajukan payout.</p>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-muted block mb-1.5">Metode</label>
            <select value={form.payoutMethod} onChange={e => setForm(f => ({ ...f, payoutMethod: e.target.value }))}
              className="w-full bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 text-sm text-off-white">
              {METHOD_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <Input label="Nomor rekening / akun" value={form.payoutAccount}
            onChange={e => setForm(f => ({ ...f, payoutAccount: e.target.value }))} placeholder="No. rekening" />
          <Input label="Nama pemilik" value={form.payoutHolder}
            onChange={e => setForm(f => ({ ...f, payoutHolder: e.target.value }))} placeholder="Sesuai rekening" />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button icon={Save} loading={update.isPending} onClick={submit}>Simpan perubahan</Button>
      </div>
    </div>
  )
}

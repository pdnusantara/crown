import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, User, Mail, Phone, Lock, CheckCircle, AlertCircle,
  Loader2, Eye, EyeOff, PartyPopper, Sparkles, Banknote, Users, TrendingUp,
} from 'lucide-react'
import { useAffiliateRegister } from '../../hooks/useAffiliates.js'

const PLATFORM = 'BarberOS'

export default function AffiliateRegisterPage() {
  const register = useAffiliateRegister()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', bio: '', agree: false })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const update = (f, v) => { setForm(s => ({ ...s, [f]: v })); setError(null) }

  const submit = async () => {
    setError(null)
    if (form.name.trim().length < 2) return setError('Nama minimal 2 karakter')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Email tidak valid')
    if (form.phone.replace(/\D/g, '').length < 8) return setError('Nomor HP minimal 8 digit')
    if (form.password.length < 8) return setError('Password minimal 8 karakter')
    if (!form.agree) return setError('Setujui dulu syarat program affiliate')

    try {
      const res = await register.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        bio: form.bio.trim() || undefined,
      })
      setDone(res)
    } catch (err) {
      setError(err?.response?.data?.error || 'Gagal mendaftar — coba lagi.')
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-dark text-off-white flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-dark-card border border-dark-border rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="text-green-400" size={28} />
          </div>
          <h1 className="font-display text-2xl font-bold">Pendaftaran Terkirim!</h1>
          <p className="text-muted text-sm mt-2">
            Akun affiliate Anda sedang ditinjau tim {PLATFORM}. Kami akan mengirim notifikasi via email begitu akun diaktifkan — biasanya dalam 1×24 jam.
          </p>
          <div className="mt-5 p-4 rounded-xl bg-dark-surface border border-dark-border text-left">
            <p className="text-[11px] text-muted uppercase tracking-wider mb-1">Kode rujukan Anda (sementara)</p>
            <p className="font-mono text-2xl font-bold text-gold">{done.referralCode}</p>
            <p className="text-[11px] text-muted mt-2">Setelah akun aktif, masuk ke dashboard untuk mendapatkan link rujukan lengkap.</p>
          </div>
          <Link to="/login" className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold text-dark font-semibold hover:bg-gold-light transition-colors">
            Masuk ke Login
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark text-off-white">
      <header className="border-b border-dark-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-muted hover:text-off-white text-sm">
            <ArrowLeft size={14} /> Kembali
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center text-dark font-bold text-sm">S</div>
            <span className="font-display font-bold">{PLATFORM}</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Sparkles className="text-gold mx-auto mb-2" size={24} />
          <h1 className="font-display text-3xl lg:text-4xl font-bold">Jadi Mitra Affiliate {PLATFORM}</h1>
          <p className="text-muted mt-3">
            Bagikan link rujukan ke pemilik barbershop di jaringan Anda. Setiap tenant yang daftar & membayar lewat link Anda, Anda dapat komisi 10% — selama mereka tetap berlangganan.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-3 mb-10">
          <Perk icon={Users} title="Bagi link, panen komisi" desc="Cukup share link rujukan kamu via WhatsApp/Instagram/etc." />
          <Perk icon={TrendingUp} title="10% per pembayaran" desc="Komisi otomatis tercatat setiap tenant rujukan kamu bayar invoice." />
          <Perk icon={Banknote} title="Cair via Transfer/E-wallet" desc="Tarik saldo kapan saja setelah saldo minimum tercapai." />
        </div>

        <div className="bg-dark-card border border-dark-border rounded-2xl p-6 lg:p-8 max-w-xl mx-auto">
          <h2 className="font-semibold text-lg mb-4">Daftar sebagai affiliate</h2>
          <div className="space-y-3">
            <Field id="aff-name" label="Nama lengkap" icon={User} value={form.name} onChange={v => update('name', v)} />
            <Field id="aff-email" label="Email" icon={Mail} type="email" value={form.email} onChange={v => update('email', v)} />
            <Field id="aff-phone" label="WhatsApp / HP" icon={Phone} type="tel" value={form.phone} onChange={v => update('phone', v)} placeholder="08xxxxxxxxxx" />
            <Field id="aff-pw" label="Password (min 8 karakter)" icon={Lock}
              type={showPassword ? 'text' : 'password'}
              value={form.password} onChange={v => update('password', v)}
              rightIcon={showPassword ? EyeOff : Eye}
              onRightClick={() => setShowPassword(s => !s)}
            />
            <div>
              <label className="text-xs text-muted block mb-1.5">Cerita singkat tentang Anda (opsional)</label>
              <textarea value={form.bio} onChange={e => update('bio', e.target.value)} rows={3} maxLength={500}
                className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl p-3 text-sm focus:outline-none focus:border-gold/60"
                placeholder="Misal: pemilik barbershop, content creator, atau punya komunitas pengusaha." />
            </div>

            <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
              <input type="checkbox" checked={form.agree} onChange={e => update('agree', e.target.checked)}
                className="mt-0.5 accent-gold w-4 h-4 flex-shrink-0" />
              <span className="text-xs text-muted leading-relaxed">
                Saya setuju komisi affiliate dibayarkan setelah verifikasi tim {PLATFORM} dan saldo minimum Rp 100.000 tercapai.
              </span>
            </label>

            {error && (
              <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button onClick={submit} disabled={register.isPending}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gold text-dark font-semibold hover:bg-gold-light transition-colors disabled:opacity-60">
              {register.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {register.isPending ? 'Mendaftarkan…' : 'Daftar Affiliate'}
            </button>
            <p className="text-center text-xs text-muted">
              Sudah punya akun? <Link to="/login" className="text-gold hover:underline">Masuk</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function Perk({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-xl bg-dark-card border border-dark-border p-4 text-center">
      <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-center mx-auto mb-2">
        <Icon size={16} className="text-gold" />
      </div>
      <p className="font-semibold text-off-white text-sm">{title}</p>
      <p className="text-xs text-muted mt-1">{desc}</p>
    </div>
  )
}

function Field({ id, label, icon: Icon, value, onChange, type = 'text', placeholder, rightIcon: RightIcon, onRightClick }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted block mb-1.5">{label}</label>
      <div className="relative flex items-center">
        {Icon && <Icon size={14} className="absolute left-3 text-muted pointer-events-none" />}
        <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl py-2.5 text-sm focus:outline-none focus:border-gold/60 ${Icon ? 'pl-9' : 'pl-3'} ${RightIcon ? 'pr-10' : 'pr-3'}`} />
        {RightIcon && (
          <button type="button" onClick={onRightClick} className="absolute right-3 text-muted hover:text-off-white">
            <RightIcon size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

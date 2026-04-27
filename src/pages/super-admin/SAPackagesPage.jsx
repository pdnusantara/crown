import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Edit2, Check, X, Building2, Users, GitBranch, Info, Save, AlertTriangle,
  Plus, Minus, Calculator, ArrowRight, TrendingUp, TrendingDown, Clock,
  ChevronRight, Eye, EyeOff,
} from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { usePackages, useUpdatePackage } from '../../hooks/usePackages.js'
import { ALL_FEATURE_FLAGS } from '../../store/featureFlagStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import { formatRupiah } from '../../utils/format.js'

const PACKAGE_STYLES = {
  Basic:      { border: 'border-blue-400/30',   bg: 'bg-blue-400/5',   badge: 'text-blue-400 bg-blue-400/10 border-blue-400/30',   accent: 'text-blue-400' },
  Pro:        { border: 'border-gold/30',        bg: 'bg-gold/5',       badge: 'text-gold bg-gold/10 border-gold/30',               accent: 'text-gold' },
  Enterprise: { border: 'border-purple-400/30',  bg: 'bg-purple-400/5', badge: 'text-purple-400 bg-purple-400/10 border-purple-400/30', accent: 'text-purple-400' },
}

const FLAG_CATEGORIES = [...new Set(ALL_FEATURE_FLAGS.map(f => f.category))]

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcTotal(branches, basePrice, maxBranches, addonPrice, addonType) {
  const extra = Math.max(0, branches - maxBranches)
  const addonMonthly = addonType === 'monthly' ? extra * addonPrice : 0
  const addonOnetime = addonType === 'onetime' ? extra * addonPrice : 0
  return { extra, addonMonthly, addonOnetime, monthlyTotal: basePrice + addonMonthly }
}

function simRows(maxBranches) {
  const counts = [maxBranches]
  for (let i = 1; i <= 4; i++) counts.push(maxBranches + i)
  if (maxBranches <= 5) counts.push(maxBranches + 9)
  return [...new Set(counts)].sort((a, b) => a - b)
}

function timeAgo(dateStr) {
  if (!dateStr) return null
  const days = differenceInDays(new Date(), new Date(dateStr))
  if (days === 0) return 'hari ini'
  if (days === 1) return 'kemarin'
  if (days < 7) return `${days} hari lalu`
  if (days < 30) return `${Math.floor(days / 7)} minggu lalu`
  if (days < 365) return `${Math.floor(days / 30)} bulan lalu`
  return `${Math.floor(days / 365)} tahun lalu`
}

function deltaColor(delta) {
  if (delta > 0) return 'text-green-400'
  if (delta < 0) return 'text-red-400'
  return 'text-muted'
}

function deltaPrefix(delta) {
  if (delta > 0) return '+'
  if (delta < 0) return ''
  return '±'
}

// ── Shared inputs ─────────────────────────────────────────────────────────────
function RpInput({ label, value, onChange, hint, error, step = 1000 }) {
  return (
    <div>
      {label && <label className="block text-xs text-muted mb-1.5">{label}</label>}
      {hint && <p className="text-xs text-muted/60 mb-1">{hint}</p>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">Rp</span>
        <input
          type="number"
          value={value ?? 0}
          onChange={e => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
          className={`w-full bg-dark-card border rounded-xl pl-9 pr-3 py-2.5 text-sm text-off-white focus:outline-none transition-colors ${error ? 'border-red-400/50 focus:border-red-400' : 'border-dark-border focus:border-gold/50'}`}
          min={0}
          step={step}
        />
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

function NumberInput({ label, value, onChange, min = 1, max, hint, error }) {
  return (
    <div>
      {label && <label className="block text-xs text-muted mb-1.5">{label}</label>}
      {hint && <p className="text-xs text-muted/60 mb-1">{hint}</p>}
      <div className="flex items-center">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
          className="px-3 py-2.5 bg-dark-card border border-r-0 border-dark-border rounded-l-xl text-muted hover:text-off-white hover:bg-dark-surface transition-colors">
          <Minus size={12} />
        </button>
        <input
          type="number"
          value={value ?? min}
          onChange={e => {
            const v = e.target.value === '' ? min : Number(e.target.value)
            onChange(Math.max(min, max != null ? Math.min(max, v) : v))
          }}
          className={`flex-1 bg-dark-card border-y text-center py-2.5 text-sm text-off-white focus:outline-none transition-colors ${error ? 'border-red-400/50' : 'border-dark-border'}`}
          min={min} max={max}
        />
        <button type="button" onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
          className="px-3 py-2.5 bg-dark-card border border-l-0 border-dark-border rounded-r-xl text-muted hover:text-off-white hover:bg-dark-surface transition-colors">
          <Plus size={12} />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

// ── Branch Simulator (table) ──────────────────────────────────────────────────
function BranchSimulator({ basePrice, maxBranches, addonPrice, addonType }) {
  const rows = simRows(maxBranches)
  const isMonthly = addonType === 'monthly'
  if (!addonPrice) {
    return (
      <div className="text-xs text-green-400 flex items-center gap-1.5">
        <Check size={12} />
        Tidak ada biaya tambahan untuk cabang ekstra
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-dark-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-dark-surface border-b border-dark-border text-muted">
            <th className="px-3 py-2 text-left font-medium">Jumlah Cabang</th>
            <th className="px-3 py-2 text-right font-medium">{isMonthly ? 'Addon/Bln' : 'Biaya Beli'}</th>
            <th className="px-3 py-2 text-right font-medium">Total/Bln</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((branches, i) => {
            const { extra, addonMonthly, addonOnetime, monthlyTotal } = calcTotal(branches, basePrice, maxBranches, addonPrice, addonType)
            const isBase = branches === maxBranches
            return (
              <tr key={branches} className={`border-b border-dark-border/40 ${isBase ? 'bg-gold/5' : i % 2 !== 0 ? 'bg-dark-surface/30' : ''}`}>
                <td className="px-3 py-2">
                  <span className={`font-medium ${isBase ? 'text-gold' : 'text-off-white'}`}>{branches} cabang</span>
                  {isBase && <span className="ml-1.5 text-gold/60 text-[10px]">termasuk</span>}
                  {!isBase && <span className="ml-1.5 text-muted/60 text-[10px]">+{extra} extra</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {extra === 0 ? <span className="text-muted">—</span>
                    : isMonthly
                      ? <span className="text-amber-400">{formatRupiah(addonMonthly)}</span>
                      : <span className="text-purple-400">{formatRupiah(addonOnetime)}</span>
                  }
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`font-semibold ${isBase ? 'text-gold' : 'text-off-white'}`}>{formatRupiah(monthlyTotal)}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 bg-dark-surface/50 text-[10px] text-muted/70 border-t border-dark-border/40">
        {isMonthly ? 'Biaya cabang tambahan ditagih setiap bulan' : 'Biaya cabang tambahan dibayar sekali saat menambah cabang'}
      </div>
    </div>
  )
}

// ── Card Simulator (interactive) ──────────────────────────────────────────────
function CardSimulator({ basePrice, maxBranches, addonPrice, addonType }) {
  const [branchCount, setBranchCount] = useState(maxBranches)
  const { extra, addonMonthly, addonOnetime, monthlyTotal } = calcTotal(branchCount, basePrice, maxBranches, addonPrice, addonType)
  const isMonthly = addonType === 'monthly'
  return (
    <div className="mt-2 p-3 bg-dark-card/60 rounded-xl border border-dark-border/50">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs text-muted flex items-center gap-1"><Calculator size={11} />Simulator</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setBranchCount(c => Math.max(maxBranches, c - 1))} disabled={branchCount <= maxBranches}
            className="w-5 h-5 rounded border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed">
            <Minus size={9} />
          </button>
          <span className="text-xs text-off-white font-semibold w-16 text-center">{branchCount} cabang</span>
          <button onClick={() => setBranchCount(c => c + 1)}
            className="w-5 h-5 rounded border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-colors flex items-center justify-center">
            <Plus size={9} />
          </button>
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">Harga dasar</span>
          <span className="text-off-white">{formatRupiah(basePrice)}/bln</span>
        </div>
        {extra > 0 && (
          <div className="flex justify-between">
            <span className="text-muted">{extra} cabang × {formatRupiah(addonPrice)}{isMonthly ? '/bln' : ''}</span>
            <span className={isMonthly ? 'text-amber-400' : 'text-purple-400'}>
              {isMonthly ? `+${formatRupiah(addonMonthly)}/bln` : `+${formatRupiah(addonOnetime)}`}
            </span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-dark-border/40 font-semibold">
          <span className="text-muted">Total per bulan</span>
          <span className="text-gold">{formatRupiah(monthlyTotal)}</span>
        </div>
      </div>
    </div>
  )
}

// ── MRR Impact box (inside edit modal) ───────────────────────────────────────
function MrrImpact({ originalPrice, newPrice, tenantCount }) {
  const currentMrr = originalPrice * tenantCount
  const newMrr     = newPrice * tenantCount
  const delta      = newMrr - currentMrr
  if (tenantCount === 0 || originalPrice === newPrice) return null
  return (
    <div className={`p-3 rounded-xl border text-xs ${delta > 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
      <p className="text-muted mb-2 font-medium">Dampak perubahan harga</p>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-muted">{tenantCount} tenant aktif × harga lama</span>
          <span className="text-off-white">{formatRupiah(currentMrr)}/bln</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{tenantCount} tenant aktif × harga baru</span>
          <span className="text-off-white">{formatRupiah(newMrr)}/bln</span>
        </div>
        <div className="flex justify-between pt-1 border-t border-dark-border/40 font-semibold">
          <span className="text-muted">Perubahan MRR</span>
          <span className={`flex items-center gap-1 ${deltaColor(delta)}`}>
            {delta > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {deltaPrefix(delta)}{formatRupiah(Math.abs(delta))}/bln
          </span>
        </div>
        <p className="text-muted/60 text-[10px] mt-1">
          * Hanya berlaku untuk subscription baru. Subscription yang sudah ada menggunakan harga saat dibuat.
        </p>
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditPackageModal({ name, pkg, onSave, onClose, submitting }) {
  const [tab, setTab] = useState('pricing')
  const [form, setForm] = useState({
    price:            pkg.price ?? 0,
    maxBranches:      pkg.maxBranches ?? 1,
    maxStaff:         pkg.maxStaff ?? 5,
    branchAddonPrice: pkg.branchAddonPrice ?? 0,
    branchAddonType:  pkg.branchAddonType ?? 'monthly',
    description:      pkg.description ?? '',
    features:         pkg.features ?? [],
  })
  const [errors, setErrors] = useState({})
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleFeature = (id) =>
    setForm(f => ({
      ...f,
      features: f.features.includes(id) ? f.features.filter(x => x !== id) : [...f.features, id],
    }))

  const validate = () => {
    const err = {}
    if (form.price < 0 || !Number.isFinite(form.price)) err.price = 'Harga tidak valid'
    if (form.maxBranches < 1) err.maxBranches = 'Min 1'
    if (form.maxStaff < 1) err.maxStaff = 'Min 1'
    if (form.branchAddonPrice < 0) err.branchAddonPrice = 'Tidak boleh negatif'
    setErrors(err)
    return Object.keys(err).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    onSave({
      price: form.price, maxBranches: form.maxBranches, maxStaff: form.maxStaff,
      branchAddonPrice: form.branchAddonPrice, branchAddonType: form.branchAddonType,
      description: form.description.trim() || null, features: form.features,
    })
  }

  const style = PACKAGE_STYLES[name] || PACKAGE_STYLES.Basic
  const TABS = [
    { key: 'pricing',  label: 'Harga' },
    { key: 'addon',    label: 'Biaya Cabang' },
    { key: 'limits',   label: 'Batas' },
    { key: 'features', label: `Fitur (${form.features.length})` },
  ]

  return (
    <Modal isOpen onClose={() => !submitting && onClose()} title={`Edit Paket ${name}`} size="lg">
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-dark-surface rounded-xl border border-dark-border">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.key ? `${style.badge} border` : 'text-muted hover:text-off-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Harga */}
        {tab === 'pricing' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <RpInput
              label="Harga Langganan per Bulan"
              value={form.price}
              onChange={v => set('price', v)}
              hint="Harga pokok yang ditagih setiap bulan kepada tenant."
              error={errors.price}
            />

            {/* Annual preview */}
            <div className="p-3 bg-dark-surface rounded-xl border border-dark-border flex items-center gap-4 text-sm">
              <div>
                <p className="text-xs text-muted mb-0.5">Per bulan</p>
                <p className="font-bold text-off-white">{formatRupiah(form.price)}</p>
              </div>
              <ArrowRight size={14} className="text-muted flex-shrink-0" />
              <div>
                <p className="text-xs text-muted mb-0.5">Per tahun</p>
                <p className="font-bold text-gold">{formatRupiah(form.price * 12)}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted mb-0.5">ARR potensial</p>
                <p className="font-bold text-green-400">{formatRupiah(form.price * 12 * (pkg.tenantCount || 0))}</p>
                <p className="text-[10px] text-muted/60">{pkg.tenantCount || 0} tenant</p>
              </div>
            </div>

            {/* MRR impact */}
            <MrrImpact
              originalPrice={pkg.price}
              newPrice={form.price}
              tenantCount={pkg.tenantCount || 0}
            />

            <div>
              <label className="block text-xs text-muted mb-1.5">
                Deskripsi Paket <span className="text-muted/60">(opsional)</span>
              </label>
              <input
                value={form.description}
                onChange={e => set('description', e.target.value.slice(0, 500))}
                className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white focus:outline-none focus:border-gold/50 transition-colors"
                placeholder="Ringkasan singkat tentang paket ini..."
              />
              <p className="text-[10px] text-muted/60 mt-1 text-right">{form.description.length}/500</p>
            </div>
          </motion.div>
        )}

        {/* Biaya Cabang */}
        {tab === 'addon' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="p-3.5 bg-dark-surface rounded-xl border border-dark-border text-xs text-muted flex gap-2.5">
              <Info size={13} className="text-gold flex-shrink-0 mt-0.5" />
              <span>
                Setiap paket menyertakan <strong className="text-off-white">{form.maxBranches} cabang</strong> dalam harga pokok.
                Cabang melebihi batas ini dikenakan biaya sesuai pengaturan di bawah.
              </span>
            </div>

            <RpInput
              label="Biaya per Cabang Tambahan"
              value={form.branchAddonPrice}
              onChange={v => set('branchAddonPrice', v)}
              hint="Isi 0 untuk memberikan cabang tambahan gratis tanpa batas."
              error={errors.branchAddonPrice}
              step={10000}
            />

            <div>
              <label className="block text-xs text-muted mb-2">Jenis Penagihan</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'monthly', icon: '🔄', title: 'Berulang / Bulan', desc: 'Ditagih tiap bulan selama cabang aktif.' },
                  { key: 'onetime', icon: '💳', title: 'Sekali Bayar',     desc: 'Dibayar satu kali saat menambah cabang.' },
                ].map(opt => (
                  <button key={opt.key} type="button" onClick={() => set('branchAddonType', opt.key)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${form.branchAddonType === opt.key ? 'border-gold bg-gold/8' : 'border-dark-border hover:border-gold/30'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{opt.icon}</span>
                      <span className="text-sm font-medium text-off-white">{opt.title}</span>
                      {form.branchAddonType === opt.key && <Check size={12} className="text-gold ml-auto" />}
                    </div>
                    <p className="text-xs text-muted">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {form.branchAddonPrice > 0 ? (
              <div>
                <p className="text-xs text-muted font-medium mb-2 flex items-center gap-1.5">
                  <Calculator size={12} className="text-gold" />Simulator total tagihan
                </p>
                <BranchSimulator
                  basePrice={form.price}
                  maxBranches={form.maxBranches}
                  addonPrice={form.branchAddonPrice}
                  addonType={form.branchAddonType}
                />
              </div>
            ) : (
              <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl text-xs text-green-400 flex items-center gap-2">
                <Check size={13} />Cabang tambahan gratis — tenant bebas menambah cabang tanpa biaya ekstra
              </div>
            )}
          </motion.div>
        )}

        {/* Batas */}
        {tab === 'limits' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <NumberInput
              label="Cabang Termasuk dalam Paket"
              value={form.maxBranches}
              onChange={v => set('maxBranches', v)}
              hint="Jumlah cabang dalam harga pokok. Lebih dari ini dikenakan biaya addon."
              min={1} max={9999} error={errors.maxBranches}
            />
            <NumberInput
              label="Maksimum Staf"
              value={form.maxStaff}
              onChange={v => set('maxStaff', v)}
              hint="Total staf (kasir, barber, admin) yang bisa didaftarkan di semua cabang."
              min={1} max={9999} error={errors.maxStaff}
            />
            <div className="p-4 bg-dark-surface rounded-xl border border-dark-border space-y-2.5">
              <p className="text-xs text-muted font-medium uppercase">Ringkasan Batas</p>
              {[
                { icon: Building2, label: 'Cabang termasuk',    value: `${form.maxBranches} cabang`,                                                                    color: 'text-blue-400' },
                { icon: Users,     label: 'Maks staf',          value: `${form.maxStaff} orang`,                                                                         color: 'text-green-400' },
                { icon: GitBranch, label: 'Biaya extra cabang', value: form.branchAddonPrice > 0 ? `${formatRupiah(form.branchAddonPrice)}/${form.branchAddonType === 'monthly' ? 'bln' : 'cabang'}` : 'Gratis', color: form.branchAddonPrice > 0 ? 'text-amber-400' : 'text-green-400' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-muted"><row.icon size={13} className={row.color} />{row.label}</div>
                  <span className={`font-semibold ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Fitur */}
        {tab === 'features' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted">{form.features.length} dari {ALL_FEATURE_FLAGS.length} fitur aktif</p>
              <div className="flex gap-2">
                <button onClick={() => setForm(f => ({ ...f, features: ALL_FEATURE_FLAGS.map(x => x.id) }))} className="text-xs text-gold hover:underline">Pilih semua</button>
                <span className="text-muted/40">|</span>
                <button onClick={() => setForm(f => ({ ...f, features: [] }))} className="text-xs text-muted hover:text-red-400">Hapus semua</button>
              </div>
            </div>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {FLAG_CATEGORIES.map(cat => (
                <div key={cat}>
                  <p className="text-xs text-gold font-semibold mb-1.5 sticky top-0 bg-dark-card py-0.5">{cat}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_FEATURE_FLAGS.filter(f => f.category === cat).map(flag => {
                      const active = form.features.includes(flag.id)
                      return (
                        <button key={flag.id} type="button" onClick={() => toggleFeature(flag.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-all text-xs ${active ? 'border-gold/40 bg-gold/8 text-off-white' : 'border-dark-border text-muted hover:border-dark-border/80'}`}>
                          <div className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center transition-all ${active ? 'border-gold bg-gold' : 'border-muted'}`}>
                            {active && <Check size={9} className="text-dark" />}
                          </div>
                          <span className="truncate">{flag.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="flex gap-3 pt-1 border-t border-dark-border/50">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={submitting}>Batal</Button>
          <Button fullWidth icon={Save} onClick={handleSave} disabled={submitting}>
            {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Upgrade Path Section ──────────────────────────────────────────────────────
function UpgradePath({ packageList }) {
  if (packageList.length < 2) return null

  const pairs = []
  for (let i = 0; i < packageList.length - 1; i++) {
    const from = packageList[i]
    const to   = packageList[i + 1]
    const newFeatures = (to.features || []).filter(f => !(from.features || []).includes(f))
    const priceDelta  = to.price - from.price
    const branchDelta = to.maxBranches - from.maxBranches
    const staffDelta  = to.maxStaff - from.maxStaff
    pairs.push({ from, to, newFeatures, priceDelta, branchDelta, staffDelta })
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-off-white mb-3 flex items-center gap-2">
        <ChevronRight size={14} className="text-gold" />
        Upgrade Path
      </h3>
      <div className="grid md:grid-cols-2 gap-4">
        {pairs.map(({ from, to, newFeatures, priceDelta, branchDelta, staffDelta }) => {
          const fromStyle = PACKAGE_STYLES[from.name] || PACKAGE_STYLES.Basic
          const toStyle   = PACKAGE_STYLES[to.name]   || PACKAGE_STYLES.Basic
          return (
            <Card key={`${from.name}-${to.name}`} className="p-4">
              {/* Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${fromStyle.badge}`}>{from.name}</span>
                <ArrowRight size={14} className="text-muted" />
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${toStyle.badge}`}>{to.name}</span>
              </div>

              {/* Deltas */}
              <div className="space-y-2 text-xs">
                {priceDelta !== 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Harga tambahan</span>
                    <span className="font-semibold text-amber-400">+{formatRupiah(priceDelta)}/bln</span>
                  </div>
                )}
                {branchDelta > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Cabang termasuk</span>
                    <span className="font-semibold text-blue-400">+{branchDelta} cabang</span>
                  </div>
                )}
                {staffDelta > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Maks staf</span>
                    <span className="font-semibold text-green-400">+{staffDelta} staf</span>
                  </div>
                )}
                {newFeatures.length > 0 && (
                  <div className="pt-1.5 border-t border-dark-border/40">
                    <p className="text-muted mb-1.5">{newFeatures.length} fitur baru:</p>
                    <div className="flex flex-wrap gap-1">
                      {newFeatures.slice(0, 6).map(fid => {
                        const flag = ALL_FEATURE_FLAGS.find(f => f.id === fid)
                        return flag ? (
                          <span key={fid} className="px-1.5 py-0.5 bg-dark-surface border border-dark-border rounded text-[10px] text-off-white">
                            {flag.label}
                          </span>
                        ) : null
                      })}
                      {newFeatures.length > 6 && (
                        <span className="px-1.5 py-0.5 text-[10px] text-muted">+{newFeatures.length - 6} lagi</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SAPackagesPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError, error, refetch } = usePackages()
  const updatePackage = useUpdatePackage()
  const toast         = useToast()
  const [editing, setEditing]       = useState(null)
  const [diffOnly, setDiffOnly]     = useState(false)

  const packages    = data?.map || {}
  const packageList = data?.list || []

  // MRR total per package and grand total
  const totalMrr = useMemo(
    () => packageList.reduce((sum, p) => sum + (p.price * (p.tenantCount || 0)), 0),
    [packageList]
  )

  // For diff-only toggle: flag rows where not all packages agree
  const diffRows = useMemo(() => {
    if (!diffOnly || packageList.length === 0) return ALL_FEATURE_FLAGS
    return ALL_FEATURE_FLAGS.filter(flag => {
      const states = packageList.map(p => (p.features || []).includes(flag.id))
      return !states.every(s => s === states[0]) // at least one differs
    })
  }, [diffOnly, packageList])

  const handleSave = async (name, payload) => {
    try {
      await updatePackage.mutateAsync({ name, ...payload })
      toast.success(t('superAdmin.packages.toastUpdated', { name }))
      setEditing(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.packages.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.packages.pageSubtitle')}</p>
        </div>
        {!isLoading && totalMrr > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted">Total MRR dari paket</p>
            <p className="text-lg font-bold text-gold">{formatRupiah(totalMrr)}</p>
            <p className="text-xs text-muted/60">{formatRupiah(totalMrr * 12)}/tahun</p>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-gold/5 border border-gold/20 rounded-2xl">
        <Info size={16} className="text-gold mt-0.5 flex-shrink-0" />
        <p className="text-sm text-muted">{t('superAdmin.packages.infoBanner')}</p>
      </div>

      {/* Error */}
      {isError && !isLoading && (
        <Card className="p-6 border-red-400/30 bg-red-400/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">{t('superAdmin.packages.errorLoad')}</p>
              <p className="text-xs text-muted mt-1">{error?.response?.data?.error || error?.message || ''}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>Coba lagi</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid md:grid-cols-3 gap-6">
          {[0,1,2].map(i => <div key={i} className="h-80 rounded-2xl bg-dark-card animate-pulse" />)}
        </div>
      )}

      {/* Package Cards */}
      {!isLoading && !isError && packageList.length > 0 && (
        <div className="grid md:grid-cols-3 gap-6">
          {packageList.map((pkg, i) => {
            const name       = pkg.name
            const style      = PACKAGE_STYLES[name] || PACKAGE_STYLES.Basic
            const tenantCount = pkg.tenantCount ?? 0
            const pkgMrr     = pkg.price * tenantCount
            const hasAddon   = pkg.branchAddonPrice > 0
            const lastEdited = timeAgo(pkg.updatedAt)

            return (
              <motion.div key={name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Card className={`p-5 border ${style.border} ${style.bg} flex flex-col`}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${style.badge}`}>{name}</span>
                      {pkg.description && <p className="text-xs text-muted mt-1.5 line-clamp-2">{pkg.description}</p>}
                    </div>
                    <button onClick={() => setEditing(name)}
                      className="ml-2 p-2 rounded-xl border border-dark-border text-muted hover:text-gold hover:border-gold/30 transition-all flex-shrink-0"
                      title="Edit">
                      <Edit2 size={14} />
                    </button>
                  </div>

                  {/* Price */}
                  <div className="mb-4">
                    <div className="flex items-end gap-1.5">
                      <p className="text-3xl font-bold text-off-white">{formatRupiah(pkg.price)}</p>
                      <p className="text-xs text-muted pb-1">/bulan</p>
                    </div>
                    <p className="text-xs text-muted/60 mt-0.5">{formatRupiah(pkg.price * 12)}/tahun</p>
                  </div>

                  {/* Quota */}
                  <div className="space-y-2 mb-4 p-3 bg-dark-card/50 rounded-xl border border-dark-border/50">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted"><Building2 size={13} />Cabang termasuk</div>
                      <span className="font-semibold text-off-white">{pkg.maxBranches}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted"><Users size={13} />Maks staf</div>
                      <span className="font-semibold text-off-white">{pkg.maxStaff}</span>
                    </div>
                  </div>

                  {/* Branch addon */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-muted"><GitBranch size={12} />Cabang tambahan</div>
                      {hasAddon ? (
                        <div className="text-right">
                          <span className="text-sm font-bold text-gold">{formatRupiah(pkg.branchAddonPrice)}</span>
                          <span className="text-xs text-muted ml-1">/cabang/{pkg.branchAddonType === 'monthly' ? 'bln' : 'beli'}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-green-400 flex items-center gap-1"><Check size={11} />Gratis</span>
                      )}
                    </div>
                    {hasAddon && (
                      <CardSimulator
                        basePrice={pkg.price}
                        maxBranches={pkg.maxBranches}
                        addonPrice={pkg.branchAddonPrice}
                        addonType={pkg.branchAddonType}
                      />
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-auto pt-3 border-t border-dark-border/50 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">
                        <span className="font-semibold text-off-white">{tenantCount}</span> tenant aktif
                      </span>
                      <span className="text-muted">
                        <span className="font-semibold text-off-white">{pkg.features?.length ?? 0}</span> fitur
                      </span>
                    </div>
                    {/* MRR contribution */}
                    {pkgMrr > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted flex items-center gap-1"><TrendingUp size={11} className="text-green-400" />MRR paket ini</span>
                        <span className="font-semibold text-green-400">{formatRupiah(pkgMrr)}/bln</span>
                      </div>
                    )}
                    {/* Last edited */}
                    {lastEdited && (
                      <div className="flex items-center gap-1 text-[10px] text-muted/50">
                        <Clock size={9} />
                        <span>Diubah {lastEdited}</span>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Upgrade Path */}
      {!isLoading && !isError && packageList.length >= 2 && (
        <UpgradePath packageList={packageList} />
      )}

      {/* Feature comparison table */}
      {!isLoading && !isError && packageList.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-off-white">{t('superAdmin.packages.comparisonTitle')}</h3>
                  <p className="text-xs text-muted mt-0.5">
                    {diffOnly
                      ? `${diffRows.length} fitur berbeda antar paket`
                      : t('superAdmin.packages.comparisonSubtitle')}
                  </p>
                </div>
                <button
                  onClick={() => setDiffOnly(d => !d)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    diffOnly
                      ? 'border-gold/40 bg-gold/10 text-gold'
                      : 'border-dark-border text-muted hover:text-off-white'
                  }`}
                >
                  {diffOnly ? <EyeOff size={12} /> : <Eye size={12} />}
                  {diffOnly ? 'Semua fitur' : 'Hanya perbedaan'}
                </button>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-xs text-muted uppercase">
                    <th className="px-4 py-3 text-left">{t('superAdmin.packages.colFeature')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.packages.colCategory')}</th>
                    {packageList.map(pkg => (
                      <th key={pkg.name} className="px-4 py-3 text-center">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PACKAGE_STYLES[pkg.name]?.badge}`}>{pkg.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {diffRows.map((flag, i) => (
                      <motion.tr
                        key={flag.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ delay: Math.min(i * 0.01, 0.2) }}
                        className="border-b border-dark-border/40 hover:bg-dark-surface/30 transition-colors"
                      >
                        <td className="px-4 py-2.5">
                          <p className="text-off-white font-medium text-sm">{flag.label}</p>
                          <p className="text-xs text-muted">{flag.description}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-muted">{flag.category}</span>
                        </td>
                        {packageList.map(pkg => {
                          const included = (pkg.features || []).includes(flag.id)
                          return (
                            <td key={pkg.name} className="px-4 py-2.5 text-center">
                              {included
                                ? <Check size={16} className="text-green-400 mx-auto" />
                                : <X size={14} className="text-dark-border mx-auto" />
                              }
                            </td>
                          )
                        })}
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
              {diffOnly && diffRows.length === 0 && (
                <div className="text-center py-8 text-muted text-sm">
                  Semua fitur sama di setiap paket — tidak ada perbedaan
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Edit Modal */}
      {editing && packages[editing] && (
        <EditPackageModal
          name={editing}
          pkg={packages[editing]}
          onSave={(payload) => handleSave(editing, payload)}
          onClose={() => setEditing(null)}
          submitting={updatePackage.isPending}
        />
      )}
    </div>
  )
}

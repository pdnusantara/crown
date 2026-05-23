import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  UserPlus, Download, RefreshCw, Search, Users, CalendarDays,
  Handshake, TrendingUp, ExternalLink, Megaphone,
} from 'lucide-react'
import { useTenantRegistrations, useTenantRegistrationStats } from '../../hooks/useTenantRegistrations.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import { tenantHostname } from '../../utils/platform.js'

const TZ = 'Asia/Jakarta'

const CHANNEL_LABEL = {
  affiliate:    'Affiliate',
  facebook_ads: 'Iklan FB/IG',
  google_ads:   'Iklan Google',
  campaign:     'Kampanye/UTM',
  referral:     'Referral',
  direct:       'Langsung',
  unknown:      'Tak diketahui',
}
const CHANNEL_COLOR = {
  affiliate:    'text-purple-400 bg-purple-400/10 border-purple-400/20',
  facebook_ads: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  google_ads:   'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  campaign:     'text-amber-400 bg-amber-400/10 border-amber-400/20',
  referral:     'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  direct:       'text-muted bg-dark-bg border-dark-border',
  unknown:      'text-muted bg-dark-bg border-dark-border',
}
const STATUS_COLOR = {
  trial:   'text-amber-400 bg-amber-400/10 border-amber-400/20',
  active:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  overdue: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  expired: 'text-red-400 bg-red-400/10 border-red-400/20',
  paused:  'text-muted bg-dark-bg border-dark-border',
}

const ymd = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
function addDays(s, n) {
  const dt = new Date(`${s}T00:00:00.000Z`)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}
function presetRange(p) {
  const today = ymd()
  switch (p) {
    case 'today':     return { from: today, to: today }
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y } }
    case '7days':     return { from: addDays(today, -6), to: today }
    case '30days':    return { from: addDays(today, -29), to: today }
    case 'month':     return { from: `${today.slice(0, 7)}-01`, to: today }
    default:          return { from: '', to: '' } // 'all'
  }
}
const PRESETS = [
  ['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['7days', '7 hari'],
  ['30days', '30 hari'], ['month', 'Bulan ini'], ['all', 'Semua'],
]

function fmtDateTime(d) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(d))
}

function sourceLabel(row) {
  if (row.affiliate) return `Affiliate · ${row.affiliate.name || row.affiliate.code}`
  return CHANNEL_LABEL[row.channel] || CHANNEL_LABEL.unknown
}
function escapeCsv(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function KpiTile({ label, value, icon: Icon, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-dark-card border border-dark-border rounded-2xl p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        {Icon && <Icon size={15} className={color} />}
      </div>
      <p className={`text-2xl font-bold mt-1.5 ${color}`}>{value ?? '–'}</p>
    </motion.div>
  )
}

export default function SATenantRegistrationsPage() {
  const { showToast } = useToast()
  const [preset, setPreset] = useState('7days')
  const [from, setFrom] = useState(() => presetRange('7days').from)
  const [to, setTo] = useState(() => presetRange('7days').to)
  const [channel, setChannel] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(25)

  // Debounce pencarian.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setLimit(25) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  function applyPreset(p) {
    setPreset(p)
    const r = presetRange(p)
    setFrom(r.from); setTo(r.to); setLimit(25)
  }

  const params = useMemo(() => ({
    from: from || undefined, to: to || undefined,
    channel: channel || undefined, search: search || undefined,
    tz: TZ, page: 1, limit,
  }), [from, to, channel, search, limit])

  const { data: resp, isLoading, isFetching, isError, refetch } = useTenantRegistrations(params)
  const { data: stats } = useTenantRegistrationStats(TZ)
  const rows = resp?.data || []
  const total = resp?.total || 0
  const remaining = Math.max(0, total - rows.length)

  function handleExport() {
    if (!rows.length) { showToast('Tidak ada data untuk diekspor', 'error'); return }
    const cols = ['Tanggal', 'Nama', 'Subdomain', 'Email', 'Telepon', 'Paket', 'Status', 'Sumber', 'Affiliate', 'UTM Source', 'UTM Medium', 'UTM Campaign']
    const lines = rows.map(r => [
      fmtDateTime(r.createdAt), r.name, r.slug, r.email, r.phone, r.package, r.subscriptionStatus,
      sourceLabel(r), r.affiliate?.code || '',
      r.meta?.utmSource || '', r.meta?.utmMedium || '', r.meta?.utmCampaign || '',
    ].map(escapeCsv).join(','))
    const csv = '﻿' + [cols.join(','), ...lines].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `pendaftaran-tenant-${ymd()}.csv` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const channelBreakdown = useMemo(() => {
    if (!stats) return []
    const out = []
    if (stats.affiliateCount) out.push(['affiliate', stats.affiliateCount])
    for (const [k, v] of Object.entries(stats.byChannel || {})) out.push([k, v])
    return out
  }, [stats])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-off-white flex items-center gap-2">
            <UserPlus size={22} className="text-gold" /> Laporan Pendaftaran Tenant
          </h1>
          <p className="text-muted text-sm mt-1">Pantau siapa yang mendaftar, kapan, dan dari sumber mana</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="secondary" icon={RefreshCw} onClick={() => refetch()} loading={isFetching}>Segarkan</Button>
          <Button variant="secondary" icon={Download} onClick={handleExport}>Export CSV</Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Hari ini"    value={stats?.today}      icon={UserPlus}     color="text-gold"         delay={0} />
        <KpiTile label="Kemarin"     value={stats?.yesterday}  icon={CalendarDays} color="text-blue-400"     delay={0.04} />
        <KpiTile label="Minggu ini"  value={stats?.thisWeek}   icon={TrendingUp}   color="text-emerald-400"  delay={0.08} />
        <KpiTile label="Bulan ini"   value={stats?.thisMonth}  icon={CalendarDays} color="text-amber-400"    delay={0.12} />
        <KpiTile label="Total tenant" value={stats?.total}     icon={Users}        color="text-off-white"    delay={0.16} />
      </div>

      {/* Breakdown sumber */}
      {channelBreakdown.length > 0 && (
        <Card>
          <div className="p-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted flex items-center gap-1.5"><Megaphone size={14} /> Sumber (total):</span>
            {channelBreakdown.map(([ch, n]) => (
              <span key={ch} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${CHANNEL_COLOR[ch] || CHANNEL_COLOR.unknown}`}>
                {CHANNEL_LABEL[ch] || ch}: <b>{n}</b>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Filter */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  preset === key ? 'bg-gold/15 text-gold border-gold/30' : 'text-muted border-dark-border hover:text-off-white hover:border-gold/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date" value={from} max={to || undefined}
              onChange={e => { setFrom(e.target.value); setPreset('custom') }}
              className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40"
            />
            <span className="text-muted text-xs">s/d</span>
            <input
              type="date" value={to} min={from || undefined}
              onChange={e => { setTo(e.target.value); setPreset('custom') }}
              className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40"
            />
            <select
              value={channel}
              onChange={e => { setChannel(e.target.value); setLimit(25) }}
              className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40"
            >
              <option value="">Semua sumber</option>
              <option value="affiliate">Affiliate</option>
              <option value="facebook_ads">Iklan FB/IG</option>
              <option value="google_ads">Iklan Google</option>
              <option value="campaign">Kampanye/UTM</option>
              <option value="referral">Referral</option>
              <option value="direct">Langsung</option>
              <option value="unknown">Tak diketahui</option>
            </select>
            <div className="relative flex-1 min-w-[160px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text" inputMode="search" placeholder="Cari nama / subdomain / email…"
                value={searchInput} onChange={e => setSearchInput(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Daftar */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-off-white">
            {isLoading ? 'Memuat…' : `${total} pendaftaran`}
          </span>
        </CardHeader>

        {isError ? (
          <div className="p-8 text-center text-sm text-red-400">
            Gagal memuat data. <button onClick={() => refetch()} className="text-gold underline">Coba lagi</button>
          </div>
        ) : isLoading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-dark-bg rounded-xl animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-muted text-sm">Belum ada pendaftaran pada rentang ini.</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-b border-dark-border/60">
                    <th className="px-4 py-2.5 font-medium">Tenant</th>
                    <th className="px-4 py-2.5 font-medium">Kontak</th>
                    <th className="px-4 py-2.5 font-medium">Paket</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Sumber</th>
                    <th className="px-4 py-2.5 font-medium">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-dark-border/40 hover:bg-dark-surface/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-off-white">{r.name}</div>
                        {r.slug && (
                          <a href={`https://${tenantHostname(r.slug)}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-muted hover:text-gold inline-flex items-center gap-1">
                            {r.slug} <ExternalLink size={11} />
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs">
                        <div className="text-off-white/80">{r.email}</div>
                        {r.phone && <div>{r.phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-off-white/80">{r.package || '–'}</td>
                      <td className="px-4 py-3">
                        {r.subscriptionStatus
                          ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[r.subscriptionStatus] || STATUS_COLOR.paused}`}>{r.subscriptionStatus}</span>
                          : <span className="text-muted text-xs">–</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${r.affiliate ? CHANNEL_COLOR.affiliate : (CHANNEL_COLOR[r.channel] || CHANNEL_COLOR.unknown)}`}>
                          {sourceLabel(r)}
                        </span>
                        {r.meta?.utmCampaign && <div className="text-[10px] text-muted mt-0.5">{r.meta.utmCampaign}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-dark-border/40">
              {rows.map(r => (
                <div key={r.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-off-white truncate">{r.name}</div>
                      {r.slug && <div className="text-xs text-muted truncate">{r.slug}</div>}
                    </div>
                    <span className="text-[11px] text-muted whitespace-nowrap">{fmtDateTime(r.createdAt)}</span>
                  </div>
                  <div className="text-xs text-muted truncate">{r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${r.affiliate ? CHANNEL_COLOR.affiliate : (CHANNEL_COLOR[r.channel] || CHANNEL_COLOR.unknown)}`}>
                      {sourceLabel(r)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-dark-border text-muted">{r.package || '–'}</span>
                    {r.subscriptionStatus && (
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_COLOR[r.subscriptionStatus] || STATUS_COLOR.paused}`}>{r.subscriptionStatus}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {remaining > 0 && (
              <div className="px-4 py-3 border-t border-dark-border/40 flex justify-center">
                <Button variant="secondary" size="sm" loading={isFetching} onClick={() => setLimit(l => l + 25)}>
                  Muat lebih banyak ({remaining})
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

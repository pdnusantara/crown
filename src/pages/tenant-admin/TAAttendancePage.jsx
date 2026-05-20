import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Fingerprint, CalendarClock, BarChart3, Settings2, Download,
  Loader2, AlertTriangle, Pencil, X, Navigation, ClipboardList, Save, MapPin,
  Info, ExternalLink,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardBody, CardHeader } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { useBranches, useUpdateBranch } from '../../hooks/useBranches.js'
import { useTenant, useUpdateMyTenant } from '../../hooks/useTenants.js'
import {
  useAttendanceList, useAttendanceStats, useAttendanceReport,
  useAttendanceSchedules, useUpdateSchedule, useBulkSchedule,
  useUpdateAttendance, useManualAttendance,
} from '../../hooks/useAttendance.js'
import {
  DAY_NAMES, DAY_NAMES_SHORT, ATT_STATUS, statusMeta, fmtDuration, fmtTime, fmtDateLong,
} from '../../utils/attendance.js'

const inputCls = 'w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-off-white focus:border-gold/40 focus:outline-none'
// Urutan tampilan jadwal: Senin → Minggu (dayOfWeek 1..6 lalu 0).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const todayYmd = () => new Date().toLocaleDateString('en-CA')
const monthStart = () => `${todayYmd().slice(0, 7)}-01`

// Unduh array-of-object sebagai file CSV.
function downloadCSV(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const TABS = [
  { id: 'rekap',    label: 'Rekap',       icon: ClipboardList },
  { id: 'laporan',  label: 'Laporan',     icon: BarChart3 },
  { id: 'jadwal',   label: 'Jadwal Kerja', icon: CalendarClock },
  { id: 'setting',  label: 'Pengaturan',  icon: Settings2 },
]

export default function TAAttendancePage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState('rekap')

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center">
          <Fingerprint className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-off-white">Absensi Digital</h1>
          <p className="text-sm text-muted">Kehadiran staf kasir &amp; barber berbasis GPS</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === tb.id ? 'bg-gold text-dark' : 'text-muted hover:text-off-white bg-dark-card'
            }`}
          >
            <tb.icon className="w-4 h-4" /> {tb.label}
          </button>
        ))}
      </div>

      {tab === 'rekap'   && <RekapTab tenantId={user?.tenantId} />}
      {tab === 'laporan' && <LaporanTab tenantId={user?.tenantId} />}
      {tab === 'jadwal'  && <JadwalTab />}
      {tab === 'setting' && <PengaturanTab tenantId={user?.tenantId} />}
    </div>
  )
}

// ── Banner fitur nonaktif ────────────────────────────────────────────────────
function FeatureOff() {
  return (
    <Card>
      <CardBody className="text-center py-10">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-off-white mb-1">Fitur belum aktif</h2>
        <p className="text-sm text-muted">
          Absensi Digital tersedia di paket Pro &amp; Enterprise. Hubungi BarberOS untuk mengaktifkannya.
        </p>
      </CardBody>
    </Card>
  )
}

function KpiTile({ label, value, variant = 'gold' }) {
  const color = { gold: 'text-gold', green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400', blue: 'text-blue-400' }[variant]
  return (
    <Card>
      <CardBody className="py-3">
        <p className="text-xs text-muted">{label}</p>
        <p className={`text-xl font-bold ${color} mt-0.5`}>{value}</p>
      </CardBody>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB: REKAP
// ════════════════════════════════════════════════════════════════════════════
function RekapTab({ tenantId }) {
  const toast = useToast()
  const { data: branches = [] } = useBranches(tenantId)
  const [filters, setFilters] = useState({
    startDate: todayYmd(), endDate: todayYmd(), branchId: '', status: '', search: '',
  })
  const [page, setPage] = useState(1)
  const [editRow, setEditRow] = useState(null)
  const [showManual, setShowManual] = useState(false)

  useEffect(() => { setPage(1) }, [filters])

  const params = useMemo(() => {
    const p = { page, limit: 20 }
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v })
    return p
  }, [filters, page])

  const statsParams = useMemo(() => {
    const p = {}
    if (filters.startDate) p.startDate = filters.startDate
    if (filters.endDate) p.endDate = filters.endDate
    if (filters.branchId) p.branchId = filters.branchId
    return p
  }, [filters])

  const { data: list, isLoading, error } = useAttendanceList(params)
  const { data: stats } = useAttendanceStats(statsParams)

  if (error?.response?.status === 403) return <FeatureOff />

  const rows = list?.data || []
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  const exportCSV = () => {
    if (rows.length === 0) return toast.error('Tidak ada data untuk diekspor.')
    downloadCSV(
      `absensi-${filters.startDate}_${filters.endDate}.csv`,
      ['Tanggal', 'Staf', 'Peran', 'Cabang', 'Masuk', 'Pulang', 'Durasi', 'Terlambat (m)', 'Status', 'Catatan'],
      rows.map((r) => [
        fmtDateLong(r.date), r.staffName || r.staff?.name || '-', r.staffRole || r.staff?.role || '-',
        r.branch?.name || '-', fmtTime(r.checkInAt), fmtTime(r.checkOutAt),
        fmtDuration(r.workedMinutes), r.lateMinutes || 0, statusMeta(r.status).label, r.note || '',
      ]),
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Tepat Waktu" value={stats?.present ?? 0} variant="green" />
        <KpiTile label="Terlambat" value={stats?.late ?? 0} variant="amber" />
        <KpiTile label="Izin / Alpa" value={(stats?.leave ?? 0) + (stats?.absent ?? 0)} variant="red" />
        <KpiTile label="Total Jam Kerja" value={fmtDuration(stats?.totalWorkedMinutes ?? 0)} variant="gold" />
      </div>

      {/* Filter */}
      <Card>
        <CardBody className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <input type="date" value={filters.startDate} max={filters.endDate || undefined}
            onChange={(e) => set({ startDate: e.target.value })} className={inputCls} aria-label="Dari tanggal" />
          <input type="date" value={filters.endDate} min={filters.startDate || undefined}
            onChange={(e) => set({ endDate: e.target.value })} className={inputCls} aria-label="Sampai tanggal" />
          <select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className={inputCls} aria-label="Cabang">
            <option value="">Semua cabang</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })} className={inputCls} aria-label="Status">
            <option value="">Semua status</option>
            {Object.entries(ATT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="text" value={filters.search} placeholder="Cari nama staf…"
            onChange={(e) => set({ search: e.target.value })} className={inputCls} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={Download} onClick={exportCSV} className="flex-1">CSV</Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" icon={ClipboardList} onClick={() => setShowManual(true)}>Catat Izin / Alpa</Button>
      </div>

      {/* Tabel */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Tidak ada catatan absensi pada filter ini.</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-dark-border">
                      <th className="px-4 py-2.5">Tanggal</th>
                      <th className="px-4 py-2.5">Staf</th>
                      <th className="px-4 py-2.5">Cabang</th>
                      <th className="px-4 py-2.5">Masuk</th>
                      <th className="px-4 py-2.5">Pulang</th>
                      <th className="px-4 py-2.5">Durasi</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-dark-border/60 hover:bg-dark-surface/50">
                        <td className="px-4 py-2.5 text-off-white">{fmtDateLong(r.date)}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-off-white">{r.staffName || r.staff?.name}</p>
                          <p className="text-xs text-muted capitalize">{r.staffRole || r.staff?.role}</p>
                        </td>
                        <td className="px-4 py-2.5 text-muted">{r.branch?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-off-white">
                          {fmtTime(r.checkInAt)}
                          {r.lateMinutes > 0 && <span className="text-amber-400 text-xs"> +{r.lateMinutes}m</span>}
                        </td>
                        <td className="px-4 py-2.5 text-off-white">{fmtTime(r.checkOutAt)}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtDuration(r.workedMinutes)}</td>
                        <td className="px-4 py-2.5"><Badge variant={statusMeta(r.status).variant}>{statusMeta(r.status).label}</Badge></td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setEditRow(r)} className="text-muted hover:text-gold" aria-label="Koreksi">
                            <Pencil className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="md:hidden divide-y divide-dark-border">
                {rows.map((r) => (
                  <li key={r.id} className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-off-white truncate">{r.staffName || r.staff?.name}</p>
                        <p className="text-xs text-muted">{fmtDateLong(r.date)} · {r.branch?.name || '-'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={statusMeta(r.status).variant}>{statusMeta(r.status).label}</Badge>
                        <button onClick={() => setEditRow(r)} className="text-muted hover:text-gold" aria-label="Koreksi">
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted">
                      <span>Masuk: <span className="text-off-white">{fmtTime(r.checkInAt)}</span>
                        {r.lateMinutes > 0 && <span className="text-amber-400"> +{r.lateMinutes}m</span>}</span>
                      <span>Pulang: <span className="text-off-white">{fmtTime(r.checkOutAt)}</span></span>
                      <span>Durasi: <span className="text-off-white">{fmtDuration(r.workedMinutes)}</span></span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      {/* Pagination */}
      {list && list.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
          <span className="text-sm text-muted">Hal {list.page} / {list.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= list.totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
        </div>
      )}

      {editRow && <StatusEditModal row={editRow} onClose={() => setEditRow(null)} />}
      {showManual && <ManualEntryModal tenantId={tenantId} onClose={() => setShowManual(false)} />}
    </div>
  )
}

// ── Modal koreksi status ─────────────────────────────────────────────────────
function StatusEditModal({ row, onClose }) {
  const toast = useToast()
  const update = useUpdateAttendance()
  const [status, setStatus] = useState(row.status)
  const [note, setNote] = useState(row.note || '')

  const save = async () => {
    try {
      await update.mutateAsync({ id: row.id, status, note })
      toast.success('Catatan absensi diperbarui.')
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan.')
    }
  }

  return (
    <ModalShell title="Koreksi Absensi" onClose={onClose}>
      <p className="text-sm text-muted mb-3">{row.staffName || row.staff?.name} · {fmtDateLong(row.date)}</p>
      {(row.checkInPhoto || row.checkOutPhoto) && (
        <div className="flex gap-2 mb-3">
          {row.checkInPhoto && (
            <a href={row.checkInPhoto} target="_blank" rel="noreferrer" className="flex-1">
              <img src={row.checkInPhoto} alt="Selfie check-in" className="w-full h-28 object-cover rounded-lg border border-dark-border" />
              <span className="block text-[10px] text-muted text-center mt-1">Check-in {fmtTime(row.checkInAt)}</span>
            </a>
          )}
          {row.checkOutPhoto && (
            <a href={row.checkOutPhoto} target="_blank" rel="noreferrer" className="flex-1">
              <img src={row.checkOutPhoto} alt="Selfie check-out" className="w-full h-28 object-cover rounded-lg border border-dark-border" />
              <span className="block text-[10px] text-muted text-center mt-1">Check-out {fmtTime(row.checkOutAt)}</span>
            </a>
          )}
        </div>
      )}
      <label className="block text-xs text-muted mb-1">Status</label>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls + ' mb-3'}>
        {Object.entries(ATT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <label className="block text-xs text-muted mb-1">Catatan</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300}
        className={inputCls + ' mb-4 resize-none'} placeholder="Opsional…" />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose} fullWidth>Batal</Button>
        <Button onClick={save} loading={update.isLoading} fullWidth>Simpan</Button>
      </div>
    </ModalShell>
  )
}

// ── Modal catat izin/alpa manual ─────────────────────────────────────────────
function ManualEntryModal({ tenantId, onClose }) {
  const toast = useToast()
  const { data: staffList = [] } = useAttendanceSchedules()
  const manual = useManualAttendance()
  const [form, setForm] = useState({ staffId: '', date: todayYmd(), status: 'leave', note: '' })

  const save = async () => {
    if (!form.staffId) return toast.error('Pilih staf terlebih dahulu.')
    try {
      await manual.mutateAsync(form)
      toast.success('Catatan absensi disimpan.')
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan.')
    }
  }

  return (
    <ModalShell title="Catat Izin / Alpa" onClose={onClose}>
      <label className="block text-xs text-muted mb-1">Staf</label>
      <select value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))} className={inputCls + ' mb-3'}>
        <option value="">— Pilih staf —</option>
        {staffList.map((s) => <option key={s.staffId} value={s.staffId}>{s.name} ({s.role})</option>)}
      </select>
      <label className="block text-xs text-muted mb-1">Tanggal</label>
      <input type="date" value={form.date} max={todayYmd()}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputCls + ' mb-3'} />
      <label className="block text-xs text-muted mb-1">Status</label>
      <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputCls + ' mb-3'}>
        <option value="leave">Izin</option>
        <option value="absent">Alpa</option>
        <option value="present">Hadir</option>
      </select>
      <label className="block text-xs text-muted mb-1">Catatan</label>
      <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} maxLength={300}
        className={inputCls + ' mb-4 resize-none'} placeholder="Mis. izin sakit…" />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose} fullWidth>Batal</Button>
        <Button onClick={save} loading={manual.isLoading} fullWidth>Simpan</Button>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB: LAPORAN
// ════════════════════════════════════════════════════════════════════════════
function LaporanTab({ tenantId }) {
  const toast = useToast()
  const { data: branches = [] } = useBranches(tenantId)
  const [filters, setFilters] = useState({ startDate: monthStart(), endDate: todayYmd(), branchId: '' })

  const params = useMemo(() => {
    const p = { startDate: filters.startDate, endDate: filters.endDate }
    if (filters.branchId) p.branchId = filters.branchId
    return p
  }, [filters])

  const { data: report, isLoading, error } = useAttendanceReport(params)
  if (error?.response?.status === 403) return <FeatureOff />

  const rows = report?.rows || []
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }))

  const exportCSV = () => {
    if (rows.length === 0) return toast.error('Tidak ada data untuk diekspor.')
    downloadCSV(
      `laporan-absensi-${filters.startDate}_${filters.endDate}.csv`,
      ['Staf', 'Peran', 'Cabang', 'Hari Kerja', 'Hadir', 'Terlambat', 'Alpa', 'Izin', 'Total Terlambat (m)', 'Total Jam (m)', 'Rata2 Jam (m)'],
      rows.map((r) => [
        r.name, r.role, r.branchName, r.scheduledDays, r.attendedDays, r.late, r.absent, r.leave,
        r.totalLateMinutes, r.totalWorkedMinutes, r.avgWorkedMinutes,
      ]),
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <input type="date" value={filters.startDate} max={filters.endDate}
            onChange={(e) => set({ startDate: e.target.value })} className={inputCls} aria-label="Dari tanggal" />
          <input type="date" value={filters.endDate} min={filters.startDate} max={todayYmd()}
            onChange={(e) => set({ endDate: e.target.value })} className={inputCls} aria-label="Sampai tanggal" />
          <select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className={inputCls} aria-label="Cabang">
            <option value="">Semua cabang</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Button variant="outline" size="sm" icon={Download} onClick={exportCSV}>Ekspor CSV</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">Belum ada staf kasir/barber untuk dilaporkan.</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-dark-border">
                      <th className="px-4 py-2.5">Staf</th>
                      <th className="px-4 py-2.5">Cabang</th>
                      <th className="px-4 py-2.5 text-center">Hari Kerja</th>
                      <th className="px-4 py-2.5 text-center">Hadir</th>
                      <th className="px-4 py-2.5 text-center">Terlambat</th>
                      <th className="px-4 py-2.5 text-center">Alpa</th>
                      <th className="px-4 py-2.5 text-center">Izin</th>
                      <th className="px-4 py-2.5">Total Jam</th>
                      <th className="px-4 py-2.5">Rata² / Hari</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.staffId} className="border-b border-dark-border/60 hover:bg-dark-surface/50">
                        <td className="px-4 py-2.5">
                          <p className="text-off-white">{r.name}</p>
                          <p className="text-xs text-muted capitalize">{r.role}</p>
                        </td>
                        <td className="px-4 py-2.5 text-muted">{r.branchName}</td>
                        <td className="px-4 py-2.5 text-center text-off-white">{r.scheduledDays}</td>
                        <td className="px-4 py-2.5 text-center text-green-400">{r.attendedDays}</td>
                        <td className="px-4 py-2.5 text-center text-amber-400">{r.late}</td>
                        <td className="px-4 py-2.5 text-center text-red-400">{r.absent}</td>
                        <td className="px-4 py-2.5 text-center text-blue-400">{r.leave}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtDuration(r.totalWorkedMinutes)}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtDuration(r.avgWorkedMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="md:hidden divide-y divide-dark-border">
                {rows.map((r) => (
                  <li key={r.staffId} className="p-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-off-white">{r.name}</p>
                        <p className="text-xs text-muted capitalize">{r.role} · {r.branchName}</p>
                      </div>
                      <p className="text-xs text-muted">{fmtDuration(r.totalWorkedMinutes)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Badge variant="muted">Hari kerja {r.scheduledDays}</Badge>
                      <Badge variant="success">Hadir {r.attendedDays}</Badge>
                      <Badge variant="warning">Telat {r.late}</Badge>
                      <Badge variant="danger">Alpa {r.absent}</Badge>
                      <Badge variant="info">Izin {r.leave}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>
      <p className="text-xs text-muted px-1">
        Alpa = hari terjadwal kerja tanpa catatan absensi. Hari libur tidak dihitung sebagai hari kerja.
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB: JADWAL KERJA
// ════════════════════════════════════════════════════════════════════════════
function JadwalTab() {
  const { data: staffList = [], isLoading, error } = useAttendanceSchedules()
  const [editStaff, setEditStaff] = useState(null)

  if (error?.response?.status === 403) return <FeatureOff />
  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-gold animate-spin" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs text-muted">
        <Info className="w-4 h-4 text-gold/80 mt-0.5 shrink-0" />
        <p>
          Jadwal mingguan di sini jadi <span className="text-off-white">dasar perhitungan terlambat</span>.
          Untuk shift barber tanggal-spesifik (Pagi/Sore/Full),
          <Link to="/admin/schedule" className="ml-1 inline-flex items-center gap-1 text-gold hover:underline">
            buka halaman Jadwal Barber <ExternalLink className="w-3 h-3" />
          </Link>
          — bila barber punya shift di tanggal tertentu, jam itu yang dipakai (override jadwal mingguan).
        </p>
      </div>
      {staffList.length === 0 && (
        <Card><CardBody className="py-10 text-center text-sm text-muted">Belum ada staf kasir/barber.</CardBody></Card>
      )}
      {staffList.map((s) => {
        const offDays = s.schedule.filter((d) => d.isDayOff).length
        return (
          <Card key={s.staffId}>
            <CardBody className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-off-white truncate">{s.name}</p>
                <p className="text-xs text-muted capitalize">
                  {s.role} · {s.branchName || 'Tanpa cabang'} · {7 - offDays} hari kerja / minggu
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {WEEK_ORDER.map((dow) => {
                    const d = s.schedule.find((x) => x.dayOfWeek === dow)
                    return (
                      <span key={dow} className={`text-[10px] px-1.5 py-0.5 rounded ${
                        d?.isDayOff ? 'bg-dark-surface text-muted' : 'bg-gold/10 text-gold'
                      }`}>
                        {DAY_NAMES_SHORT[dow]}
                      </span>
                    )
                  })}
                </div>
              </div>
              <Button variant="outline" size="sm" icon={Pencil} onClick={() => setEditStaff(s)}>Atur</Button>
            </CardBody>
          </Card>
        )
      })}
      {editStaff && <ScheduleEditorModal staff={editStaff} onClose={() => setEditStaff(null)} />}
    </div>
  )
}

function ScheduleEditorModal({ staff, onClose }) {
  const toast = useToast()
  const update = useUpdateSchedule()
  const bulk = useBulkSchedule()
  const [days, setDays] = useState(() => staff.schedule.map((d) => ({ ...d })))
  const [applyAll, setApplyAll] = useState(false)

  const setDay = (dow, patch) =>
    setDays((arr) => arr.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)))

  const save = async () => {
    try {
      if (applyAll) {
        const res = await bulk.mutateAsync({ days })
        toast.success(`Jadwal diterapkan ke ${res?.staffCount ?? 'semua'} staf.`)
      } else {
        await update.mutateAsync({ staffId: staff.staffId, days })
        toast.success('Jadwal kerja disimpan.')
      }
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan jadwal.')
    }
  }

  return (
    <ModalShell title={`Jadwal Kerja — ${staff.name}`} onClose={onClose}>
      <div className="space-y-2 mb-4">
        {WEEK_ORDER.map((dow) => {
          const d = days.find((x) => x.dayOfWeek === dow)
          return (
            <div key={dow} className="flex items-center gap-2">
              <span className="w-16 text-sm text-off-white flex-shrink-0">{DAY_NAMES[dow]}</span>
              <label className="flex items-center gap-1.5 text-xs text-muted flex-shrink-0">
                <input type="checkbox" checked={d.isDayOff}
                  onChange={(e) => setDay(dow, { isDayOff: e.target.checked })}
                  className="accent-gold" />
                Libur
              </label>
              <input type="time" value={d.startTime} disabled={d.isDayOff}
                onChange={(e) => setDay(dow, { startTime: e.target.value })}
                className={inputCls + ' flex-1 disabled:opacity-40'} />
              <span className="text-muted text-xs">–</span>
              <input type="time" value={d.endTime} disabled={d.isDayOff}
                onChange={(e) => setDay(dow, { endTime: e.target.value })}
                className={inputCls + ' flex-1 disabled:opacity-40'} />
            </div>
          )
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted mb-3">
        <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="accent-gold" />
        Terapkan jadwal ini ke <span className="text-off-white">semua staf</span> kasir &amp; barber
      </label>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose} fullWidth>Batal</Button>
        <Button onClick={save} loading={update.isLoading || bulk.isLoading} icon={Save} fullWidth>Simpan</Button>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB: PENGATURAN
// ════════════════════════════════════════════════════════════════════════════
function PengaturanTab({ tenantId }) {
  const toast = useToast()
  const { data: tenant } = useTenant(tenantId)
  const { data: branches = [], error: branchErr } = useBranches(tenantId)
  const updateTenant = useUpdateMyTenant()
  const updateBranch = useUpdateBranch()

  const [cfg, setCfg] = useState({
    enabled: true, lateToleranceMin: 10, autoCheckOut: true, maxAccuracyM: 75, requireSelfie: false,
  })
  useEffect(() => {
    const c = tenant?.attendanceConfig
    if (c) setCfg({
      enabled: c.enabled !== false,
      lateToleranceMin: typeof c.lateToleranceMin === 'number' ? c.lateToleranceMin : 10,
      autoCheckOut: c.autoCheckOut !== false,
      maxAccuracyM: typeof c.maxAccuracyM === 'number' ? c.maxAccuracyM : 75,
      requireSelfie: c.requireSelfie === true,
    })
  }, [tenant?.attendanceConfig])

  const saveCfg = async () => {
    try {
      await updateTenant.mutateAsync({ attendanceConfig: cfg })
      toast.success('Pengaturan absensi disimpan.')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Konfigurasi umum */}
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-off-white">Konfigurasi Umum</h2></CardHeader>
        <CardBody className="space-y-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-off-white">Aktifkan absensi
              <span className="block text-xs text-muted">Bila dimatikan, staf tidak bisa check-in.</span>
            </span>
            <input type="checkbox" checked={cfg.enabled} className="accent-gold w-4 h-4"
              onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} />
          </label>
          <div className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">Toleransi terlambat
              <span className="block text-xs text-muted">Menit setelah jam masuk sebelum dihitung terlambat.</span>
            </span>
            <input type="number" min={0} max={120} value={cfg.lateToleranceMin}
              onChange={(e) => setCfg((c) => ({ ...c, lateToleranceMin: Math.max(0, Math.min(120, +e.target.value || 0)) }))}
              className={inputCls + ' w-24 text-center'} />
          </div>
          <label className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">Auto check-out
              <span className="block text-xs text-muted">Tutup otomatis absen yang lupa di-checkout di akhir hari.</span>
            </span>
            <input type="checkbox" checked={cfg.autoCheckOut} className="accent-gold w-4 h-4"
              onChange={(e) => setCfg((c) => ({ ...c, autoCheckOut: e.target.checked }))} />
          </label>
          <div className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">Akurasi GPS maksimum
              <span className="block text-xs text-muted">Absen ditolak bila akurasi GPS lebih buruk dari nilai ini (meter).</span>
            </span>
            <input type="number" min={20} max={500} value={cfg.maxAccuracyM}
              onChange={(e) => setCfg((c) => ({ ...c, maxAccuracyM: Math.max(20, Math.min(500, +e.target.value || 75)) }))}
              className={inputCls + ' w-24 text-center'} />
          </div>
          <label className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">Wajib foto selfie
              <span className="block text-xs text-muted">Staf harus mengambil foto selfie tiap check-in &amp; check-out sebagai bukti.</span>
            </span>
            <input type="checkbox" checked={cfg.requireSelfie} className="accent-gold w-4 h-4"
              onChange={(e) => setCfg((c) => ({ ...c, requireSelfie: e.target.checked }))} />
          </label>
          <Button onClick={saveCfg} loading={updateTenant.isLoading} icon={Save}>Simpan Konfigurasi</Button>
        </CardBody>
      </Card>

      {/* Koordinat cabang */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-off-white">Koordinat Cabang (Geofence)</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-muted">
            Staf hanya bisa check-in dalam radius yang ditentukan dari titik koordinat cabang.
            Buka lokasi cabang di Google Maps, atau tekan &ldquo;Lokasi saya&rdquo; saat berada di cabang.
          </p>
          {branchErr ? (
            <p className="text-sm text-muted">Gagal memuat cabang.</p>
          ) : branches.length === 0 ? (
            <p className="text-sm text-muted">Belum ada cabang.</p>
          ) : (
            branches.map((b) => <BranchGeofenceRow key={b.id} branch={b} tenantId={tenantId} updateBranch={updateBranch} />)
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function BranchGeofenceRow({ branch, tenantId, updateBranch }) {
  const toast = useToast()
  const [form, setForm] = useState({
    latitude: branch.latitude ?? '',
    longitude: branch.longitude ?? '',
    attendanceRadius: branch.attendanceRadius ?? 100,
  })
  const [locating, setLocating] = useState(false)

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Perangkat tidak mendukung GPS.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: +pos.coords.latitude.toFixed(6),
          longitude: +pos.coords.longitude.toFixed(6),
        }))
        setLocating(false)
        toast.success('Lokasi terisi. Jangan lupa simpan.')
      },
      () => { setLocating(false); toast.error('Gagal membaca lokasi GPS.') },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const save = async () => {
    const lat = form.latitude === '' ? null : Number(form.latitude)
    const lng = form.longitude === '' ? null : Number(form.longitude)
    if ((lat === null) !== (lng === null)) return toast.error('Isi koordinat lengkap (lat & lng) atau kosongkan keduanya.')
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return toast.error('Latitude tidak valid.')
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return toast.error('Longitude tidak valid.')
    try {
      await updateBranch.mutateAsync({
        id: branch.id, tenantId,
        latitude: lat, longitude: lng,
        attendanceRadius: Math.max(10, Math.min(5000, +form.attendanceRadius || 100)),
      })
      toast.success(`Koordinat "${branch.name}" disimpan.`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan koordinat.')
    }
  }

  const configured = branch.latitude != null && branch.longitude != null

  return (
    <div className="border border-dark-border rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-off-white">{branch.name}</p>
        <Badge variant={configured ? 'success' : 'warning'}>{configured ? 'Terkonfigurasi' : 'Belum diatur'}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] text-muted mb-0.5">Latitude</label>
          <input type="number" step="any" value={form.latitude} placeholder="-6.200000"
            onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-0.5">Longitude</label>
          <input type="number" step="any" value={form.longitude} placeholder="106.816666"
            onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-0.5">Radius (m)</label>
          <input type="number" min={10} max={5000} value={form.attendanceRadius}
            onChange={(e) => setForm((f) => ({ ...f, attendanceRadius: e.target.value }))} className={inputCls} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" icon={Navigation} onClick={useMyLocation} loading={locating}>Lokasi saya</Button>
        <Button size="sm" icon={Save} onClick={save} loading={updateBranch.isLoading}>Simpan</Button>
        {form.latitude !== '' && form.longitude !== '' && (
          <a
            href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
          >
            <MapPin className="w-3.5 h-3.5" /> Lihat di Maps
          </a>
        )}
      </div>
    </div>
  )
}

// ── Modal generik ────────────────────────────────────────────────────────────
function ModalShell({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-off-white">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-off-white" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

import React, { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
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
import { useBarberSchedules } from '../../hooks/useBarberSchedules.js'
import {
  DAY_NAMES, DAY_NAMES_SHORT, ATT_STATUS, statusMeta, fmtDuration, fmtTime, fmtDateLong,
} from '../../utils/attendance.js'

const inputCls = 'w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-off-white focus:border-brand/40 focus:outline-none'
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
  { id: 'rekap',    labelKey: 'tabRekap',   icon: ClipboardList },
  { id: 'laporan',  labelKey: 'tabLaporan', icon: BarChart3 },
  { id: 'jadwal',   labelKey: 'tabJadwal',  icon: CalendarClock },
  { id: 'setting',  labelKey: 'tabSetting', icon: Settings2 },
]

export default function TAAttendancePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [sp, setSp] = useSearchParams()
  const initialTab = TABS.some((t) => t.id === sp.get('tab')) ? sp.get('tab') : 'rekap'
  const [tab, _setTab] = useState(initialTab)
  const setTab = (id) => {
    _setTab(id)
    const next = new URLSearchParams(sp)
    if (id === 'rekap') next.delete('tab'); else next.set('tab', id)
    setSp(next, { replace: true })
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/15 flex items-center justify-center">
          <Fingerprint className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-off-white">{t('tenantAdmin.attendance.pageTitle')}</h1>
          <p className="text-sm text-muted">{t('tenantAdmin.attendance.pageSubtitle')}</p>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === tb.id ? 'bg-brand text-dark' : 'text-muted hover:text-off-white bg-dark-card'
            }`}
          >
            <tb.icon className="w-4 h-4" /> {t(`tenantAdmin.attendance.${tb.labelKey}`)}
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
  const { t } = useTranslation()
  return (
    <Card>
      <CardBody className="text-center py-10">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-off-white mb-1">{t('tenantAdmin.attendance.featureOffTitle')}</h2>
        <p className="text-sm text-muted">
          {t('tenantAdmin.attendance.featureOffDesc')}
        </p>
      </CardBody>
    </Card>
  )
}

function KpiTile({ label, value, variant = 'gold' }) {
  const color = { gold: 'text-brand', green: 'text-green-400', amber: 'text-amber-400', red: 'text-red-400', blue: 'text-blue-400' }[variant]
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
  const { t } = useTranslation()
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
    if (rows.length === 0) return toast.error(t('tenantAdmin.attendance.noDataToExport'))
    downloadCSV(
      `absensi-${filters.startDate}_${filters.endDate}.csv`,
      [t('tenantAdmin.attendance.csvDate'), t('tenantAdmin.attendance.csvStaff'), t('tenantAdmin.attendance.csvRole'), t('tenantAdmin.attendance.csvBranch'), t('tenantAdmin.attendance.csvCheckIn'), t('tenantAdmin.attendance.csvCheckOut'), t('tenantAdmin.attendance.csvDuration'), t('tenantAdmin.attendance.csvLateMin'), t('tenantAdmin.attendance.csvStatus'), t('tenantAdmin.attendance.csvNote')],
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
        <KpiTile label={t('tenantAdmin.attendance.kpiOnTime')} value={stats?.present ?? 0} variant="green" />
        <KpiTile label={t('tenantAdmin.attendance.kpiLate')} value={stats?.late ?? 0} variant="amber" />
        <KpiTile label={t('tenantAdmin.attendance.kpiLeaveAbsent')} value={(stats?.leave ?? 0) + (stats?.absent ?? 0)} variant="red" />
        <KpiTile label={t('tenantAdmin.attendance.kpiTotalHours')} value={fmtDuration(stats?.totalWorkedMinutes ?? 0)} variant="gold" />
      </div>

      {/* Filter */}
      <Card>
        <CardBody className="grid grid-cols-2 lg:grid-cols-6 gap-2">
          <input type="date" value={filters.startDate} max={filters.endDate || undefined}
            onChange={(e) => set({ startDate: e.target.value })} className={inputCls} aria-label={t('tenantAdmin.attendance.fromDate')} />
          <input type="date" value={filters.endDate} min={filters.startDate || undefined}
            onChange={(e) => set({ endDate: e.target.value })} className={inputCls} aria-label={t('tenantAdmin.attendance.toDate')} />
          <select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className={inputCls} aria-label={t('tenantAdmin.attendance.branch')}>
            <option value="">{t('tenantAdmin.attendance.allBranches')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })} className={inputCls} aria-label={t('tenantAdmin.attendance.status')}>
            <option value="">{t('tenantAdmin.attendance.allStatus')}</option>
            {Object.entries(ATT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <input type="text" value={filters.search} placeholder={t('tenantAdmin.attendance.searchStaffPlaceholder')}
            onChange={(e) => set({ search: e.target.value })} className={inputCls} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={Download} onClick={exportCSV} className="flex-1">CSV</Button>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" icon={ClipboardList} onClick={() => setShowManual(true)}>{t('tenantAdmin.attendance.recordLeaveAbsent')}</Button>
      </div>

      {/* Tabel */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-brand animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">{t('tenantAdmin.attendance.noRecordsForFilter')}</p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-dark-border">
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colDate')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colStaff')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colBranch')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colSchedule')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colCheckIn')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colCheckOut')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colDuration')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colStatus')}</th>
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
                        <td className="px-4 py-2.5 text-muted tabular-nums whitespace-nowrap">
                          {r.scheduleStart && r.scheduleEnd ? `${r.scheduleStart}–${r.scheduleEnd}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-off-white">
                          {fmtTime(r.checkInAt)}
                          {r.lateMinutes > 0 && <span className="text-amber-400 text-xs"> +{r.lateMinutes}m</span>}
                        </td>
                        <td className="px-4 py-2.5 text-off-white">{fmtTime(r.checkOutAt)}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtDuration(r.workedMinutes)}</td>
                        <td className="px-4 py-2.5"><Badge variant={statusMeta(r.status).variant}>{statusMeta(r.status).label}</Badge></td>
                        <td className="px-4 py-2.5 text-right">
                          <button onClick={() => setEditRow(r)} className="text-muted hover:text-brand" aria-label={t('tenantAdmin.attendance.correct')}>
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
                        <button onClick={() => setEditRow(r)} className="text-muted hover:text-brand" aria-label={t('tenantAdmin.attendance.correct')}>
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{t('tenantAdmin.attendance.colCheckIn')}: <span className="text-off-white tabular-nums">{fmtTime(r.checkInAt)}</span>
                        {r.lateMinutes > 0 && <span className="text-amber-400"> +{r.lateMinutes}m</span>}</span>
                      <span>{t('tenantAdmin.attendance.colCheckOut')}: <span className="text-off-white tabular-nums">{fmtTime(r.checkOutAt)}</span></span>
                      <span>{t('tenantAdmin.attendance.colDuration')}: <span className="text-off-white">{fmtDuration(r.workedMinutes)}</span></span>
                      {r.scheduleStart && r.scheduleEnd && (
                        <span>{t('tenantAdmin.attendance.colSchedule')}: <span className="text-off-white tabular-nums">{r.scheduleStart}–{r.scheduleEnd}</span></span>
                      )}
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('tenantAdmin.attendance.prevPage')}</Button>
          <span className="text-sm text-muted">{t('tenantAdmin.attendance.pageInfo', { page: list.page, pages: list.totalPages })}</span>
          <Button variant="outline" size="sm" disabled={page >= list.totalPages} onClick={() => setPage((p) => p + 1)}>{t('tenantAdmin.attendance.nextPage')}</Button>
        </div>
      )}

      {editRow && <StatusEditModal row={editRow} onClose={() => setEditRow(null)} />}
      {showManual && <ManualEntryModal tenantId={tenantId} onClose={() => setShowManual(false)} />}
    </div>
  )
}

// ── Modal koreksi status ─────────────────────────────────────────────────────
function StatusEditModal({ row, onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const update = useUpdateAttendance()
  const [status, setStatus] = useState(row.status)
  const [note, setNote] = useState(row.note || '')

  const save = async () => {
    try {
      await update.mutateAsync({ id: row.id, status, note })
      toast.success(t('tenantAdmin.attendance.recordUpdated'))
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.attendance.saveFailed'))
    }
  }

  return (
    <ModalShell title={t('tenantAdmin.attendance.correctTitle')} onClose={onClose}>
      <p className="text-sm text-muted mb-3">{row.staffName || row.staff?.name} · {fmtDateLong(row.date)}</p>
      {(row.checkInPhoto || row.checkOutPhoto) && (
        <div className="flex gap-2 mb-3">
          {row.checkInPhoto && (
            <a href={row.checkInPhoto} target="_blank" rel="noreferrer" className="flex-1">
              <img src={row.checkInPhoto} alt={t('tenantAdmin.attendance.selfieCheckIn')} className="w-full h-28 object-cover rounded-lg border border-dark-border" />
              <span className="block text-[10px] text-muted text-center mt-1">{t('tenantAdmin.attendance.checkInAt', { time: fmtTime(row.checkInAt) })}</span>
            </a>
          )}
          {row.checkOutPhoto && (
            <a href={row.checkOutPhoto} target="_blank" rel="noreferrer" className="flex-1">
              <img src={row.checkOutPhoto} alt={t('tenantAdmin.attendance.selfieCheckOut')} className="w-full h-28 object-cover rounded-lg border border-dark-border" />
              <span className="block text-[10px] text-muted text-center mt-1">{t('tenantAdmin.attendance.checkOutAt', { time: fmtTime(row.checkOutAt) })}</span>
            </a>
          )}
        </div>
      )}
      <label className="block text-xs text-muted mb-1">{t('tenantAdmin.attendance.status')}</label>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls + ' mb-3'}>
        {Object.entries(ATT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <label className="block text-xs text-muted mb-1">{t('tenantAdmin.attendance.note')}</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300}
        className={inputCls + ' mb-4 resize-none'} placeholder={t('tenantAdmin.attendance.optionalPlaceholder')} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose} fullWidth>{t('common.cancel')}</Button>
        <Button onClick={save} loading={update.isLoading} fullWidth>{t('common.save')}</Button>
      </div>
    </ModalShell>
  )
}

// ── Modal catat izin/alpa manual ─────────────────────────────────────────────
function ManualEntryModal({ tenantId, onClose }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data: staffList = [] } = useAttendanceSchedules()
  const manual = useManualAttendance()
  const [form, setForm] = useState({ staffId: '', date: todayYmd(), status: 'leave', note: '' })

  const save = async () => {
    if (!form.staffId) return toast.error(t('tenantAdmin.attendance.pickStaffFirst'))
    try {
      await manual.mutateAsync(form)
      toast.success(t('tenantAdmin.attendance.recordSaved'))
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.attendance.saveFailed'))
    }
  }

  return (
    <ModalShell title={t('tenantAdmin.attendance.recordLeaveAbsent')} onClose={onClose}>
      <label className="block text-xs text-muted mb-1">{t('tenantAdmin.attendance.staff')}</label>
      <select value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))} className={inputCls + ' mb-3'}>
        <option value="">{t('tenantAdmin.attendance.pickStaffOption')}</option>
        {staffList.map((s) => <option key={s.staffId} value={s.staffId}>{s.name} ({s.role})</option>)}
      </select>
      <label className="block text-xs text-muted mb-1">{t('tenantAdmin.attendance.date')}</label>
      <input type="date" value={form.date} max={todayYmd()}
        onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputCls + ' mb-3'} />
      <label className="block text-xs text-muted mb-1">{t('tenantAdmin.attendance.status')}</label>
      <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputCls + ' mb-3'}>
        <option value="leave">{t('tenantAdmin.attendance.statusLeave')}</option>
        <option value="absent">{t('tenantAdmin.attendance.statusAbsent')}</option>
        <option value="present">{t('tenantAdmin.attendance.statusPresent')}</option>
      </select>
      <label className="block text-xs text-muted mb-1">{t('tenantAdmin.attendance.note')}</label>
      <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} maxLength={300}
        className={inputCls + ' mb-4 resize-none'} placeholder={t('tenantAdmin.attendance.notePlaceholderSick')} />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose} fullWidth>{t('common.cancel')}</Button>
        <Button onClick={save} loading={manual.isLoading} fullWidth>{t('common.save')}</Button>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB: LAPORAN
// ════════════════════════════════════════════════════════════════════════════
function LaporanTab({ tenantId }) {
  const { t } = useTranslation()
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
    if (rows.length === 0) return toast.error(t('tenantAdmin.attendance.noDataToExport'))
    downloadCSV(
      `laporan-absensi-${filters.startDate}_${filters.endDate}.csv`,
      [t('tenantAdmin.attendance.csvStaff'), t('tenantAdmin.attendance.csvRole'), t('tenantAdmin.attendance.csvBranch'), t('tenantAdmin.attendance.rpWorkDays'), t('tenantAdmin.attendance.rpPresent'), t('tenantAdmin.attendance.rpLate'), t('tenantAdmin.attendance.rpAbsent'), t('tenantAdmin.attendance.rpLeave'), t('tenantAdmin.attendance.csvTotalLateMin'), t('tenantAdmin.attendance.csvTotalHoursMin'), t('tenantAdmin.attendance.csvAvgHoursMin')],
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
            onChange={(e) => set({ startDate: e.target.value })} className={inputCls} aria-label={t('tenantAdmin.attendance.fromDate')} />
          <input type="date" value={filters.endDate} min={filters.startDate} max={todayYmd()}
            onChange={(e) => set({ endDate: e.target.value })} className={inputCls} aria-label={t('tenantAdmin.attendance.toDate')} />
          <select value={filters.branchId} onChange={(e) => set({ branchId: e.target.value })} className={inputCls} aria-label={t('tenantAdmin.attendance.branch')}>
            <option value="">{t('tenantAdmin.attendance.allBranches')}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Button variant="outline" size="sm" icon={Download} onClick={exportCSV}>{t('tenantAdmin.attendance.exportCsv')}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-brand animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">{t('tenantAdmin.attendance.noStaffToReport')}</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-dark-border">
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colStaff')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.colBranch')}</th>
                      <th className="px-4 py-2.5 text-center">{t('tenantAdmin.attendance.rpWorkDays')}</th>
                      <th className="px-4 py-2.5 text-center">{t('tenantAdmin.attendance.rpPresent')}</th>
                      <th className="px-4 py-2.5 text-center">{t('tenantAdmin.attendance.rpLate')}</th>
                      <th className="px-4 py-2.5 text-center">{t('tenantAdmin.attendance.rpAbsent')}</th>
                      <th className="px-4 py-2.5 text-center">{t('tenantAdmin.attendance.rpLeave')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.rpTotalHours')}</th>
                      <th className="px-4 py-2.5">{t('tenantAdmin.attendance.rpAvgPerDay')}</th>
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
                      <Badge variant="muted">{t('tenantAdmin.attendance.rpWorkDays')} {r.scheduledDays}</Badge>
                      <Badge variant="success">{t('tenantAdmin.attendance.rpPresent')} {r.attendedDays}</Badge>
                      <Badge variant="warning">{t('tenantAdmin.attendance.rpLateShort')} {r.late}</Badge>
                      <Badge variant="danger">{t('tenantAdmin.attendance.rpAbsent')} {r.absent}</Badge>
                      <Badge variant="info">{t('tenantAdmin.attendance.rpLeave')} {r.leave}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardBody>
      </Card>
      <p className="text-xs text-muted px-1">
        {t('tenantAdmin.attendance.reportFootnote')}
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB: JADWAL KERJA
// ════════════════════════════════════════════════════════════════════════════
function JadwalTab() {
  const { t } = useTranslation()
  const { data: staffList = [], isLoading, error } = useAttendanceSchedules()
  const [editStaff, setEditStaff] = useState(null)

  // Senin minggu ini (lokal browser) — untuk hitung jumlah shift khusus
  // (BarberSchedule) per barber, ditampilkan sebagai badge.
  const weekStart = useMemo(() => {
    const d = new Date()
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
    return monday.toLocaleDateString('en-CA')
  }, [])
  const { data: weekBs = [] } = useBarberSchedules({ weekStart })
  const bsCountByStaff = useMemo(() => {
    const m = {}
    for (const s of weekBs) m[s.staffId] = (m[s.staffId] || 0) + 1
    return m
  }, [weekBs])

  if (error?.response?.status === 403) return <FeatureOff />
  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 text-brand animate-spin" /></div>

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-muted">
        <Info className="w-4 h-4 text-brand/80 mt-0.5 shrink-0" />
        <p>
          {t('tenantAdmin.attendance.scheduleInfoPart1')}{' '}
          <Link to="/admin/schedule" className="ml-1 inline-flex items-center gap-1 text-brand hover:underline">
            {t('tenantAdmin.attendance.scheduleInfoLink')} <ExternalLink className="w-3 h-3" />
          </Link>
          {t('tenantAdmin.attendance.scheduleInfoPart2')}
        </p>
      </div>
      {staffList.length === 0 && (
        <Card><CardBody className="py-10 text-center text-sm text-muted">{t('tenantAdmin.attendance.noCashierBarber')}</CardBody></Card>
      )}
      {staffList.map((s) => {
        const offDays = s.schedule.filter((d) => d.isDayOff).length
        const bsCount = bsCountByStaff[s.staffId] || 0
        return (
          <Card key={s.staffId}>
            <CardBody className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-off-white truncate">{s.name}</p>
                  {s.role === 'barber' && bsCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                      {t('tenantAdmin.attendance.specialShiftsThisWeek', { count: bsCount })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted capitalize">
                  {s.role} · {s.branchName || t('tenantAdmin.attendance.noBranch')} · {t('tenantAdmin.attendance.workDaysPerWeek', { count: 7 - offDays })}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {WEEK_ORDER.map((dow) => {
                    const d = s.schedule.find((x) => x.dayOfWeek === dow)
                    return (
                      <span key={dow} className={`text-[10px] px-1.5 py-0.5 rounded ${
                        d?.isDayOff ? 'bg-dark-surface text-muted' : 'bg-brand/10 text-brand'
                      }`}>
                        {DAY_NAMES_SHORT[dow]}
                      </span>
                    )
                  })}
                </div>
              </div>
              <Button variant="outline" size="sm" icon={Pencil} onClick={() => setEditStaff(s)}>{t('tenantAdmin.attendance.manage')}</Button>
            </CardBody>
          </Card>
        )
      })}
      {editStaff && <ScheduleEditorModal staff={editStaff} onClose={() => setEditStaff(null)} />}
    </div>
  )
}

function ScheduleEditorModal({ staff, onClose }) {
  const { t } = useTranslation()
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
        toast.success(t('tenantAdmin.attendance.scheduleAppliedToStaff', { count: res?.staffCount ?? t('tenantAdmin.attendance.allLabel') }))
      } else {
        await update.mutateAsync({ staffId: staff.staffId, days })
        toast.success(t('tenantAdmin.attendance.workScheduleSaved'))
      }
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.attendance.scheduleSaveFailed'))
    }
  }

  return (
    <ModalShell title={t('tenantAdmin.attendance.workScheduleTitle', { name: staff.name })} onClose={onClose}>
      <div className="space-y-2 mb-4">
        {WEEK_ORDER.map((dow) => {
          const d = days.find((x) => x.dayOfWeek === dow)
          return (
            <div key={dow} className="flex items-center gap-2">
              <span className="w-16 text-sm text-off-white flex-shrink-0">{DAY_NAMES[dow]}</span>
              <label className="flex items-center gap-1.5 text-xs text-muted flex-shrink-0">
                <input type="checkbox" checked={d.isDayOff}
                  onChange={(e) => setDay(dow, { isDayOff: e.target.checked })}
                  className="accent-brand" />
                {t('tenantAdmin.attendance.dayOff')}
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
        <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="accent-brand" />
        {t('tenantAdmin.attendance.applyToAllPart1')} <span className="text-off-white">{t('tenantAdmin.attendance.applyToAllHighlight')}</span> {t('tenantAdmin.attendance.applyToAllPart2')}
      </label>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose} fullWidth>{t('common.cancel')}</Button>
        <Button onClick={save} loading={update.isLoading || bulk.isLoading} icon={Save} fullWidth>{t('common.save')}</Button>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB: PENGATURAN
// ════════════════════════════════════════════════════════════════════════════
function PengaturanTab({ tenantId }) {
  const { t } = useTranslation()
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
      toast.success(t('tenantAdmin.attendance.configSaved'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.attendance.saveFailed'))
    }
  }

  return (
    <div className="space-y-4">
      {/* Konfigurasi umum */}
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-off-white">{t('tenantAdmin.attendance.generalConfig')}</h2></CardHeader>
        <CardBody className="space-y-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-off-white">{t('tenantAdmin.attendance.enableAttendance')}
              <span className="block text-xs text-muted">{t('tenantAdmin.attendance.enableAttendanceDesc')}</span>
            </span>
            <input type="checkbox" checked={cfg.enabled} className="accent-brand w-4 h-4"
              onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} />
          </label>
          <div className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">{t('tenantAdmin.attendance.lateTolerance')}
              <span className="block text-xs text-muted">{t('tenantAdmin.attendance.lateToleranceDesc')}</span>
            </span>
            <input type="number" min={0} max={120} value={cfg.lateToleranceMin}
              onChange={(e) => setCfg((c) => ({ ...c, lateToleranceMin: Math.max(0, Math.min(120, +e.target.value || 0)) }))}
              className={inputCls + ' w-24 text-center'} />
          </div>
          <label className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">{t('tenantAdmin.attendance.autoCheckout')}
              <span className="block text-xs text-muted">{t('tenantAdmin.attendance.autoCheckoutDesc')}</span>
            </span>
            <input type="checkbox" checked={cfg.autoCheckOut} className="accent-brand w-4 h-4"
              onChange={(e) => setCfg((c) => ({ ...c, autoCheckOut: e.target.checked }))} />
          </label>
          <div className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">{t('tenantAdmin.attendance.maxGpsAccuracy')}
              <span className="block text-xs text-muted">{t('tenantAdmin.attendance.maxGpsAccuracyDesc')}</span>
            </span>
            <input type="number" min={20} max={500} value={cfg.maxAccuracyM}
              onChange={(e) => setCfg((c) => ({ ...c, maxAccuracyM: Math.max(20, Math.min(500, +e.target.value || 75)) }))}
              className={inputCls + ' w-24 text-center'} />
          </div>
          <label className="flex items-center justify-between gap-3 border-t border-dark-border pt-4">
            <span className="text-sm text-off-white">{t('tenantAdmin.attendance.requireSelfie')}
              <span className="block text-xs text-muted">{t('tenantAdmin.attendance.requireSelfieDesc')}</span>
            </span>
            <input type="checkbox" checked={cfg.requireSelfie} className="accent-brand w-4 h-4"
              onChange={(e) => setCfg((c) => ({ ...c, requireSelfie: e.target.checked }))} />
          </label>
          <Button onClick={saveCfg} loading={updateTenant.isLoading} icon={Save}>{t('tenantAdmin.attendance.saveConfig')}</Button>
        </CardBody>
      </Card>

      {/* Koordinat cabang */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-off-white">{t('tenantAdmin.attendance.geofenceTitle')}</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-muted">
            {t('tenantAdmin.attendance.geofenceDesc')}
          </p>
          {branchErr ? (
            <p className="text-sm text-muted">{t('tenantAdmin.attendance.branchLoadFailed')}</p>
          ) : branches.length === 0 ? (
            <p className="text-sm text-muted">{t('tenantAdmin.attendance.noBranches')}</p>
          ) : (
            branches.map((b) => <BranchGeofenceRow key={b.id} branch={b} tenantId={tenantId} updateBranch={updateBranch} />)
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function BranchGeofenceRow({ branch, tenantId, updateBranch }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [form, setForm] = useState({
    latitude: branch.latitude ?? '',
    longitude: branch.longitude ?? '',
    attendanceRadius: branch.attendanceRadius ?? 100,
  })
  const [locating, setLocating] = useState(false)

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error(t('tenantAdmin.attendance.gpsNotSupported'))
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: +pos.coords.latitude.toFixed(6),
          longitude: +pos.coords.longitude.toFixed(6),
        }))
        setLocating(false)
        toast.success(t('tenantAdmin.attendance.locationFilled'))
      },
      () => { setLocating(false); toast.error(t('tenantAdmin.attendance.gpsReadFailed')) },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const save = async () => {
    const lat = form.latitude === '' ? null : Number(form.latitude)
    const lng = form.longitude === '' ? null : Number(form.longitude)
    if ((lat === null) !== (lng === null)) return toast.error(t('tenantAdmin.attendance.coordIncomplete'))
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return toast.error(t('tenantAdmin.attendance.latInvalid'))
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return toast.error(t('tenantAdmin.attendance.lngInvalid'))
    try {
      await updateBranch.mutateAsync({
        id: branch.id, tenantId,
        latitude: lat, longitude: lng,
        attendanceRadius: Math.max(10, Math.min(5000, +form.attendanceRadius || 100)),
      })
      toast.success(t('tenantAdmin.attendance.coordSaved', { name: branch.name }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.attendance.coordSaveFailed'))
    }
  }

  const configured = branch.latitude != null && branch.longitude != null

  return (
    <div className="border border-dark-border rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-off-white">{branch.name}</p>
        <Badge variant={configured ? 'success' : 'warning'}>{configured ? t('tenantAdmin.attendance.configured') : t('tenantAdmin.attendance.notConfigured')}</Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] text-muted mb-0.5">{t('tenantAdmin.attendance.latitude')}</label>
          <input type="number" step="any" value={form.latitude} placeholder="-6.200000"
            onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-0.5">{t('tenantAdmin.attendance.longitude')}</label>
          <input type="number" step="any" value={form.longitude} placeholder="106.816666"
            onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] text-muted mb-0.5">{t('tenantAdmin.attendance.radiusM')}</label>
          <input type="number" min={10} max={5000} value={form.attendanceRadius}
            onChange={(e) => setForm((f) => ({ ...f, attendanceRadius: e.target.value }))} className={inputCls} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" icon={Navigation} onClick={useMyLocation} loading={locating}>{t('tenantAdmin.attendance.myLocation')}</Button>
        <Button size="sm" icon={Save} onClick={save} loading={updateBranch.isLoading}>{t('common.save')}</Button>
        {form.latitude !== '' && form.longitude !== '' && (
          <a
            href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <MapPin className="w-3.5 h-3.5" /> {t('tenantAdmin.attendance.viewOnMaps')}
          </a>
        )}
      </div>
    </div>
  )
}

// ── Modal generik ────────────────────────────────────────────────────────────
function ModalShell({ title, children, onClose }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-off-white">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-off-white" aria-label={t('common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

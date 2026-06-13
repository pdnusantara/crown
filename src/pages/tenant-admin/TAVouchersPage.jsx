import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Copy, Check, Trash2, Tag, ToggleLeft, ToggleRight, Search,
  Download, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight,
  Pencil, CheckSquare, Square, X, Edit, Filter, ArrowDownAZ,
} from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore } from '../../store/authStore.js'
import {
  useVouchers, useCreateVoucher, useUpdateVoucher, useDeleteVoucher,
  useBulkDeleteVouchers, useBulkToggleVouchers, useVoucherStats,
} from '../../hooks/useVouchers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import { formatRupiah } from '../../utils/format.js'

const PAGE_SIZES = [10, 20, 50, 100]
const EMPTY_FORM = {
  code: '', type: 'percentage', value: '',
  minPurchase: '', maxUses: '', expiresAt: '', description: '', isActive: true,
}

function csvEscape(v) {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function isExpired(v) {
  return v.expiresAt ? new Date(v.expiresAt) < new Date() : false
}

function isExhausted(v) {
  return v.maxUses != null && v.usedCount >= v.maxUses
}

function statusOf(v) {
  if (isExpired(v)) return 'expired'
  if (!v.isActive) return 'inactive'
  if (isExhausted(v)) return 'exhausted'
  return 'active'
}

function TAVouchersInner() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const toast = useToast()

  // Filters / pagination state
  const [search, setSearch] = useState('')
  const [searchDeb, setSearchDeb] = useState('')
  const [status, setStatus] = useState('')   // '' | active | inactive | expired
  const [typeFilter, setTypeFilter] = useState('')
  const [sortBy, setSortBy] = useState('createdAt-desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    const id = setTimeout(() => setSearchDeb(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [searchDeb, status, typeFilter, sortBy, pageSize])

  const queryFilters = useMemo(() => ({
    page, limit: pageSize, sortBy,
    ...(searchDeb ? { search: searchDeb } : {}),
    ...(status ? { status } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  }), [page, pageSize, sortBy, searchDeb, status, typeFilter])

  const { data: payload, isLoading, isError, refetch, isFetching } = useVouchers(queryFilters)
  const { data: stats } = useVoucherStats()
  const vouchers = payload?.data || []
  const total = payload?.total || 0
  const pages = Math.max(1, Math.ceil(total / pageSize))

  // Mutations
  const createMut = useCreateVoucher()
  const updateMut = useUpdateVoucher()
  const deleteMut = useDeleteVoucher()
  const bulkDeleteMut = useBulkDeleteVouchers()
  const bulkToggleMut = useBulkToggleVouchers()

  // Modal / form / confirm state
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formErr, setFormErr] = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmBulk, setConfirmBulk] = useState(false)

  // Bulk select
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  useEffect(() => { if (!bulkMode) setSelected(new Set()) }, [bulkMode])
  // When page changes, drop selection entries not in current page (cleaner UX)
  useEffect(() => {
    if (!bulkMode) return
    setSelected(prev => {
      const ids = new Set(vouchers.map(v => v.id))
      const next = new Set()
      prev.forEach(id => { if (ids.has(id)) next.add(id) })
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize])

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const selectAllVisible = () => setSelected(new Set(vouchers.map(v => v.id)))

  // ─── Form handlers ───────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormErr({})
    setShowModal(true)
  }
  const openEdit = (v) => {
    setEditingId(v.id)
    setFormErr({})
    setForm({
      code: v.code || '',
      type: v.type || 'percentage',
      value: String(v.value ?? ''),
      minPurchase: String(v.minPurchase ?? ''),
      maxUses: v.maxUses == null ? '' : String(v.maxUses),
      expiresAt: v.expiresAt ? new Date(v.expiresAt).toISOString().slice(0, 10) : '',
      description: v.description || '',
      isActive: v.isActive !== false,
    })
    setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditingId(null) }

  const validateForm = () => {
    const errs = {}
    if (!form.code.trim()) errs.code = t('tenantAdmin.vouchers.validationCodeRequired')
    if (!form.value || Number(form.value) <= 0) errs.value = t('tenantAdmin.vouchers.validationValueRequired')
    if (form.type === 'percentage' && Number(form.value) > 100) errs.value = t('tenantAdmin.vouchers.validationPercentMax')
    if (form.expiresAt) {
      const d = new Date(form.expiresAt + 'T23:59:59')
      if (d < new Date() && !editingId) errs.expiresAt = t('tenantAdmin.vouchers.validationExpiryPast')
    }
    setFormErr(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      type: form.type,
      value: Number(form.value),
      minPurchase: Number(form.minPurchase) || 0,
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      expiresAt: form.expiresAt || null,
      isActive: !!form.isActive,
    }
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, ...payload })
        toast.success(t('tenantAdmin.vouchers.saved'))
      } else {
        await createMut.mutateAsync(payload)
        toast.success(t('tenantAdmin.vouchers.voucherAdded'))
      }
      closeModal()
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.vouchers.saveFailed'))
    }
  }

  const handleCopy = (code, id) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id)
      toast.success(t('tenantAdmin.vouchers.codeCopied', { code }))
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const handleToggle = async (v) => {
    try {
      await updateMut.mutateAsync({ id: v.id, isActive: !v.isActive })
      toast.success(v.isActive
        ? t('tenantAdmin.vouchers.voucherDeactivated')
        : t('tenantAdmin.vouchers.voucherActivated'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.vouchers.saveFailed'))
    }
  }

  const performDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteMut.mutateAsync(confirmDelete.id)
      toast.success(t('tenantAdmin.vouchers.voucherDeleted'))
      setConfirmDelete(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.vouchers.saveFailed'))
    }
  }

  const performBulkToggle = async (isActive) => {
    const ids = [...selected]
    if (!ids.length) return
    try {
      const r = await bulkToggleMut.mutateAsync({ ids, isActive })
      toast.success(t('tenantAdmin.vouchers.bulkToggleSuccess', { count: r.updated }))
      setSelected(new Set())
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.vouchers.saveFailed'))
    }
  }
  const performBulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    try {
      const r = await bulkDeleteMut.mutateAsync(ids)
      toast.success(t('tenantAdmin.vouchers.bulkDeleteSuccess', { count: r.deleted }))
      setSelected(new Set())
      setBulkMode(false)
      setConfirmBulk(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.vouchers.saveFailed'))
    }
  }

  const handleExportCsv = () => {
    if (!vouchers.length) return toast.error(t('tenantAdmin.vouchers.exportEmpty'))
    const headers = [
      t('tenantAdmin.vouchers.colCode'),
      t('tenantAdmin.vouchers.colType'),
      t('tenantAdmin.vouchers.colValue'),
      t('tenantAdmin.vouchers.colMinOrder'),
      t('tenantAdmin.vouchers.colUsedMax'),
      t('tenantAdmin.vouchers.colExpires'),
      t('tenantAdmin.vouchers.colStatus'),
      t('tenantAdmin.vouchers.descriptionLabel'),
    ]
    const rows = vouchers.map(v => [
      v.code, v.type,
      v.type === 'percentage' ? `${v.value}%` : v.value,
      v.minPurchase,
      `${v.usedCount}/${v.maxUses ?? '∞'}`,
      v.expiresAt ? format(new Date(v.expiresAt), 'yyyy-MM-dd') : '',
      statusOf(v),
      v.description || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vouchers-${user?.tenantId || 'tenant'}-${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  // ─── Computed display values ─────────────────────────────────────────
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo = Math.min(page * pageSize, total)
  const allVisibleSelected = vouchers.length > 0 && vouchers.every(v => selected.has(v.id))

  const renderStatusBadge = (v) => {
    const s = statusOf(v)
    if (s === 'expired') return <Badge variant="danger">{t('tenantAdmin.vouchers.expired')}</Badge>
    if (s === 'inactive') return <Badge variant="muted">{t('tenantAdmin.vouchers.inactive')}</Badge>
    if (s === 'exhausted') return <Badge variant="warning">{t('tenantAdmin.vouchers.exhausted')}</Badge>
    return <Badge variant="success">{t('tenantAdmin.vouchers.active')}</Badge>
  }

  // ─── Render ───────────────────────────────────────────────────────────
  const kpis = [
    { label: t('tenantAdmin.vouchers.totalVoucher'), value: stats?.total ?? '—', tone: 'text-off-white' },
    { label: t('tenantAdmin.vouchers.active'), value: stats?.active ?? '—', tone: 'text-green-400' },
    { label: t('tenantAdmin.vouchers.expired'), value: stats?.expired ?? '—', tone: 'text-red-400' },
    { label: t('tenantAdmin.vouchers.totalUses'), value: stats?.totalUses ?? '—', tone: 'text-brand' },
  ]

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white truncate">
            {t('tenantAdmin.vouchers.pageTitle')}
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {t('tenantAdmin.vouchers.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LiveBadge className="hidden sm:inline-flex" />
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => refetch()}
            loading={isFetching && !isLoading}
            aria-label="Refresh"
          />
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCsv} disabled={!vouchers.length}>
            <span className="hidden md:inline">{t('tenantAdmin.vouchers.exportCsv')}</span>
          </Button>
          <Button
            variant={bulkMode ? 'primary' : 'secondary'}
            size="sm"
            icon={bulkMode ? X : CheckSquare}
            onClick={() => setBulkMode(v => !v)}
          >
            <span className="hidden md:inline">
              {bulkMode ? t('tenantAdmin.vouchers.exitSelect') : t('tenantAdmin.vouchers.selectMode')}
            </span>
          </Button>
          <Button icon={Plus} size="sm" onClick={openAdd}>
            <span className="hidden sm:inline">{t('tenantAdmin.vouchers.addVoucher')}</span>
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map(s => (
          <Card key={s.label} className="p-3 sm:p-4 text-center">
            <p className={`text-xl sm:text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</p>
            <p className="text-muted text-[11px] sm:text-sm mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex-1 min-w-[200px] flex items-center gap-2 bg-dark-surface border border-dark-border rounded-xl px-3 py-2 focus-within:border-brand/60 transition-colors">
          <Search aria-hidden="true" className="w-4 h-4 text-muted flex-shrink-0" />
          <input
            type="text"
            inputMode="search"
            role="searchbox"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('tenantAdmin.vouchers.search')}
            aria-label={t('tenantAdmin.vouchers.search')}
            className="flex-1 min-w-0 appearance-none bg-transparent border-0 text-off-white placeholder-muted text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('tenantAdmin.vouchers.clearSearch')}
              className="flex-shrink-0 -mr-1 p-1 rounded-md text-muted hover:text-off-white hover:bg-dark-card transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60 cursor-pointer"
        >
          <option value="">{t('tenantAdmin.vouchers.filterAll')}</option>
          <option value="active">{t('tenantAdmin.vouchers.filterActive')}</option>
          <option value="inactive">{t('tenantAdmin.vouchers.filterInactive')}</option>
          <option value="expired">{t('tenantAdmin.vouchers.filterExpired')}</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60 cursor-pointer"
        >
          <option value="">{t('tenantAdmin.vouchers.typeAll')}</option>
          <option value="percentage">{t('tenantAdmin.vouchers.typePercent')}</option>
          <option value="flat">{t('tenantAdmin.vouchers.typeFlat')}</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60 cursor-pointer"
        >
          <option value="createdAt-desc">{t('tenantAdmin.vouchers.sortNewest')}</option>
          <option value="code-asc">{t('tenantAdmin.vouchers.sortCodeAsc')}</option>
          <option value="code-desc">{t('tenantAdmin.vouchers.sortCodeDesc')}</option>
          <option value="value-desc">{t('tenantAdmin.vouchers.sortValueDesc')}</option>
          <option value="value-asc">{t('tenantAdmin.vouchers.sortValueAsc')}</option>
          <option value="used-desc">{t('tenantAdmin.vouchers.sortUsedDesc')}</option>
          <option value="expires-asc">{t('tenantAdmin.vouchers.sortExpiresAsc')}</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-brand/10 border border-brand/30">
          <div className="flex items-center gap-2 text-sm text-off-white">
            <CheckSquare size={14} className="text-brand" />
            <span className="font-medium">{t('tenantAdmin.vouchers.bulkSelectedCount', { count: selected.size })}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={selectAllVisible}>
              {t('tenantAdmin.vouchers.bulkSelectAll')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              {t('tenantAdmin.vouchers.bulkClearSel')}
            </Button>
            <Button size="sm" variant="success" disabled={!selected.size} loading={bulkToggleMut.isPending} onClick={() => performBulkToggle(true)}>
              {t('tenantAdmin.vouchers.bulkActivate')}
            </Button>
            <Button size="sm" variant="secondary" disabled={!selected.size} loading={bulkToggleMut.isPending} onClick={() => performBulkToggle(false)}>
              {t('tenantAdmin.vouchers.bulkDeactivate')}
            </Button>
            <Button size="sm" variant="danger" icon={Trash2} disabled={!selected.size} loading={bulkDeleteMut.isPending} onClick={() => setConfirmBulk(true)}>
              {t('tenantAdmin.vouchers.bulkDelete')}
            </Button>
          </div>
        </div>
      )}

      {/* Body */}
      {isError ? (
        <Card className="p-6 sm:p-8 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <h3 className="font-semibold text-off-white mb-1">{t('tenantAdmin.vouchers.loadFailed')}</h3>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            {t('tenantAdmin.vouchers.retry')}
          </Button>
        </Card>
      ) : isLoading && vouchers.length === 0 ? (
        <Card className="p-3 sm:p-4">
          <div className="space-y-2">
            {[0,1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-lg bg-dark-surface animate-pulse" />)}
          </div>
        </Card>
      ) : vouchers.length === 0 ? (
        <Card className="p-8 text-center">
          <Tag size={32} className="mx-auto mb-3 text-muted opacity-50" />
          <h3 className="font-semibold text-off-white mb-1">{searchDeb || status || typeFilter ? t('tenantAdmin.vouchers.noResults') : t('tenantAdmin.vouchers.noVouchers')}</h3>
          {!searchDeb && !status && !typeFilter && (
            <Button size="sm" icon={Plus} onClick={openAdd} className="mt-4">
              {t('tenantAdmin.vouchers.createFirst')}
            </Button>
          )}
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border bg-dark-surface/40">
                    {bulkMode && (
                      <th className="px-3 py-3 w-10">
                        <button onClick={() => allVisibleSelected ? setSelected(new Set()) : selectAllVisible()} aria-label="Select all on page">
                          {allVisibleSelected ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} className="text-muted" />}
                        </button>
                      </th>
                    )}
                    {[
                      t('tenantAdmin.vouchers.colCode'),
                      t('tenantAdmin.vouchers.colType'),
                      t('tenantAdmin.vouchers.colValue'),
                      t('tenantAdmin.vouchers.colMinOrder'),
                      t('tenantAdmin.vouchers.colUsedMax'),
                      t('tenantAdmin.vouchers.colExpires'),
                      t('tenantAdmin.vouchers.colStatus'),
                      t('tenantAdmin.vouchers.colActions'),
                    ].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-medium text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map(v => {
                    const ratio = v.maxUses ? Math.min(1, v.usedCount / v.maxUses) : 0
                    const isSelected = selected.has(v.id)
                    return (
                      <tr
                        key={v.id}
                        className={`border-b border-dark-border/50 transition-colors ${
                          isSelected ? 'bg-brand/5' : 'hover:bg-dark-surface/40'
                        }`}
                      >
                        {bulkMode && (
                          <td className="px-3 py-3 align-top">
                            <button onClick={() => toggleSelect(v.id)} aria-label={`Select ${v.code}`}>
                              {isSelected ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} className="text-muted" />}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3 align-top max-w-[220px]">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-brand truncate">{v.code}</span>
                            <button onClick={() => handleCopy(v.code, v.id)} className="p-1 rounded text-muted hover:text-brand transition-colors flex-shrink-0">
                              {copiedId === v.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                            </button>
                          </div>
                          {v.description && (
                            <p className="text-xs text-muted mt-0.5 truncate">{v.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <Badge variant={v.type === 'percentage' ? 'info' : 'gold'}>
                            {v.type === 'percentage' ? t('tenantAdmin.vouchers.typePercent') : t('tenantAdmin.vouchers.typeFlat')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-off-white font-medium tabular-nums whitespace-nowrap">
                          {v.type === 'percentage' ? `${v.value}%` : formatRupiah(v.value)}
                        </td>
                        <td className="px-4 py-3 text-muted tabular-nums whitespace-nowrap">{formatRupiah(v.minPurchase || 0)}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1">
                            <span className="text-off-white text-xs tabular-nums">
                              {v.usedCount}/{v.maxUses ?? '∞'}
                            </span>
                            {v.maxUses != null && (
                              <div
                                className="w-20 h-1.5 bg-dark-border rounded-full overflow-hidden"
                                aria-label={t('tenantAdmin.vouchers.usageBarLabel', { used: v.usedCount, max: v.maxUses })}
                              >
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${ratio * 100}%`,
                                    backgroundColor: ratio > 0.8 ? '#ef4444' : '#E0A82E',
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs tabular-nums ${isExpired(v) ? 'text-red-400' : 'text-muted'}`}>
                            {v.expiresAt ? format(new Date(v.expiresAt), 'dd/MM/yyyy') : t('tenantAdmin.vouchers.neverExpires')}
                          </span>
                        </td>
                        <td className="px-4 py-3">{renderStatusBadge(v)}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggle(v)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                v.isActive ? 'text-green-400 hover:bg-green-500/10' : 'text-muted hover:text-green-400 hover:bg-dark-surface/60'
                              }`}
                              title={v.isActive ? t('tenantAdmin.vouchers.deactivate') : t('tenantAdmin.vouchers.activate')}
                              aria-label={v.isActive ? t('tenantAdmin.vouchers.deactivate') : t('tenantAdmin.vouchers.activate')}
                            >
                              {v.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                            <button
                              onClick={() => openEdit(v)}
                              className="p-1.5 rounded-lg text-muted hover:text-brand hover:bg-dark-surface/60 transition-colors"
                              title={t('tenantAdmin.vouchers.editVoucher')}
                              aria-label={t('tenantAdmin.vouchers.editVoucher')}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(v)}
                              className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title={t('tenantAdmin.vouchers.delete')}
                              aria-label={t('tenantAdmin.vouchers.delete')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {vouchers.map(v => {
              const ratio = v.maxUses ? Math.min(1, v.usedCount / v.maxUses) : 0
              const isSelected = selected.has(v.id)
              return (
                <Card
                  key={v.id}
                  className={`p-4 ${isSelected ? 'border-brand ring-1 ring-brand/30' : ''} ${bulkMode ? 'cursor-pointer' : ''}`}
                  onClick={() => bulkMode && toggleSelect(v.id)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {bulkMode && (
                        <span className="flex-shrink-0">
                          {isSelected ? <CheckSquare size={16} className="text-brand" /> : <Square size={16} className="text-muted" />}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-brand text-sm truncate max-w-[180px]">{v.code}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopy(v.code, v.id) }}
                            className="p-1 rounded text-muted hover:text-brand flex-shrink-0"
                            aria-label="Copy"
                          >
                            {copiedId === v.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                          </button>
                        </div>
                        {v.description && <p className="text-xs text-muted mt-0.5 truncate">{v.description}</p>}
                      </div>
                    </div>
                    {renderStatusBadge(v)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                    <div>
                      <div className="text-muted text-[10px] uppercase tracking-wide">{t('tenantAdmin.vouchers.colValue')}</div>
                      <div className="text-off-white font-semibold tabular-nums">
                        {v.type === 'percentage' ? `${v.value}%` : formatRupiah(v.value)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted text-[10px] uppercase tracking-wide">{t('tenantAdmin.vouchers.colMinOrder')}</div>
                      <div className="text-muted tabular-nums">{formatRupiah(v.minPurchase || 0)}</div>
                    </div>
                    <div>
                      <div className="text-muted text-[10px] uppercase tracking-wide">{t('tenantAdmin.vouchers.colUsedMax')}</div>
                      <div className="text-off-white tabular-nums">
                        {v.usedCount}/{v.maxUses ?? '∞'}
                      </div>
                      {v.maxUses != null && (
                        <div className="w-full h-1 bg-dark-border rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: ratio > 0.8 ? '#ef4444' : '#E0A82E' }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-muted text-[10px] uppercase tracking-wide">{t('tenantAdmin.vouchers.colExpires')}</div>
                      <div className={`tabular-nums ${isExpired(v) ? 'text-red-400' : 'text-muted'}`}>
                        {v.expiresAt ? format(new Date(v.expiresAt), 'dd/MM/yyyy') : t('tenantAdmin.vouchers.neverExpires')}
                      </div>
                    </div>
                  </div>
                  {!bulkMode && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-dark-border">
                      <Button size="xs" variant="outline" icon={v.isActive ? ToggleRight : ToggleLeft} onClick={() => handleToggle(v)} className="flex-1">
                        {v.isActive ? t('tenantAdmin.vouchers.deactivate') : t('tenantAdmin.vouchers.activate')}
                      </Button>
                      <Button size="xs" variant="outline" icon={Pencil} onClick={() => openEdit(v)} className="flex-1">
                        {t('tenantAdmin.vouchers.editVoucher')}
                      </Button>
                      <Button size="xs" variant="danger" icon={Trash2} onClick={() => setConfirmDelete(v)} aria-label={t('tenantAdmin.vouchers.delete')} />
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted">
                {t('tenantAdmin.vouchers.showingRange', { from: showingFrom, to: showingTo, total })}
              </span>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-muted">{t('tenantAdmin.vouchers.rowsPerPage')}</label>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-2 py-1 text-xs outline-none focus:border-brand/60 cursor-pointer"
                >
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline" icon={ChevronLeft}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <span className="hidden sm:inline">{t('tenantAdmin.vouchers.prevPage')}</span>
              </Button>
              <span className="text-xs text-muted whitespace-nowrap">
                {t('tenantAdmin.vouchers.pageInfo', { page, pages })}
              </span>
              <Button
                size="sm" variant="outline" iconPosition="right" icon={ChevronRight}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages}
              >
                <span className="hidden sm:inline">{t('tenantAdmin.vouchers.nextPage')}</span>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={showModal} onClose={closeModal} title={editingId ? t('tenantAdmin.vouchers.editVoucher') : t('tenantAdmin.vouchers.addVoucher')}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.vouchers.voucherCode')}</label>
            <input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="HEMAT20"
              className={`w-full bg-dark-surface border text-off-white placeholder-muted rounded-xl px-4 py-2.5 text-sm outline-none font-mono font-bold uppercase tracking-widest ${
                formErr.code ? 'border-red-500/60 focus:border-red-500' : 'border-dark-border focus:border-brand/60'
              }`}
            />
            {formErr.code && <p className="text-xs text-red-400 mt-1">{formErr.code}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.vouchers.type')}</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'percentage', label: t('tenantAdmin.vouchers.percentOption') },
                { value: 'flat', label: t('tenantAdmin.vouchers.nominalOption') },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: opt.value }))}
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    form.type === opt.value ? 'bg-brand/10 border-brand text-brand' : 'border-dark-border text-muted hover:border-brand/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={form.type === 'percentage' ? t('tenantAdmin.vouchers.valuePercent') : t('tenantAdmin.vouchers.valueRupiah')}
              type="number" min="1" inputMode="numeric"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder={form.type === 'percentage' ? '20' : '10000'}
              error={formErr.value}
            />
            <Input
              label={t('tenantAdmin.vouchers.minOrderRupiah')}
              type="number" min="0" inputMode="numeric"
              value={form.minPurchase}
              onChange={e => setForm(f => ({ ...f, minPurchase: e.target.value }))}
              placeholder="50000"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('tenantAdmin.vouchers.maxUsesLabel')}
              type="number" min="1" inputMode="numeric"
              value={form.maxUses}
              onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
              placeholder="100"
              hint={t('tenantAdmin.vouchers.unlimited')}
            />
            <Input
              label={t('tenantAdmin.vouchers.expiryLabel')}
              type="date"
              value={form.expiresAt}
              onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              error={formErr.expiresAt}
              hint={t('tenantAdmin.vouchers.noExpiry')}
            />
          </div>
          <Input
            label={t('tenantAdmin.vouchers.descriptionLabel')}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder={t('tenantAdmin.vouchers.fieldDescriptionPlaceholder')}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-dark-border bg-dark-surface checked:bg-brand focus:ring-brand/40"
            />
            <span className="text-sm text-off-white">{t('tenantAdmin.vouchers.active')}</span>
          </label>
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={closeModal}>{t('tenantAdmin.vouchers.cancel')}</Button>
            <Button fullWidth onClick={handleSubmit} loading={createMut.isPending || updateMut.isPending}>
              {editingId ? t('tenantAdmin.vouchers.save') : t('tenantAdmin.vouchers.addVoucher')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={performDelete}
        title={t('tenantAdmin.vouchers.deleteVoucher')}
        description={t('tenantAdmin.vouchers.deleteConfirmDesc')}
        confirmText={t('tenantAdmin.vouchers.confirmYes')}
        cancelText={t('tenantAdmin.vouchers.confirmNo')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={performBulkDelete}
        title={t('tenantAdmin.vouchers.bulkDeleteTitle', { count: selected.size })}
        description={t('tenantAdmin.vouchers.bulkDeleteDesc', { count: selected.size })}
        confirmText={t('tenantAdmin.vouchers.confirmYes')}
        cancelText={t('tenantAdmin.vouchers.confirmNo')}
        variant="danger"
      />
    </div>
  )
}

export default function TAVouchersPage() {
  return (
    <ErrorBoundary>
      <TAVouchersInner />
    </ErrorBoundary>
  )
}

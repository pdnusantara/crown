import React, { useState, useRef } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Star, Search, Mail, KeyRound, Copy, Check, AlertTriangle, Camera, X, Eye, EyeOff, RefreshCw, Users, UserPlus, Scissors, Receipt, MapPin, ShieldAlert } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetUserPassword } from '../../hooks/useUsers.js'
import { useBranches, useBranchLicenseSummary } from '../../hooks/useBranches.js'
import { useSubscription } from '../../hooks/useSubscription.js'
import { usePackages } from '../../hooks/usePackages.js'
import { formatRupiah } from '../../utils/format.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'


// Charset tanpa karakter ambigu (0/O, 1/l/I) — gampang dibacakan ke staf.
function genPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const buf = new Uint32Array(len)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length]
  return out
}

export default function TAStaffPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const toast = useToast()
  const [showModal, setShowModal] = useState(false)
  const [editStaff, setEditStaff] = useState(null)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [form, setForm] = useState({ name: '', email: '', role: 'barber', branchId: '', commissionRate: 0.35, salaryType: 'commission', baseSalary: 0, isBarber: false, photo: '' })
  const [formError, setFormError] = useState({})
  // { email, tempPassword, name, mode: 'created' | 'reset', custom? } | null
  const [credentials, setCredentials] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  // Reset password — admin boleh menentukan password sendiri (kosong = otomatis)
  const [customPw, setCustomPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwError, setPwError] = useState('')

  // Role picker — schema backend hanya menerima 'barber' & 'kasir' utk
  // tenant_admin (super_admin/tenant_admin/customer/affiliate diblokir di
  // POST /users). Manager dihapus 2026-05-29: tidak ada di Role enum Prisma
  // → save selalu validation fail. Pakai card-picker dgn ikon + deskripsi
  // singkat supaya owner tau perbedaannya saat onboarding.
  const ROLE_CARDS = [
    {
      value: 'barber',
      label: t('tenantAdmin.staff.roleBarber'),
      desc:  t('tenantAdmin.staff.roleBarberDesc'),
      icon:  Scissors,
    },
    {
      value: 'kasir',
      label: t('tenantAdmin.staff.roleKasir'),
      desc:  t('tenantAdmin.staff.roleKasirDesc'),
      icon:  Receipt,
    },
  ]

  const { data: allStaff = [], isLoading: isLoadingStaff, isError, refetch } = useUsers({ tenantId: user?.tenantId })
  const { data: branches = [] } = useBranches(user?.tenantId)
  const { data: licenseSummary } = useBranchLicenseSummary(user?.tenantId)
  const { data: subscription } = useSubscription(user?.tenantId)
  // usePackages() return { list, map } (lihat src/hooks/usePackages.js).
  // Lookup by name via map untuk dapat package tenant sekarang.
  const { data: packagesData } = usePackages()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  const resetPassword = useResetUserPassword()

  const isLoading = isLoadingStaff

  // Kuota staf efektif dihitung dari:
  //   maxStaff (paket dasar, termasuk owner)
  // + (paidBranchAddonCount × staffPerExtraBranch)  ← bonus tiap cabang add-on
  // Lebih dari ini → kena addonStaf per orang (kalau super-admin set > 0).
  // Contoh Basic (maxStaff=4, bonus=+3/cabang):
  //   1 cabang utama   = 4 staf
  //   2 cabang (1 paid) = 4 + 3 = 7 staf
  //   3 cabang (2 paid) = 4 + 6 = 10 staf
  const tenantPackage  = packagesData?.map?.[subscription?.package] || null
  const baseMaxStaff   = tenantPackage?.maxStaff ?? null
  const bonusPerBranch = tenantPackage?.staffPerExtraBranch ?? 0
  const paidAddons     = licenseSummary?.paidAddonCount ?? 0
  const bonusStaff     = paidAddons * bonusPerBranch
  const staffQuota     = baseMaxStaff !== null ? baseMaxStaff + bonusStaff : null
  const staffUsed      = allStaff.length
  const staffAddonPrice = tenantPackage?.staffAddonPrice ?? 0
  const staffAddonType  = tenantPackage?.staffAddonType  ?? 'monthly'
  const quotaPct      = staffQuota ? Math.round((staffUsed / staffQuota) * 100) : 0
  const overQuota     = staffQuota !== null && staffUsed > staffQuota
  const nearQuota     = staffQuota !== null && !overQuota && quotaPct >= 80

  const filtered = allStaff.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase())
    const matchBranch = !branchFilter || s.branchId === branchFilter
    const matchRole = !roleFilter || s.role === roleFilter
    return matchSearch && matchBranch && matchRole
  })

  const openAdd = () => {
    setEditStaff(null)
    setForm({ name: '', email: '', role: 'barber', branchId: branches[0]?.id || '', commissionRate: 0.35, salaryType: 'commission', baseSalary: 0, isBarber: false, photo: '' })
    setFormError({})
    setShowModal(true)
  }

  const openEdit = (member) => {
    setEditStaff(member)
    setForm({ name: member.name, email: member.email || '', role: member.role, branchId: member.branchId, commissionRate: member.commissionRate ?? 0.35, salaryType: (member.role === 'kasir' && !member.isBarber) ? 'fixed' : (member.salaryType || 'commission'), baseSalary: member.baseSalary || 0, isBarber: member.isBarber || false, photo: member.photo || '' })
    setFormError({})
    setShowModal(true)
  }

  const validateForm = () => {
    const err = {}
    if (!form.name) err.name = 'Wajib diisi'
    if (!form.branchId) err.branchId = 'Pilih cabang'
    if (!editStaff) {
      // Email hanya wajib saat membuat akun baru — login dipakai email.
      if (!form.email) err.email = 'Email login wajib diisi'
      else if (!/^\S+@\S+\.\S+$/.test(form.email)) err.email = 'Format email tidak valid'
    }
    setFormError(err)
    return Object.keys(err).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return
    // Konversi field number dari raw string (lihat onChange di input)
    // ke number aktual & clamp ke range yang diterima backend zod schema.
    // Pakai raw string supaya user bebas backspace/edit decimal.
    const commissionNum = Math.max(0, Math.min(1, Number(form.commissionRate) || 0))
    const baseSalaryNum = Math.max(0, Math.min(1_000_000_000, parseInt(String(form.baseSalary), 10) || 0))
    try {
      if (editStaff) {
        // Saat edit, jangan kirim email (untuk hindari bentrok unique) kecuali memang berubah.
        // Kasir yang ditandai "juga barber" memakai skema hybrid (gaji pokok +
        // komisi) supaya komisi atas layanan yang dia kerjakan tetap dihitung.
        const isBarber = form.role === 'kasir' ? !!form.isBarber : false
        const salaryType = form.role === 'kasir' ? (isBarber ? 'hybrid' : 'fixed') : form.salaryType
        // photo: null = hapus foto, string = ganti, undefined = tak diubah.
        // Kirim null kalau user kosongkan (PhotoPicker remove). Backend update
        // schema menerima nullable supaya "hapus foto" bisa di-persist.
        const patch = { name: form.name, role: form.role, branchId: form.branchId, commissionRate: commissionNum, salaryType, baseSalary: baseSalaryNum, isBarber, photo: form.photo || null }
        if (form.email && form.email !== editStaff.email) patch.email = form.email
        await updateUser.mutateAsync({ id: editStaff.id, ...patch, tenantId: user.tenantId })
        toast.success(t('tenantAdmin.staff.staffUpdated'))
        setShowModal(false)
      } else {
        const created = await createUser.mutateAsync({
          name: form.name,
          email: form.email,
          role: form.role,
          branchId: form.branchId,
          tenantId: user.tenantId,
          photo: form.photo || undefined,
          ...(form.role === 'barber'
            ? { commissionRate: commissionNum, salaryType: form.salaryType, baseSalary: baseSalaryNum }
            : form.role === 'kasir'
              ? form.isBarber
                ? { salaryType: 'hybrid', baseSalary: baseSalaryNum, isBarber: true, commissionRate: commissionNum }
                : { salaryType: 'fixed', baseSalary: baseSalaryNum, isBarber: false }
              : {}),
        })
        toast.success(t('tenantAdmin.staff.staffAdded'))
        setShowModal(false)
        // Heads-up: kalau backend buat invoice staff_addon (hire di atas kuota),
        // beri tahu admin agar tidak kaget melihat tagihan di /admin/billing.
        const addonInvoice = created?._meta?.addonInvoice
        if (addonInvoice?.amount) {
          toast.info(t('tenantAdmin.staff.addonInvoiceCreated', { amount: formatRupiah(addonInvoice.amount) }))
        }
        if (created?.tempPassword) {
          setCredentials({
            mode: 'created',
            name: created.name,
            email: created.email,
            tempPassword: created.tempPassword,
          })
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.staff.saveFailed'))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteUser.mutateAsync(deleteTarget.id)
      toast.success(t('tenantAdmin.staff.staffDeleted'))
      setDeleteTarget(null)
    } catch {
      toast.error(t('tenantAdmin.staff.deleteFailed'))
    }
  }

  const openReset = (member) => {
    setCustomPw('')
    setShowPw(false)
    setPwError('')
    setResetTarget(member)
  }

  const closeReset = () => {
    if (resetPassword.isPending) return
    setResetTarget(null)
    setCustomPw('')
    setShowPw(false)
    setPwError('')
  }

  const handleResetPassword = async (member) => {
    const pw = customPw.trim()
    if (pw && pw.length < 6) {
      setPwError(t('tenantAdmin.staff.newPasswordTooShort'))
      return
    }
    try {
      const data = await resetPassword.mutateAsync({ id: member.id, password: pw || undefined })
      closeReset()
      setCredentials({
        mode: 'reset',
        name: data.name,
        email: data.email,
        tempPassword: data.tempPassword,
        custom: data.custom,
      })
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.staff.resetPasswordFailed'))
    }
  }

  const roleColors = { barber: 'gold', kasir: 'info', manager: 'purple' }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.staff.title')}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-muted text-sm">{t('tenantAdmin.staff.registeredCount', { count: allStaff.length })}</p>
            {/* Kuota chip — tenant tahu posisi vs paket. Warna ikut state:
                hijau (aman), amber (≥80% mendekati), merah (over kuota). */}
            {staffQuota !== null && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                overQuota
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : nearQuota
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-green-500/10 border-green-500/30 text-green-400'
              }`}>
                <Users className="w-3 h-3" />
                {staffUsed} / {staffQuota} staf
                {overQuota && ` · over ${staffUsed - staffQuota}`}
              </span>
            )}
          </div>
          {/* Breakdown bonus — info kuota tenant kalau ada bonus cabang aktif.
              Trans + b tag dipakai supaya bagian bold ikut highlight tema. */}
          {bonusStaff > 0 && (
            <p className="text-[11px] text-muted mt-1 leading-snug">
              <Trans
                i18nKey="tenantAdmin.staff.kuotaInfo"
                values={{ base: baseMaxStaff, pkg: subscription?.package, bonus: bonusStaff, count: paidAddons, per: bonusPerBranch }}
                components={{ b: <b className="text-off-white" /> }}
              />
            </p>
          )}
          {/* Warning kalau over atau mendekati. Add-on info muncul kalau super-
              admin sudah set staffAddonPrice > 0; kalau 0 (soft launch) cuma
              info "naik paket" tanpa angka. */}
          {overQuota && (
            <p className="text-xs text-red-400 mt-2 max-w-md">
              {staffAddonPrice > 0 ? (
                <Trans
                  i18nKey="tenantAdmin.staff.overQuotaAddon"
                  values={{
                    price: formatRupiah(staffAddonPrice),
                    unit:  staffAddonType === 'monthly' ? 'bln' : 'staf',
                    over:  staffUsed - staffQuota,
                    pkg:   subscription?.package,
                    perInfo: bonusPerBranch > 0
                      ? t('tenantAdmin.staff.perBranchBonus', { n: bonusPerBranch })
                      : t('tenantAdmin.staff.perBranchBonusNone'),
                  }}
                  components={{ b: <b className="text-off-white" /> }}
                />
              ) : (
                <Trans
                  i18nKey="tenantAdmin.staff.overQuotaUpgrade"
                  values={{ pkg: subscription?.package, used: staffUsed, quota: staffQuota }}
                  components={{ b: <b className="text-off-white" /> }}
                />
              )}
            </p>
          )}
          {nearQuota && !overQuota && staffAddonPrice > 0 && (
            <p className="text-xs text-amber-400 mt-2 max-w-md">
              <Trans
                i18nKey="tenantAdmin.staff.nearQuotaInfo"
                values={{
                  next:  staffQuota + 1,
                  price: formatRupiah(staffAddonPrice),
                  unit:  staffAddonType === 'monthly' ? 'bln' : 'staf',
                }}
                components={{ b: <b className="text-off-white" /> }}
              />
            </p>
          )}
        </div>
        <Button icon={Plus} onClick={openAdd} className="w-full sm:w-auto flex-shrink-0">{t('tenantAdmin.staff.addStaff')}</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('tenantAdmin.staff.searchPlaceholder')}
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-brand/60"
          />
        </div>
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2 text-sm outline-none focus:border-brand/60">
          <option value="">{t('tenantAdmin.staff.allBranches')}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2 text-sm outline-none focus:border-brand/60">
          <option value="">{t('tenantAdmin.staff.allRoles')}</option>
          <option value="barber">{t('tenantAdmin.staff.roleBarber')}</option>
          <option value="kasir">{t('tenantAdmin.staff.roleKasir')}</option>
          <option value="manager">{t('tenantAdmin.staff.roleManager')}</option>
        </select>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && isError && (
        <Card className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <p className="text-off-white font-medium">{t('tenantAdmin.staff.errorTitle')}</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" /> {t('tenantAdmin.staff.errorRetry')}
          </Button>
        </Card>
      )}

      {/* Empty state — bedakan "belum ada staf sama sekali" vs "filter zero match" */}
      {!isLoading && !isError && filtered.length === 0 && (
        <Card className="p-10 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-brand/10 flex items-center justify-center">
            <UserPlus className="w-7 h-7 text-brand" />
          </div>
          <h3 className="text-off-white font-display text-lg font-semibold mb-1">
            {allStaff.length === 0
              ? t('tenantAdmin.staff.emptyTitle')
              : t('tenantAdmin.staff.emptyFilteredTitle')}
          </h3>
          <p className="text-muted text-sm max-w-sm mx-auto">
            {allStaff.length === 0
              ? t('tenantAdmin.staff.emptyDescription')
              : t('tenantAdmin.staff.emptyFilteredDescription')}
          </p>
          {allStaff.length === 0 && (
            <Button icon={Plus} onClick={openAdd} className="mt-4">{t('tenantAdmin.staff.addStaff')}</Button>
          )}
        </Card>
      )}

      {/* Staff grid */}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((member, i) => (
            <motion.div key={member.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4 card-hover">
                <div className="flex items-start gap-4">
                  <Avatar src={member.photo} name={member.name} size="lg" ring={member.role === 'barber'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-off-white">{member.name}</h3>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <Badge variant={roleColors[member.role] || 'muted'}>{member.role}</Badge>
                          {member.role === 'kasir' && member.isBarber && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/30">+ Barber</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-0.5 flex-shrink-0 -mr-1">
                        <button
                          onClick={() => openReset(member)}
                          className="p-2 rounded-lg text-muted hover:text-amber-400 active:text-amber-400 hover:bg-dark-surface transition-colors"
                          title={t('tenantAdmin.staff.resetPasswordTooltip')}
                          aria-label={`${t('tenantAdmin.staff.resetPasswordTooltip')} ${member.name}`}
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(member)}
                          className="p-2 rounded-lg text-muted hover:text-blue-400 active:text-blue-400 hover:bg-dark-surface transition-colors"
                          title={t('tenantAdmin.staff.editTooltip')}
                          aria-label={`${t('tenantAdmin.staff.editTooltip')} ${member.name}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(member)}
                          disabled={deleteUser.isPending}
                          className="p-2 rounded-lg text-muted hover:text-red-400 active:text-red-400 hover:bg-dark-surface transition-colors disabled:opacity-50"
                          title={t('tenantAdmin.staff.deleteTooltip')}
                          aria-label={`${t('tenantAdmin.staff.deleteTooltip')} ${member.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {member.email && (
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted">
                        <Mail className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate font-mono" title={member.email}>{member.email}</span>
                      </div>
                    )}

                    <p className="text-xs text-muted mt-1">
                      {branches.find(b => b.id === member.branchId)?.name || '-'}
                    </p>

                    {(member.role === 'barber' || (member.role === 'kasir' && member.isBarber)) && (
                      <div className="flex items-center gap-3 mt-2">
                        {member.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-brand fill-brand" />
                            <span className="text-xs text-brand">{member.rating}</span>
                          </div>
                        )}
                        <span className="text-xs text-muted">{t('tenantAdmin.staff.clientsCount', { count: member.totalClients })}</span>
                        <span className="text-xs text-muted">{t('tenantAdmin.staff.commissionPercent', { percent: (member.commissionRate * 100).toFixed(0) })}</span>
                      </div>
                    )}

                    {member.specializations?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {member.specializations.slice(0, 3).map(spec => (
                          <span key={spec} className="px-2 py-0.5 bg-brand/10 text-brand rounded-md text-xs">{spec}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editStaff ? t('tenantAdmin.staff.editStaff') : t('tenantAdmin.staff.addStaff')}>
        <div className="space-y-4">
          <PhotoPicker
            value={form.photo}
            name={form.name}
            onChange={(photo) => setForm(f => ({ ...f, photo }))}
          />
          <Input
            label={t('common.name')}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('tenantAdmin.staff.fullNamePlaceholder')}
            error={formError.name}
          />
          <Input
            label={t('tenantAdmin.staff.emailLoginLabel')}
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder={t('tenantAdmin.staff.emailLoginPlaceholder')}
            error={formError.email}
            hint={editStaff ? t('tenantAdmin.staff.emailLoginHintEdit') : t('tenantAdmin.staff.emailLoginHintNew')}
          />
          {/* Role card picker — pilih sekali klik, jelas peran apa. */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.staff.role')}</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_CARDS.map(({ value, label, desc, icon: Icon }) => {
                const selected = form.role === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      role: value,
                      // Kasir tak punya omzet pribadi → skemanya selalu gaji pokok.
                      salaryType: value === 'kasir' ? 'fixed' : f.salaryType,
                    }))}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      selected
                        ? 'bg-brand/10 border-brand/40 ring-2 ring-brand/15'
                        : 'bg-dark-surface border-dark-border hover:border-brand/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${selected ? 'bg-brand/20 text-brand' : 'bg-dark-card text-muted'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-sm font-semibold ${selected ? 'text-brand' : 'text-off-white'}`}>{label}</span>
                    </div>
                    <p className="text-[11px] text-muted mt-1.5 leading-snug">{desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Branch picker — tampilkan kode + alamat singkat + indikator lisensi.
              Cabang unlicensed di-disable supaya staf tidak nyangkut di slot
              yang belum dibayar (transaksi-nya tetap akan ditolak BranchLicenseGate). */}
          <BranchPicker
            branches={branches}
            unlicensedIds={licenseSummary?.unlicensedBranchIds || []}
            value={form.branchId}
            onChange={(branchId) => setForm(f => ({ ...f, branchId }))}
            error={formError.branchId}
            label={t('tenantAdmin.staff.branch')}
            t={t}
          />
          {(form.role === 'barber' || form.role === 'kasir') && (
            <div className="space-y-3 p-3 rounded-xl bg-dark-surface border border-dark-border">
              {form.role === 'barber' ? (
                <>
                  <Select
                    label={t('tenantAdmin.staff.salaryScheme')}
                    value={form.salaryType}
                    onChange={e => setForm(f => ({ ...f, salaryType: e.target.value }))}
                    options={[
                      { value: 'commission', label: t('tenantAdmin.staff.salarySchemeCommission') },
                      { value: 'fixed',      label: t('tenantAdmin.staff.salarySchemeFixed') },
                      { value: 'hybrid',     label: t('tenantAdmin.staff.salarySchemeHybrid') },
                    ]}
                    placeholder=""
                  />
                  {(form.salaryType === 'commission' || form.salaryType === 'hybrid') && (
                    <Input
                      label={t('tenantAdmin.staff.commissionRateLabel')}
                      type="number" step="0.01" min="0" max="1"
                      value={form.commissionRate}
                      onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
                      hint={t('tenantAdmin.staff.commissionExample')}
                    />
                  )}
                  {(form.salaryType === 'fixed' || form.salaryType === 'hybrid') && (
                    <Input
                      label={t('tenantAdmin.staff.baseSalaryLabel')}
                      type="number" min="0" step="50000"
                      value={form.baseSalary}
                      onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))}
                      hint={t('tenantAdmin.staff.baseSalaryHintFixed')}
                    />
                  )}
                </>
              ) : (
                // Kasir: gaji pokok + opsi merangkap sebagai barber (toko kecil).
                <>
                  <Input
                    label={t('tenantAdmin.staff.baseSalaryLabel')}
                    type="number" min="0" step="50000"
                    value={form.baseSalary}
                    onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))}
                    hint={t('tenantAdmin.staff.baseSalaryHintKasir')}
                  />

                  <label className="flex items-start gap-3 cursor-pointer select-none pt-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.isBarber}
                      onClick={() => setForm(f => ({ ...f, isBarber: !f.isBarber }))}
                      className={`mt-0.5 relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.isBarber ? 'bg-brand' : 'bg-dark-border'}`}
                    >
                      {/* Knob: posisi eksplisit (left+vertikal center) supaya tidak
                          melebar keluar track / menutupi tulisan di sebelahnya. */}
                      <span className={`absolute top-1/2 left-0.5 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${form.isBarber ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-off-white">{t('tenantAdmin.staff.isBarberToggle')}</span>
                      <span className="block text-xs text-muted leading-snug">{t('tenantAdmin.staff.isBarberHint')}</span>
                    </span>
                  </label>

                  {form.isBarber && (
                    <Input
                      label={t('tenantAdmin.staff.barberCommissionLabel')}
                      type="number" step="0.01" min="0" max="1"
                      value={form.commissionRate}
                      onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
                      hint={t('tenantAdmin.staff.barberCommissionHint')}
                    />
                  )}
                </>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button
              fullWidth
              onClick={handleSave}
              disabled={createUser.isPending || updateUser.isPending}
            >
              {(createUser.isPending || updateUser.isPending)
                ? t('tenantAdmin.staff.saving')
                : (editStaff ? t('common.save') : t('common.add'))}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Konfirmasi Reset Password */}
      <Modal
        isOpen={!!resetTarget}
        onClose={closeReset}
        title={t('tenantAdmin.staff.resetPasswordTitle')}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-amber-400/10 border border-amber-400/20 rounded-xl">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-amber-200 font-medium mb-1">{t('tenantAdmin.staff.resetPasswordWarning')}</p>
              <p className="text-muted text-xs leading-relaxed">{t('tenantAdmin.staff.resetPasswordWarningDetail')}</p>
            </div>
          </div>
          {resetTarget && (
            <div className="p-3 bg-dark-card rounded-xl border border-dark-border text-sm">
              <p className="text-off-white font-medium">{resetTarget.name}</p>
              <p className="text-xs text-muted font-mono mt-0.5">{resetTarget.email}</p>
            </div>
          )}

          {/* Password kustom — opsional */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.staff.newPasswordLabel')}</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={customPw}
                onChange={e => { setCustomPw(e.target.value); setPwError('') }}
                placeholder={t('tenantAdmin.staff.newPasswordPlaceholder')}
                autoComplete="new-password"
                disabled={resetPassword.isPending}
                className={`w-full bg-dark-surface text-off-white placeholder-muted rounded-xl px-4 py-2.5 pr-[5.25rem] text-sm font-mono outline-none transition-all border focus:ring-2 focus:ring-brand/15 ${
                  pwError ? 'border-red-500/60 focus:border-red-500' : 'border-dark-border focus:border-brand/60'
                }`}
              />
              <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  aria-label={showPw ? t('tenantAdmin.staff.hidePassword') : t('tenantAdmin.staff.showPassword')}
                  className="p-2 rounded-lg text-muted hover:text-brand transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setCustomPw(genPassword()); setShowPw(true); setPwError('') }}
                  aria-label={t('tenantAdmin.staff.generateRandom')}
                  title={t('tenantAdmin.staff.generateRandom')}
                  className="p-2 rounded-lg text-muted hover:text-brand transition-colors"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>
            {pwError
              ? <p className="mt-1.5 text-xs text-red-400">{pwError}</p>
              : <p className="mt-1.5 text-xs text-muted">{t('tenantAdmin.staff.newPasswordHint')}</p>}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={closeReset}
              disabled={resetPassword.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              icon={KeyRound}
              onClick={() => handleResetPassword(resetTarget)}
              disabled={resetPassword.isPending}
            >
              {resetPassword.isPending ? t('tenantAdmin.staff.resetPasswordProcessing') : t('tenantAdmin.staff.resetPasswordButton')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tampilkan kredensial sekali */}
      <CredentialsModal
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />

      {/* Konfirmasi delete — staf soft-delete (tetap di laporan, tak bisa login) */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('tenantAdmin.staff.deleteConfirmTitle')}
        description={
          <Trans
            i18nKey="tenantAdmin.staff.deleteConfirmMessage"
            values={{ name: deleteTarget?.name || '' }}
            components={{ b: <b className="text-off-white" /> }}
          />
        }
        confirmText={t('tenantAdmin.staff.deleteConfirmAction')}
        cancelText={t('common.cancel')}
        variant="danger"
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function resizeImageToBase64(file, maxSize = 256) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function PhotoPicker({ value, name, onChange }) {
  const { t } = useTranslation()
  const toast = useToast()
  const inputRef = useRef(null)
  const [imgError, setImgError] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('tenantAdmin.staff.fileTooLarge'))
      return
    }
    const base64 = await resizeImageToBase64(file)
    setImgError(false)
    onChange(base64)
  }

  const initials = (name || '?').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
  const gradients = ['from-amber-500 to-orange-500', 'from-blue-500 to-cyan-500', 'from-violet-500 to-purple-500', 'from-green-500 to-emerald-500', 'from-pink-500 to-rose-500', 'from-yellow-500 to-amber-400']
  const gradient = gradients[(name || '').charCodeAt(0) % gradients.length]

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-muted self-start">{t('tenantAdmin.staff.photoLabel')}</p>
      <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
        <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-dark-border group-hover:ring-brand/50 transition-all">
          {value && !imgError ? (
            <img src={value} alt={t('tenantAdmin.staff.photoLabel')} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <div className={`w-full h-full flex items-center justify-center text-xl font-semibold text-white bg-gradient-to-br ${gradient}`}>
              {initials}
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-brand hover:underline"
        >
          {value ? t('tenantAdmin.staff.changePhoto') : t('tenantAdmin.staff.uploadPhoto')}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setImgError(false) }}
            className="text-xs text-muted hover:text-red-400 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> {t('common.delete')}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}

// Modal yang menampilkan email + password sementara satu kali. Ditampilkan
// setelah create staf baru atau setelah reset password. Setelah ditutup, nilai
// password tidak bisa diambil kembali — admin harus mencatatnya.
function CredentialsModal({ credentials, onClose }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(null) // 'email' | 'password' | 'both' | null

  if (!credentials) return null

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800)
    } catch {
      // Clipboard tidak tersedia — abaikan, admin masih bisa pilih manual
    }
  }

  const both = `Email: ${credentials.email}\nPassword: ${credentials.tempPassword}`
  const title = credentials.mode === 'reset'
    ? t('tenantAdmin.staff.passwordResetTitle')
    : t('tenantAdmin.staff.createdTitle')

  return (
    <Modal isOpen onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 bg-amber-400/10 border border-amber-400/20 rounded-xl">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-200 leading-relaxed">{t('tenantAdmin.staff.credentialsWarning')}</p>
        </div>

        <div className="p-4 bg-dark-card rounded-2xl border border-dark-border space-y-3">
          <p className="text-sm text-off-white font-medium">{credentials.name}</p>

          <div>
            <p className="text-xs text-muted mb-1">{t('tenantAdmin.staff.emailLoginLabel')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-dark-surface rounded-xl text-sm text-off-white font-mono break-all">
                {credentials.email}
              </code>
              <button
                type="button"
                onClick={() => copy(credentials.email, 'email')}
                className="p-2 rounded-xl border border-dark-border text-muted hover:text-brand hover:border-brand/30 transition-colors"
                title={t('tenantAdmin.staff.copyEmail')}
                aria-label={t('tenantAdmin.staff.copyEmail')}
              >
                {copied === 'email' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted mb-1">
              {credentials.custom
                ? t('tenantAdmin.staff.newPasswordCustomLabel')
                : t('tenantAdmin.staff.tempPasswordLabel')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-dark-surface rounded-xl text-sm text-brand font-mono tracking-wider select-all break-all">
                {credentials.tempPassword}
              </code>
              <button
                type="button"
                onClick={() => copy(credentials.tempPassword, 'password')}
                className="p-2 rounded-xl border border-dark-border text-muted hover:text-brand hover:border-brand/30 transition-colors"
                title={t('tenantAdmin.staff.copyPassword')}
                aria-label={t('tenantAdmin.staff.copyPassword')}
              >
                {copied === 'password' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => copy(both, 'both')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 mt-1 rounded-xl border border-brand/30 bg-brand/10 text-brand text-sm font-medium hover:bg-brand/15 transition-colors"
          >
            {copied === 'both' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'both' ? t('tenantAdmin.staff.copied') : t('tenantAdmin.staff.copyBoth')}
          </button>
        </div>

        <Button fullWidth onClick={onClose}>{t('tenantAdmin.staff.noted')}</Button>
      </div>
    </Modal>
  )
}

// Branch picker dengan kode + alamat + indikator lisensi. Cabang unlicensed
// di-disable supaya tenant_admin tidak nempel staf ke slot yang belum dibayar
// (akhirnya stuck di BranchLicenseGate). Tetap ditampilkan dgn pesan supaya
// jelas kenapa tidak bisa dipilih.
function BranchPicker({ branches, unlicensedIds, value, onChange, error, label, t }) {
  const unlicensedSet = new Set(unlicensedIds)
  // Urutkan: cabang berlisensi dulu, lalu unlicensed.
  const sorted = [...branches].sort((a, b) => {
    const ua = unlicensedSet.has(a.id) ? 1 : 0
    const ub = unlicensedSet.has(b.id) ? 1 : 0
    if (ua !== ub) return ua - ub
    return (a.name || '').localeCompare(b.name || '')
  })
  return (
    <div>
      <label className="block text-sm font-medium text-muted mb-1.5">{label}</label>
      <div className="space-y-1.5">
        {sorted.map((b) => {
          const selected   = value === b.id
          const unlicensed = unlicensedSet.has(b.id)
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => !unlicensed && onChange(b.id)}
              disabled={unlicensed}
              className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                unlicensed
                  ? 'bg-dark-surface/40 border-dark-border opacity-60 cursor-not-allowed'
                  : selected
                  ? 'bg-brand/10 border-brand/40 ring-2 ring-brand/15'
                  : 'bg-dark-surface border-dark-border hover:border-brand/30'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                unlicensed ? 'bg-amber-500/10 text-amber-400' :
                selected   ? 'bg-brand/20 text-brand' : 'bg-dark-card text-muted'
              }`}>
                {unlicensed ? <ShieldAlert className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${selected ? 'text-brand' : 'text-off-white'}`}>{b.name}</span>
                  {b.code && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-dark-card text-muted">/{b.code}</span>
                  )}
                </div>
                {b.address && (
                  <p className="text-[11px] text-muted truncate mt-0.5">{b.address}</p>
                )}
                {unlicensed && (
                  <p className="text-[11px] text-amber-400 mt-0.5">{t('tenantAdmin.staff.branchUnlicensed')} — {t('tenantAdmin.staff.branchUnlicensedHint')}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
    </div>
  )
}

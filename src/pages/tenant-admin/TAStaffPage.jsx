import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plus, Edit2, Trash2, Star, Search, Mail, KeyRound, Copy, Check, AlertTriangle, Camera, X, Eye, EyeOff, RefreshCw, Users } from 'lucide-react'
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

const ROLES = [
  { value: 'barber', label: 'Barber' },
  { value: 'kasir', label: 'Kasir' },
  { value: 'manager', label: 'Manager' },
]

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
  // Reset password — admin boleh menentukan password sendiri (kosong = otomatis)
  const [customPw, setCustomPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwError, setPwError] = useState('')

  const { data: allStaff = [], isLoading: isLoadingStaff } = useUsers({ tenantId: user?.tenantId })
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
    try {
      if (editStaff) {
        // Saat edit, jangan kirim email (untuk hindari bentrok unique) kecuali memang berubah.
        // Kasir yang ditandai "juga barber" memakai skema hybrid (gaji pokok +
        // komisi) supaya komisi atas layanan yang dia kerjakan tetap dihitung.
        const isBarber = form.role === 'kasir' ? !!form.isBarber : false
        const salaryType = form.role === 'kasir' ? (isBarber ? 'hybrid' : 'fixed') : form.salaryType
        const patch = { name: form.name, role: form.role, branchId: form.branchId, commissionRate: form.commissionRate, salaryType, baseSalary: form.baseSalary, isBarber, photo: form.photo || null }
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
            ? { commissionRate: form.commissionRate, salaryType: form.salaryType, baseSalary: form.baseSalary }
            : form.role === 'kasir'
              ? form.isBarber
                ? { salaryType: 'hybrid', baseSalary: form.baseSalary, isBarber: true, commissionRate: form.commissionRate }
                : { salaryType: 'fixed', baseSalary: form.baseSalary, isBarber: false }
              : {}),
        })
        toast.success(t('tenantAdmin.staff.staffAdded'))
        setShowModal(false)
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

  const handleDelete = async (member) => {
    try {
      await deleteUser.mutateAsync(member.id)
      toast.success(t('tenantAdmin.staff.staffDeleted'))
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
      setPwError('Password minimal 6 karakter')
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
      toast.error(err?.response?.data?.error || 'Gagal mereset password')
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
          {/* Breakdown bonus — info kuota tenant kalau ada bonus cabang aktif */}
          {bonusStaff > 0 && (
            <p className="text-[11px] text-muted mt-1 leading-snug">
              Kuota = <b className="text-off-white">{baseMaxStaff}</b> (paket {subscription?.package})
              {' + '}<b className="text-brand">{bonusStaff}</b> bonus ({paidAddons} cabang add-on × {bonusPerBranch}/cabang)
            </p>
          )}
          {/* Warning kalau over atau mendekati. Add-on info muncul kalau super-
              admin sudah set staffAddonPrice > 0; kalau 0 (soft launch) cuma
              info "naik paket" tanpa angka. */}
          {overQuota && (
            <p className="text-xs text-red-300 mt-2 max-w-md">
              {staffAddonPrice > 0
                ? <>Anda kena tambahan biaya <b className="text-off-white">{formatRupiah(staffAddonPrice)}/{staffAddonType === 'monthly' ? 'bln' : 'staf'}</b> untuk {staffUsed - staffQuota} staf di atas kuota paket {subscription?.package}{bonusStaff > 0 && ' (sudah termasuk bonus cabang)'}. Tambah cabang lagi untuk dapat {bonusPerBranch > 0 ? `+${bonusPerBranch} staf bonus` : 'kuota lebih'}, atau upgrade paket.</>
                : <>Anda melebihi kuota paket <b className="text-off-white">{subscription?.package}</b> ({staffUsed}/{staffQuota}). Pertimbangkan upgrade ke paket lebih besar.</>}
            </p>
          )}
          {nearQuota && !overQuota && staffAddonPrice > 0 && (
            <p className="text-xs text-amber-300 mt-2 max-w-md">
              Kuota staf hampir habis. Staf ke-{staffQuota + 1} dst akan kena <b className="text-off-white">{formatRupiah(staffAddonPrice)}/{staffAddonType === 'monthly' ? 'bln' : 'staf'}</b>.
              {bonusPerBranch > 0 && <> Atau tambah cabang untuk dapat +{bonusPerBranch} staf bonus.</>}
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

      {/* Staff grid */}
      {!isLoading && (
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
                          title="Reset password"
                          aria-label={`Reset password ${member.name}`}
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(member)} className="p-2 rounded-lg text-muted hover:text-blue-400 active:text-blue-400 hover:bg-dark-surface transition-colors" title="Edit" aria-label={`Edit ${member.name}`}>
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(member)} className="p-2 rounded-lg text-muted hover:text-red-400 active:text-red-400 hover:bg-dark-surface transition-colors" title="Hapus" aria-label={`Hapus ${member.name}`}>
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
            label="Email Login"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="staf@contoh.com"
            error={formError.email}
            hint={editStaff ? 'Mengubah email akan mengubah login staf.' : 'Staf akan login dengan email ini. Password akan dibuat otomatis dan ditampilkan setelah simpan.'}
          />
          <Select
            label={t('tenantAdmin.staff.role')}
            value={form.role}
            onChange={e => setForm(f => ({
              ...f,
              role: e.target.value,
              // Kasir tak punya omzet pribadi → skemanya selalu gaji pokok.
              salaryType: e.target.value === 'kasir' ? 'fixed' : f.salaryType,
            }))}
            options={ROLES}
            placeholder=""
          />
          <Select
            label={t('tenantAdmin.staff.branch')}
            value={form.branchId}
            onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
            options={branches.map(b => ({ value: b.id, label: b.name }))}
            error={formError.branchId}
          />
          {(form.role === 'barber' || form.role === 'kasir') && (
            <div className="space-y-3 p-3 rounded-xl bg-dark-surface border border-dark-border">
              {form.role === 'barber' ? (
                <>
                  <Select
                    label="Skema Gaji"
                    value={form.salaryType}
                    onChange={e => setForm(f => ({ ...f, salaryType: e.target.value }))}
                    options={[
                      { value: 'commission', label: 'Komisi (% omzet)' },
                      { value: 'fixed',      label: 'Gaji Pokok (tetap)' },
                      { value: 'hybrid',     label: 'Pokok + Komisi' },
                    ]}
                    placeholder=""
                  />
                  {(form.salaryType === 'commission' || form.salaryType === 'hybrid') && (
                    <Input
                      label={t('tenantAdmin.staff.commissionRateLabel')}
                      type="number" step="0.01" min="0" max="1"
                      value={form.commissionRate}
                      onChange={e => setForm(f => ({ ...f, commissionRate: parseFloat(e.target.value) || 0 }))}
                      hint="Contoh 0.35 = 35% dari omzet barber."
                    />
                  )}
                  {(form.salaryType === 'fixed' || form.salaryType === 'hybrid') && (
                    <Input
                      label="Gaji Pokok per Bulan (Rp)"
                      type="number" min="0" step="50000"
                      value={form.baseSalary}
                      onChange={e => setForm(f => ({ ...f, baseSalary: parseInt(e.target.value, 10) || 0 }))}
                      hint="Dibayar tetap tiap bulan, tak tergantung omzet."
                    />
                  )}
                </>
              ) : (
                // Kasir: gaji pokok + opsi merangkap sebagai barber (toko kecil).
                <>
                  <Input
                    label="Gaji Pokok per Bulan (Rp)"
                    type="number" min="0" step="50000"
                    value={form.baseSalary}
                    onChange={e => setForm(f => ({ ...f, baseSalary: parseInt(e.target.value, 10) || 0 }))}
                    hint="Kasir digaji pokok tetap tiap bulan."
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
                      <span className="block text-sm font-medium text-off-white">Juga seorang barber</span>
                      <span className="block text-xs text-muted leading-snug">Untuk toko kecil — kasir ini ikut memotong. Namanya akan muncul di pilihan barber saat transaksi, dan komisi serta rating-nya tercatat.</span>
                    </span>
                  </label>

                  {form.isBarber && (
                    <Input
                      label="Komisi Barber"
                      type="number" step="0.01" min="0" max="1"
                      value={form.commissionRate}
                      onChange={e => setForm(f => ({ ...f, commissionRate: parseFloat(e.target.value) || 0 }))}
                      hint="Contoh 0.35 = 35% dari layanan yang dia kerjakan (di luar gaji pokok)."
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
                ? 'Menyimpan...'
                : (editStaff ? t('common.save') : t('common.add'))}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Konfirmasi Reset Password */}
      <Modal
        isOpen={!!resetTarget}
        onClose={closeReset}
        title="Reset Password Staf"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-amber-400/10 border border-amber-400/20 rounded-xl">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-amber-200 font-medium mb-1">Password lama akan langsung tidak berlaku</p>
              <p className="text-muted text-xs leading-relaxed">
                Begitu di-reset, staf langsung di-logout dari semua perangkat. Anda bisa menentukan password sendiri di bawah, atau biarkan kosong agar dibuat otomatis. Password ditampilkan <span className="text-amber-300 font-semibold">satu kali</span> di layar berikut — catat sebelum menutup.
              </p>
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
            <label className="block text-sm font-medium text-muted mb-1.5">Password baru</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={customPw}
                onChange={e => { setCustomPw(e.target.value); setPwError('') }}
                placeholder="Kosongkan untuk dibuat otomatis"
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
                  aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="p-2 rounded-lg text-muted hover:text-brand transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => { setCustomPw(genPassword()); setShowPw(true); setPwError('') }}
                  aria-label="Buat password acak"
                  title="Buat acak"
                  className="p-2 rounded-lg text-muted hover:text-brand transition-colors"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>
            {pwError
              ? <p className="mt-1.5 text-xs text-red-400">{pwError}</p>
              : <p className="mt-1.5 text-xs text-muted">Minimal 6 karakter. Kosongkan agar sistem yang membuat.</p>}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={closeReset}
              disabled={resetPassword.isPending}
            >
              Batal
            </Button>
            <Button
              fullWidth
              icon={KeyRound}
              onClick={() => handleResetPassword(resetTarget)}
              disabled={resetPassword.isPending}
            >
              {resetPassword.isPending ? 'Memproses...' : 'Reset Password'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tampilkan kredensial sekali */}
      <CredentialsModal
        credentials={credentials}
        onClose={() => setCredentials(null)}
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
  const inputRef = useRef(null)
  const [imgError, setImgError] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file maksimal 5MB')
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
      <p className="text-xs text-muted self-start">Foto Profil</p>
      <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
        <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-dark-border group-hover:ring-brand/50 transition-all">
          {value && !imgError ? (
            <img src={value} alt="foto" className="w-full h-full object-cover" onError={() => setImgError(true)} />
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
          {value ? 'Ganti foto' : 'Upload foto'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); setImgError(false) }}
            className="text-xs text-muted hover:text-red-400 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Hapus
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
  const title = credentials.mode === 'reset' ? 'Password Baru Berhasil Dibuat' : 'Akun Staf Berhasil Dibuat'

  return (
    <Modal isOpen onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 bg-amber-400/10 border border-amber-400/20 rounded-xl">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-200 leading-relaxed">
            Password ini hanya ditampilkan <span className="font-semibold text-amber-300">sekali</span>. Catat atau salin sekarang dan berikan ke staf yang bersangkutan. Setelah modal ini ditutup, sistem tidak menyimpannya dalam bentuk yang bisa dilihat lagi.
          </p>
        </div>

        <div className="p-4 bg-dark-card rounded-2xl border border-dark-border space-y-3">
          <p className="text-sm text-off-white font-medium">{credentials.name}</p>

          <div>
            <p className="text-xs text-muted mb-1">Email login</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-dark-surface rounded-xl text-sm text-off-white font-mono break-all">
                {credentials.email}
              </code>
              <button
                type="button"
                onClick={() => copy(credentials.email, 'email')}
                className="p-2 rounded-xl border border-dark-border text-muted hover:text-brand hover:border-brand/30 transition-colors"
                title="Salin email"
              >
                {copied === 'email' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted mb-1">{credentials.custom ? 'Password baru' : 'Password sementara'}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-dark-surface rounded-xl text-sm text-brand font-mono tracking-wider select-all break-all">
                {credentials.tempPassword}
              </code>
              <button
                type="button"
                onClick={() => copy(credentials.tempPassword, 'password')}
                className="p-2 rounded-xl border border-dark-border text-muted hover:text-brand hover:border-brand/30 transition-colors"
                title="Salin password"
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
            {copied === 'both' ? 'Tersalin' : 'Salin keduanya'}
          </button>
        </div>

        <Button fullWidth onClick={onClose}>Sudah saya catat</Button>
      </div>
    </Modal>
  )
}

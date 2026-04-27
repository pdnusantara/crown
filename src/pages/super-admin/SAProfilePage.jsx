import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { User, Lock, Shield, Eye, EyeOff, Check, Smartphone, LogOut, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Avatar from '../../components/ui/Avatar.jsx'

const SESSIONS = [
  { id: 's1', device: 'Chrome · Windows 11', ip: '182.x.x.x', location: 'Jakarta, ID', timeKey: 'sessionCurrent',   current: true },
  { id: 's2', device: 'Safari · iPhone 14',  ip: '114.x.x.x', location: 'Bandung, ID', timeKey: 'sessionHoursAgo',  current: false },
  { id: 's3', device: 'Firefox · macOS',     ip: '36.x.x.x',  location: 'Surabaya, ID', timeKey: 'sessionYesterday', current: false },
]

export default function SAProfilePage() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const toast = useToast()

  // Profile form
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')

  // Password form
  const [oldPwd, setOldPwd]     = useState('')
  const [newPwd, setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showOld, setShowOld]   = useState(false)
  const [showNew, setShowNew]   = useState(false)

  // 2FA
  const [twoFAEnabled, setTwoFAEnabled] = useState(false)
  const [twoFAStep, setTwoFAStep]       = useState(null) // null | 'qr' | 'verify'
  const [otpCode, setOtpCode]           = useState('')

  // Sessions
  const [sessions, setSessions] = useState(SESSIONS)

  const handleSaveProfile = () => {
    if (!name.trim()) return toast.error(t('superAdmin.profile.toastNameEmpty'))
    toast.success(t('superAdmin.profile.toastProfileUpdated'))
  }

  const handleChangePassword = () => {
    if (!oldPwd || !newPwd || !confirmPwd) return toast.error(t('superAdmin.profile.toastAllFieldsRequired'))
    if (newPwd.length < 8) return toast.error(t('superAdmin.profile.toastPwdMinLen'))
    if (newPwd !== confirmPwd) return toast.error(t('superAdmin.profile.toastPwdMismatch'))
    setOldPwd(''); setNewPwd(''); setConfirmPwd('')
    toast.success(t('superAdmin.profile.toastPwdChanged'))
  }

  const handleEnable2FA = () => {
    setTwoFAStep('qr')
  }

  const handleVerify2FA = () => {
    if (otpCode.length < 6) return toast.error(t('superAdmin.profile.toastOtpLen'))
    setTwoFAEnabled(true)
    setTwoFAStep(null)
    setOtpCode('')
    toast.success(t('superAdmin.profile.toast2FAEnabled'))
  }

  const handleDisable2FA = () => {
    setTwoFAEnabled(false)
    toast.info(t('superAdmin.profile.toast2FADisabled'))
  }

  const handleRevokeSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id))
    toast.success(t('superAdmin.profile.toastSessionEnded'))
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.profile.pageTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('superAdmin.profile.pageSubtitle')}</p>
      </div>

      {/* Profile Info */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white">{t('superAdmin.profile.profileInfo')}</h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4 mb-2">
              <Avatar name={name || 'A'} size="lg" />
              <div>
                <p className="text-off-white font-semibold">{user?.name}</p>
                <p className="text-xs text-muted capitalize">{user?.role?.replace('_', ' ')}</p>
                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-gold/10 border border-gold/30 text-gold font-semibold">
                  {t('superAdmin.profile.roleBadge')}
                </span>
              </div>
            </div>
            <Input label={t('superAdmin.profile.fullNameLabel')} value={name} onChange={e => setName(e.target.value)} />
            <Input label={t('superAdmin.profile.emailLabel')} type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <Button icon={Check} size="sm" onClick={handleSaveProfile}>{t('superAdmin.profile.saveChanges')}</Button>
          </CardBody>
        </Card>
      </motion.div>

      {/* Change Password */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white">{t('superAdmin.profile.changePassword')}</h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="relative">
              <Input
                label={t('superAdmin.profile.oldPasswordLabel')}
                type={showOld ? 'text' : 'password'}
                value={oldPwd}
                onChange={e => setOldPwd(e.target.value)}
                placeholder={t('superAdmin.profile.oldPasswordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowOld(v => !v)}
                className="absolute right-3 top-8 text-muted hover:text-off-white transition-colors"
              >
                {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="relative">
              <Input
                label={t('superAdmin.profile.newPasswordLabel')}
                type={showNew ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder={t('superAdmin.profile.newPasswordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-8 text-muted hover:text-off-white transition-colors"
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <Input
              label={t('superAdmin.profile.confirmPasswordLabel')}
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder={t('superAdmin.profile.confirmPasswordPlaceholder')}
            />
            {newPwd && (
              <div className="space-y-1">
                {[
                  { label: t('superAdmin.profile.pwdMin8'),   ok: newPwd.length >= 8 },
                  { label: t('superAdmin.profile.pwdUpper'),  ok: /[A-Z]/.test(newPwd) },
                  { label: t('superAdmin.profile.pwdNumber'), ok: /\d/.test(newPwd) },
                ].map(r => (
                  <div key={r.label} className={`flex items-center gap-2 text-xs ${r.ok ? 'text-green-400' : 'text-muted'}`}>
                    <Check size={11} className={r.ok ? 'text-green-400' : 'opacity-30'} />
                    {r.label}
                  </div>
                ))}
              </div>
            )}
            <Button icon={Lock} size="sm" onClick={handleChangePassword}>{t('superAdmin.profile.changePasswordBtn')}</Button>
          </CardBody>
        </Card>
      </motion.div>

      {/* 2FA */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white">{t('superAdmin.profile.twoFATitle')}</h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-off-white">
                  {t('superAdmin.profile.statusLabel')} {' '}
                  <span className={twoFAEnabled ? 'text-green-400 font-semibold' : 'text-muted'}>
                    {twoFAEnabled ? t('superAdmin.profile.twoFAActive') : t('superAdmin.profile.twoFAInactive')}
                  </span>
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {t('superAdmin.profile.twoFADesc')}
                </p>
              </div>
              {twoFAEnabled
                ? <Button variant="secondary" size="sm" onClick={handleDisable2FA}>{t('superAdmin.profile.disableBtn')}</Button>
                : <Button size="sm" icon={Smartphone} onClick={handleEnable2FA}>{t('superAdmin.profile.enable2FABtn')}</Button>
              }
            </div>

            {twoFAStep === 'qr' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-dark-card rounded-xl border border-dark-border space-y-3">
                <p className="text-sm text-off-white font-medium">{t('superAdmin.profile.scanQr')}</p>
                {/* Simulated QR */}
                <div className="w-36 h-36 bg-white rounded-xl mx-auto flex items-center justify-center">
                  <div className="grid grid-cols-5 gap-1 p-2">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div key={i} className={`w-4 h-4 rounded-sm ${Math.random() > 0.4 ? 'bg-dark' : 'bg-white'}`} />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted text-center">{t('superAdmin.profile.manualCode')} <span className="font-mono text-gold">BARB-EROS-SA01</span></p>
                <div className="flex gap-2">
                  <input
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={t('superAdmin.profile.otpPlaceholder')}
                    className="flex-1 bg-dark-surface border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-gold/50"
                    maxLength={6}
                  />
                  <Button size="sm" onClick={handleVerify2FA}>{t('superAdmin.profile.verifyBtn')}</Button>
                </div>
              </motion.div>
            )}
          </CardBody>
        </Card>
      </motion.div>

      {/* Active Sessions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <LogOut size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white">{t('superAdmin.profile.activeSessions')}</h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {sessions.map(s => (
              <div key={s.id} className={`flex items-center justify-between p-3 rounded-xl border ${s.current ? 'border-gold/30 bg-gold/5' : 'border-dark-border'}`}>
                <div>
                  <p className="text-sm font-medium text-off-white">{s.device}</p>
                  <p className="text-xs text-muted mt-0.5">{s.ip} · {s.location} · {t(`superAdmin.profile.${s.timeKey}`)}</p>
                </div>
                {s.current
                  ? <span className="text-xs text-green-400 font-semibold">{t('superAdmin.profile.thisSession')}</span>
                  : (
                    <button
                      onClick={() => handleRevokeSession(s.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium"
                    >
                      {t('superAdmin.profile.endSession')}
                    </button>
                  )
                }
              </div>
            ))}
            <div className="pt-1">
              <button className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors">
                <AlertTriangle size={12} />
                {t('superAdmin.profile.endAllOther')}
              </button>
            </div>
          </CardBody>
        </Card>
      </motion.div>
    </div>
  )
}

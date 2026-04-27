import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Activity, Users, Zap, TrendingUp, Eye } from 'lucide-react'
import { useTenantStore } from '../../store/tenantStore.js'
import { useFeatureFlagStore, ALL_FEATURE_FLAGS } from '../../store/featureFlagStore.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'

// Simulated daily active users per tenant (last 7 days)
function generateDAU(seed, base) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date()
    day.setDate(day.getDate() - (6 - i))
    const label = day.toLocaleDateString('id-ID', { weekday: 'short' })
    const value = Math.max(1, Math.round(base + (Math.sin(i * seed) * base * 0.3) + (Math.random() * base * 0.2)))
    return { day: label, value }
  })
}

const TENANT_USAGE = {
  'barber-king':  { dau: generateDAU(1.2, 42), sessions: 1284, avgSession: '8m 32s', topFeatures: ['pos', 'queue', 'booking', 'reports', 'loyalty'] },
  'oldboy-cuts':  { dau: generateDAU(0.8, 18), sessions: 432,  avgSession: '6m 15s', topFeatures: ['pos', 'queue', 'voucher', 'booking', 'staff_schedule'] },
}

const FEATURE_ADOPTION = [
  { flag: 'pos',            labelKey: 'featurePosKasir',        adoption: 100 },
  { flag: 'queue',          labelKey: 'featureAntrian',         adoption: 100 },
  { flag: 'booking',        labelKey: 'featureBookingOnline',   adoption: 85 },
  { flag: 'loyalty',        labelKey: 'featureLoyaltyPoints',   adoption: 70 },
  { flag: 'reports',        labelKey: 'featureLaporan',         adoption: 65 },
  { flag: 'voucher',        labelKey: 'featureVoucher',         adoption: 55 },
  { flag: 'staff_schedule', labelKey: 'featureJadwalStaff',     adoption: 50 },
  { flag: 'barber_rating',  labelKey: 'featureRatingBarber',    adoption: 45 },
  { flag: 'whatsapp',       labelKey: 'featureWhatsappNotif',   adoption: 35 },
  { flag: 'multi_branch',   labelKey: 'featureMultiCabang',     adoption: 30 },
]

const CustomTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2 text-sm">
      <p className="text-muted mb-1">{label}</p>
      <p className="text-gold font-semibold">{t('superAdmin.usage.tooltipActiveUsers', { count: payload[0].value })}</p>
    </div>
  )
}

export default function SAUsagePage() {
  const { t } = useTranslation()
  const { tenants } = useTenantStore()
  const { getTenantFlags } = useFeatureFlagStore()
  const [selectedTenant, setSelectedTenant] = useState(tenants[0]?.id || '')

  const usage = TENANT_USAGE[selectedTenant] || TENANT_USAGE['barber-king']
  const flags = getTenantFlags(selectedTenant)
  const activeFeatureCount = flags.length

  // Platform totals
  const totalDAU = Object.values(TENANT_USAGE).reduce((s, u) => s + u.dau[6].value, 0)
  const totalSessions = Object.values(TENANT_USAGE).reduce((s, u) => s + u.sessions, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.usage.pageTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('superAdmin.usage.pageSubtitle')}</p>
      </div>

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('superAdmin.usage.kpiTenant'),   value: tenants.length, icon: Users, color: 'text-blue-400' },
          { label: t('superAdmin.usage.kpiDau'),      value: totalDAU, icon: Activity, color: 'text-gold' },
          { label: t('superAdmin.usage.kpiSessions'), value: totalSessions.toLocaleString(), icon: Eye, color: 'text-purple-400' },
          { label: t('superAdmin.usage.kpiFeatures'), value: `${FEATURE_ADOPTION.filter(f => f.adoption > 50).length}/${FEATURE_ADOPTION.length}`, icon: Zap, color: 'text-green-400' },
        ].map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted">{kpi.label}</p>
                <kpi.icon size={16} className={kpi.color} />
              </div>
              <p className="text-2xl font-bold text-off-white">{kpi.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Tenant Selector */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted">{t('superAdmin.usage.tenantLabel')}</span>
          {tenants.map(tt => (
            <button
              key={tt.id}
              onClick={() => setSelectedTenant(tt.id)}
              className={`px-4 py-2 rounded-xl border text-sm transition-all ${selectedTenant === tt.id ? 'border-gold bg-gold/10 text-off-white' : 'border-dark-border text-muted hover:border-gold/30'}`}
            >
              {tt.name}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* DAU Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={15} className="text-gold" />
                  <h3 className="font-semibold text-off-white">{t('superAdmin.usage.dauTitle')}</h3>
                </div>
                <div className="flex gap-4 text-xs text-muted">
                  <span>{t('superAdmin.usage.totalSessions')} <span className="text-off-white font-semibold">{usage.sessions.toLocaleString()}</span></span>
                  <span>{t('superAdmin.usage.avgSession')} <span className="text-off-white font-semibold">{usage.avgSession}</span></span>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={usage.dau} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                  <XAxis dataKey="day" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
                  <Tooltip content={<CustomTooltip t={t} />} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {usage.dau.map((_, index) => (
                      <Cell key={index} fill={index === usage.dau.length - 1 ? '#C9A84C' : '#C9A84C44'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </div>

        {/* Tenant Feature Usage */}
        <div>
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-off-white">{t('superAdmin.usage.tenantFeatures')}</h3>
            </CardHeader>
            <CardBody>
              <p className="text-3xl font-bold text-gold mb-1">{activeFeatureCount}</p>
              <p className="text-xs text-muted mb-4">{t('superAdmin.usage.ofAvailable', { total: ALL_FEATURE_FLAGS.length })}</p>
              <div className="space-y-2">
                {usage.topFeatures.map((f, i) => {
                  const flag = ALL_FEATURE_FLAGS.find(fl => fl.id === f)
                  return (
                    <div key={f} className="flex items-center gap-2">
                      <span className="text-xs text-muted w-4">{i + 1}.</span>
                      <div className="flex-1 h-1.5 bg-dark-card rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${100 - i * 14}%` }}
                          transition={{ delay: i * 0.08, duration: 0.5 }}
                          className="h-full bg-gold rounded-full"
                        />
                      </div>
                      <span className="text-xs text-off-white w-28 truncate">{flag?.label || f}</span>
                    </div>
                  )
                })}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Platform Feature Adoption */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap size={15} className="text-gold" />
            <h3 className="font-semibold text-off-white">{t('superAdmin.usage.adoptionTitle')}</h3>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            {FEATURE_ADOPTION.map((f, i) => (
              <motion.div key={f.flag} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-off-white w-36 truncate">{t(`superAdmin.usage.${f.labelKey}`)}</span>
                  <div className="flex-1 h-2 bg-dark-card rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${f.adoption}%` }}
                      transition={{ delay: i * 0.05, duration: 0.6 }}
                      className={`h-full rounded-full ${f.adoption >= 75 ? 'bg-green-400' : f.adoption >= 50 ? 'bg-gold' : f.adoption >= 30 ? 'bg-amber-400' : 'bg-dark-border'}`}
                    />
                  </div>
                  <span className="text-xs text-muted w-10 text-right">{f.adoption}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

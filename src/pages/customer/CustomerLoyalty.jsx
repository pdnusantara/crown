import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Star, Gift, TrendingUp, Award } from 'lucide-react'
import { useTenantStore } from '../../store/tenantStore.js'
import Card from '../../components/ui/Card.jsx'
import { formatRupiah } from '../../utils/format.js'

const TIERS = [
  { name: 'Bronze', min: 0, max: 100, color: 'text-amber-700', bg: 'bg-amber-700/10', border: 'border-amber-700/20' },
  { name: 'Silver', min: 100, max: 250, color: 'text-gray-300', bg: 'bg-gray-400/10', border: 'border-gray-400/20' },
  { name: 'Gold', min: 250, max: 500, color: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/20' },
  { name: 'Platinum', min: 500, max: 99999, color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/20' },
]

export default function CustomerLoyalty() {
  const { t } = useTranslation()
  const { getCustomerById } = useTenantStore()
  const customer = getCustomerById('cust-001')

  const REWARDS = [
    { id: 1, name: t('customer.rewardDiscount10Haircut'), points: 50, type: 'discount' },
    { id: 2, name: t('customer.rewardFreeBeard'), points: 100, type: 'free' },
    { id: 3, name: t('customer.rewardDiscount20HairMask'), points: 150, type: 'discount' },
    { id: 4, name: t('customer.rewardFreeRegularCut'), points: 200, type: 'free' },
    { id: 5, name: t('customer.rewardPremiumFree'), points: 400, type: 'premium' },
  ]

  const points = customer?.loyaltyPoints || 480
  const currentTier = TIERS.findLast(t => points >= t.min) || TIERS[0]
  const nextTier = TIERS.find(t => t.min > points)
  const progress = nextTier ? ((points - currentTier.min) / (nextTier.min - currentTier.min)) * 100 : 100

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('customer.loyaltyTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('customer.loyaltySubtitle')}</p>
      </div>

      {/* Points card */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={`p-6 ${currentTier.bg} ${currentTier.border} border`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted mb-1">{t('customer.yourPoints')}</p>
              <div className="flex items-end gap-2">
                <span className={`text-4xl font-bold ${currentTier.color}`}>{points}</span>
                <span className="text-muted mb-1">{t('customer.pointsUnit')}</span>
              </div>
            </div>
            <div className={`p-3 rounded-2xl ${currentTier.bg} border ${currentTier.border}`}>
              <Award className={`w-8 h-8 ${currentTier.color}`} />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-semibold ${currentTier.color}`}>
              {t('customer.memberLevel', { tier: currentTier.name })}
            </span>
            {nextTier && (
              <span className="text-xs text-muted">
                {t('customer.pointsToNext', { points: nextTier.min - points, tier: nextTier.name })}
              </span>
            )}
          </div>

          {nextTier && (
            <div className="h-2 bg-dark-surface rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r from-gold to-gold-light`}
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </Card>
      </motion.div>

      {/* Tiers */}
      <div>
        <h3 className="font-semibold text-off-white mb-3">{t('customer.memberTiers')}</h3>
        <div className="grid grid-cols-2 gap-3">
          {TIERS.map(tier => (
            <Card key={tier.name} className={`p-4 ${tier.name === currentTier.name ? `${tier.bg} ${tier.border} border` : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <Award className={`w-5 h-5 ${tier.color}`} />
                <span className={`font-semibold ${tier.color}`}>{tier.name}</span>
              </div>
              <p className="text-xs text-muted">
                {tier.max === 99999 ? t('customer.pointsPlus', { min: tier.min }) : t('customer.pointsRange', { min: tier.min, max: tier.max })}
              </p>
              {tier.name === currentTier.name && (
                <span className="text-xs text-gold mt-1 block">{t('customer.yourCurrentLevel')}</span>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Rewards */}
      <div>
        <h3 className="font-semibold text-off-white mb-3">{t('customer.redeemPoints')}</h3>
        <div className="space-y-2">
          {REWARDS.map((reward, i) => {
            const canRedeem = points >= reward.points
            return (
              <motion.div key={reward.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className={`p-4 ${canRedeem ? 'card-hover' : 'opacity-50'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                        <Gift className="w-5 h-5 text-gold" />
                      </div>
                      <div>
                        <p className="font-medium text-off-white">{reward.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="w-3.5 h-3.5 text-gold" />
                          <span className="text-xs text-gold font-semibold">{t('customer.pointsRequired', { n: reward.points })}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      disabled={!canRedeem}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${canRedeem ? 'bg-gold text-dark hover:bg-gold-light' : 'bg-dark-surface text-muted cursor-not-allowed'}`}
                    >
                      {t('customer.redeem')}
                    </button>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* How to earn */}
      <Card className="p-5">
        <h3 className="font-semibold text-off-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gold" />
          {t('customer.howToEarn')}
        </h3>
        <div className="space-y-2 text-sm">
          {[
            { action: t('customer.earnPerTransaction'), points: 1 },
            { action: t('customer.earnBirthday'), points: 50 },
            { action: t('customer.earnReferral'), points: 30 },
            { action: t('customer.earnReview'), points: 10 },
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-dark-border last:border-0">
              <span className="text-muted">{item.action}</span>
              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                <span className="text-gold font-medium">+{item.points}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

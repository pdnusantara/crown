import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Trophy, Star, Scissors, AlertCircle } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card.jsx'
import { useBarberLeaderboard } from '../../hooks/useBarberLeaderboard.js'
import { formatRupiah } from '../../utils/format.js'

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' }

function Avatar({ name, photo, highlight }) {
  if (photo) {
    return <img src={photo} alt={name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
  }
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm ${highlight ? 'bg-brand text-dark' : 'bg-dark-surface text-muted'}`}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

function Row({ row, isMe }) {
  const { t } = useTranslation()
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${isMe ? 'border-brand/40 bg-brand/5' : 'border-dark-border bg-dark-card'}`}>
      <div className="w-8 text-center flex-shrink-0">
        {MEDAL[row.rank] ? <span className="text-xl">{MEDAL[row.rank]}</span> : <span className="text-sm font-bold text-muted tabular-nums">{row.rank}</span>}
      </div>
      <Avatar name={row.name} photo={row.photo} highlight={isMe} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-off-white truncate">
          {row.name}{isMe && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand text-dark align-middle">{t('barber.leaderboardYou')}</span>}
        </p>
        <p className="text-xs text-muted flex items-center gap-2 mt-0.5">
          <span className="inline-flex items-center gap-1"><Scissors size={11} />{t('barber.leaderboardServicesCount', { count: row.services })}</span>
          {row.avgRating != null && (
            <span className="inline-flex items-center gap-1"><Star size={11} className="text-amber-400" />{row.avgRating.toFixed(1)}</span>
          )}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-off-white tabular-nums">{formatRupiah(row.revenue)}</p>
        <p className="text-[10px] text-muted">{t('barber.leaderboardRevenueThisMonth')}</p>
      </div>
    </div>
  )
}

export default function BarberLeaderboardPage() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useBarberLeaderboard()
  const list = data?.list || []
  const meId = data?.meId
  const myRow = list.find((r) => r.barberId === meId)
  const inTop = myRow && myRow.rank <= 3

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white flex items-center gap-2">
          <Trophy size={22} className="text-amber-400" /> {t('barber.leaderboardTitle')}
        </h1>
        <p className="text-muted text-xs sm:text-sm mt-0.5">{t('barber.leaderboardSubtitle')}</p>
      </div>

      {/* Ringkasan posisi sendiri */}
      {myRow && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardBody className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted">{t('barber.leaderboardYourPosition')}</p>
                <p className="text-2xl font-bold text-off-white">
                  #{myRow.rank} <span className="text-sm font-medium text-muted">{t('barber.leaderboardOutOf', { count: list.length })}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-brand tabular-nums">{formatRupiah(myRow.revenue)}</p>
                <p className="text-xs text-muted">{t('barber.leaderboardServicesCount', { count: myRow.services })}{inTop ? t('barber.leaderboardAtTop') : ''}</p>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[68px] rounded-xl bg-dark-card animate-pulse" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted">
          <AlertCircle size={28} />
          <p className="text-sm">{t('barber.leaderboardLoadFailed')}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted text-center">
          <Trophy size={28} className="opacity-40" />
          <p className="text-sm">{t('barber.leaderboardNoTx')}</p>
          <p className="text-xs">{t('barber.leaderboardNoTxHint')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((row) => (
            <Row key={row.barberId} row={row} isMe={row.barberId === meId} />
          ))}
        </div>
      )}
    </div>
  )
}

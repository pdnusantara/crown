import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, MessageCircle, Database, RefreshCw, ChevronRight } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../ui/Card.jsx'
import { useSystemHealth } from '../../hooks/useSystemHealth.js'

const DOT = { ok: 'bg-green-400', warn: 'bg-amber-400', bad: 'bg-red-400', unknown: 'bg-gray-400' }
const TEXT = { ok: 'text-green-400', warn: 'text-amber-400', bad: 'text-red-400', unknown: 'text-muted' }
const LABEL = { ok: 'Sehat', warn: 'Perhatian', bad: 'Bermasalah', unknown: 'Tak diketahui' }

// "2 jam lalu" / "5 menit lalu" — relatif, ringkas, Bahasa Indonesia.
function relTime(iso) {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return 'baru saja'
  const m = Math.round(diffMs / 60000)
  if (m < 1) return 'baru saja'
  if (m < 60) return `${m} menit lalu`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.round(h / 24)
  return `${d} hari lalu`
}

function Row({ status = 'unknown', icon: Icon, label, detail, onClick }) {
  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-xl border border-dark-border bg-dark-card ${onClick ? 'cursor-pointer hover:border-brand/30 transition-colors' : ''}`}
      onClick={onClick}
    >
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        {status === 'bad' && <span className={`absolute inline-flex h-full w-full rounded-full ${DOT[status]} opacity-60 animate-ping`} />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT[status] || DOT.unknown}`} />
      </span>
      <Icon size={15} className="text-muted flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-off-white truncate">{label}</p>
        <p className="text-xs text-muted truncate">{detail}</p>
      </div>
      <span className={`text-[11px] font-semibold ${TEXT[status] || TEXT.unknown} flex-shrink-0`}>{LABEL[status] || LABEL.unknown}</span>
      {onClick && <ChevronRight size={14} className="text-muted flex-shrink-0" />}
    </div>
  )
}

export default function SystemHealthCard({ delay = 0 }) {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useSystemHealth()

  const overall = data?.overall || 'unknown'
  const e = data?.errors
  const w = data?.whatsapp
  const b = data?.backup
  const c = data?.cronRenewal

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-brand" />
              <h3 className="font-semibold text-off-white">Kesehatan Sistem</h3>
            </div>
            {data && (
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${TEXT[overall]}`}>
                <span className={`h-2 w-2 rounded-full ${DOT[overall]}`} />{LABEL[overall]}
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-[52px] rounded-xl bg-dark-card animate-pulse" />)}
            </div>
          ) : isError ? (
            <p className="text-sm text-muted text-center py-6">Gagal memuat status sistem.</p>
          ) : (
            <div className="space-y-2">
              <Row
                status={e?.status}
                icon={AlertTriangle}
                label="Error & Log"
                detail={e ? `${e.unresolved} belum ditangani · ${e.today} hari ini${e.lastAt ? ` · terakhir ${relTime(e.lastAt)}` : ''}` : '—'}
                onClick={() => navigate('/super-admin/error-logs')}
              />
              <Row
                status={w?.status}
                icon={MessageCircle}
                label="Gateway WhatsApp"
                detail={
                  !w ? '—'
                    : w.reachable ? `Terhubung${w.deviceCount != null ? ` · ${w.deviceCount} perangkat` : ''}`
                    : w.reason === 'not_configured' ? 'Belum dikonfigurasi'
                    : w.reason === 'timeout' ? 'Tak merespons (timeout)'
                    : `Tak terjangkau (${w.reason || 'error'})`
                }
                onClick={() => navigate('/super-admin/whatsapp-settings')}
              />
              <Row
                status={b?.status}
                icon={Database}
                label="Backup Database"
                detail={
                  !b ? '—'
                    : b.lastAt ? `Terakhir ${relTime(b.lastAt)} · ${b.count} arsip${b.sizeBytes ? ` · ${(b.sizeBytes / 1048576).toFixed(1)} MB` : ''}`
                    : (b.reason === 'no_backups' ? 'Belum ada backup' : 'Status tak terbaca')
                }
              />
              <Row
                status={c?.status}
                icon={RefreshCw}
                label="Cron Perpanjangan"
                detail={
                  !c ? '—'
                    : c.lastAt ? `Jalan terakhir ${relTime(c.lastAt)}`
                    : 'Belum pernah tercatat'
                }
              />
            </div>
          )}
          {data?.checkedAt && (
            <p className="text-[11px] text-muted text-right mt-3">Diperiksa {relTime(data.checkedAt)}</p>
          )}
        </CardBody>
      </Card>
    </motion.div>
  )
}

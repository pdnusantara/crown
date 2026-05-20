import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Star, Check, AlertCircle, MessageSquare } from 'lucide-react'
import publicApi from '../../lib/publicApi.js'
import { formatRupiah } from '../../utils/format.js'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'

// Halaman rating publik yang dibuka pelanggan dari link WhatsApp.
// URL: /rating/:transactionId — tenant resolver via subdomain (host header)
// jadi tidak perlu slug di path.

function StarPicker({ value, onChange, size = 'lg' }) {
  const sizes = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-10 h-10' }
  return (
    <div className="flex items-center gap-1 justify-center">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-1 transition-transform hover:scale-110 active:scale-95"
            aria-label={`${n} bintang`}
          >
            <Star
              className={`${sizes[size]} ${
                active ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-amber-100">
      <div className="text-center text-amber-700">
        <div className="animate-spin w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm">Memuat…</p>
      </div>
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-amber-100">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <p className="text-gray-700 text-sm">{message}</p>
      </div>
    </div>
  )
}

function SuccessState({ rating, message, tenantName }) {
  const high = rating >= 4
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-amber-100">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center"
      >
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
          high ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
        }`}>
          <Check className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">
          {high ? 'Terima kasih!' : 'Mohon maaf'}
        </h1>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <p className="text-xs text-gray-400 mt-6">— {tenantName}</p>
      </motion.div>
    </div>
  )
}

function RatingForm({ data, transactionId, onSubmitted }) {
  const { tenant, transaction, barbers } = data
  const [overall, setOverall] = useState(0)
  const [comment, setComment] = useState('')
  const [barberRatings, setBarberRatings] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!overall) {
      setError('Pilih bintang dulu ya')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        rating: overall,
        comment: comment.trim() || undefined,
        barberRatings: Object.entries(barberRatings)
          .filter(([_, v]) => v > 0)
          .map(([barberId, rating]) => ({ barberId, rating })),
      }
      const res = await publicApi.post(`/public/rating/${transactionId}`, payload)
      onSubmitted({
        rating: overall,
        message: res.data?.data?.message || 'Terima kasih atas penilaiannya!',
      })
    } catch (err) {
      const msg = err?.response?.data?.error || 'Gagal mengirim rating, coba lagi'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-4 py-8 bg-gradient-to-br from-amber-50 to-amber-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full"
      >
        {tenant.logo ? (
          <img
            src={tenant.logo}
            alt={tenant.name}
            className="w-16 h-16 mx-auto rounded-xl object-cover mb-3"
          />
        ) : (
          <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
            {tenant.name?.charAt(0) || '?'}
          </div>
        )}
        <h1 className="text-center text-xl font-semibold text-gray-800">
          Bagaimana pengalaman Anda?
        </h1>
        <p className="text-center text-sm text-gray-500 mt-1">
          di {tenant.name}{transaction.branchName ? ` — ${transaction.branchName}` : ''}
        </p>

        <div className="mt-3 mb-5 text-xs text-gray-400 text-center">
          {transaction.customerName ? `${transaction.customerName} • ` : ''}
          {formatRupiah(transaction.total)} •{' '}
          {new Date(transaction.createdAt).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="text-sm font-medium text-gray-700 text-center mb-2">
            Penilaian keseluruhan
          </p>
          <StarPicker value={overall} onChange={setOverall} />
          {overall > 0 && (
            <p className="text-center text-xs text-gray-500 mt-2">
              {['', 'Sangat kurang', 'Kurang', 'Cukup', 'Bagus', 'Sangat bagus'][overall]}
            </p>
          )}
        </div>

        {barbers.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-5">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Penilaian barber
            </p>
            <div className="space-y-3">
              {barbers.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-700 truncate">{b.name}</p>
                  <StarPicker
                    value={barberRatings[b.id] || 0}
                    onChange={(v) => setBarberRatings({ ...barberRatings, [b.id]: v })}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-2">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            Komentar (opsional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              overall && overall <= 3
                ? 'Apa yang bisa kami perbaiki?'
                : 'Ceritakan pengalaman Anda…'
            }
            rows={3}
            maxLength={1000}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          <p className="text-right text-xs text-gray-400 mt-1">{comment.length}/1000</p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || !overall}
          className="mt-5 w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
        >
          {submitting ? 'Mengirim…' : 'Kirim penilaian'}
        </button>
      </motion.div>
    </div>
  )
}

function AlreadyRated({ tenant, existing }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-amber-50 to-amber-100">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-amber-100 text-amber-600">
          <Check className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Sudah dinilai</h1>
        <p className="text-sm text-gray-600 mb-3">
          Anda sudah memberi penilaian untuk transaksi ini.
        </p>
        <div className="flex justify-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`w-5 h-5 ${
                n <= existing.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'
              }`}
            />
          ))}
        </div>
        {existing.comment && (
          <p className="text-xs text-gray-500 italic mt-2">"{existing.comment}"</p>
        )}
        <p className="text-xs text-gray-400 mt-4">— {tenant.name}</p>
      </div>
    </div>
  )
}

function PublicRatingPageInner() {
  const { transactionId } = useParams()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [submitted, setSubmitted] = useState(null)

  useEffect(() => {
    let cancelled = false
    publicApi.get(`/public/rating/${transactionId}`)
      .then((res) => {
        if (!cancelled) setState({ loading: false, error: null, data: res.data.data })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            error: err?.response?.data?.error || 'Tidak bisa memuat halaman rating',
            data: null,
          })
        }
      })
    return () => { cancelled = true }
  }, [transactionId])

  // Set title dengan nama tenant jika ada
  useEffect(() => {
    if (state.data?.tenant?.name) {
      document.title = `Beri Rating — ${state.data.tenant.name}`
    }
  }, [state.data])

  if (state.loading) return <LoadingState />
  if (state.error) return <ErrorState message={state.error} />
  if (submitted) {
    return (
      <SuccessState
        rating={submitted.rating}
        message={submitted.message}
        tenantName={state.data.tenant.name}
      />
    )
  }
  if (state.data.alreadyRated) {
    return <AlreadyRated tenant={state.data.tenant} existing={state.data.existing} />
  }
  return (
    <RatingForm
      data={state.data}
      transactionId={transactionId}
      onSubmitted={setSubmitted}
    />
  )
}

export default function PublicRatingPage() {
  return (
    <ErrorBoundary>
      <PublicRatingPageInner />
    </ErrorBoundary>
  )
}

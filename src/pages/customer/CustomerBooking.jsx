import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { MapPin, Check, ChevronRight, Star, Clock, Calendar, CheckCircle } from 'lucide-react'
import { useTenantStore } from '../../store/tenantStore.js'
import { useBookingStore } from '../../store/bookingStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'
import { addDays, format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const TIME_SLOTS = ['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30']

export default function CustomerBooking() {
  const { t } = useTranslation()
  const { branches, services, staff } = useTenantStore()
  const { addBooking } = useBookingStore()
  const toast = useToast()

  const STEPS = [
    t('customer.selectBranch'),
    t('customer.selectServices'),
    t('customer.selectBarber'),
    t('customer.selectDateTime'),
    t('customer.review'),
  ]

  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState({
    branch: null,
    services: [],
    barber: null,
    date: null,
    time: null,
  })
  const [booked, setBooked] = useState(false)
  const [booking, setBooking] = useState(null)

  // Filter to barber-king branches (customer is from barber-king tenant)
  const availableBranches = branches.filter(b => b.tenantId === 'barber-king')
  const branchServices = services.filter(s => s.tenantId === 'barber-king' && selected.branch?.id && s.active)
  const branchBarbers = selected.branch ? staff.filter(s => s.branchId === selected.branch.id && s.role === 'barber') : []

  const nextDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1))

  const totalPrice = selected.services.reduce((sum, svc) => sum + svc.price, 0)
  const totalDuration = selected.services.reduce((sum, svc) => sum + svc.duration, 0)

  const toggleService = (svc) => {
    setSelected(s => ({
      ...s,
      services: s.services.find(sv => sv.id === svc.id)
        ? s.services.filter(sv => sv.id !== svc.id)
        : [...s.services, svc]
    }))
  }

  const handleConfirm = () => {
    const newBooking = addBooking({
      tenantId: 'barber-king',
      branchId: selected.branch.id,
      customerId: 'cust-001',
      customerName: 'Fajar Nugroho',
      services: selected.services.map(s => s.name),
      staffId: selected.barber?.id || null,
      staffName: selected.barber?.name || null,
      date: format(selected.date, 'yyyy-MM-dd'),
      time: selected.time,
      notes: '',
    })
    setBooking(newBooking)
    setBooked(true)
    toast.success(t('customer.bookingSuccessToast'))
  }

  if (booked && booking) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="font-display text-2xl font-bold text-off-white">{t('customer.bookingSuccess')}</h2>
          <p className="text-muted mt-2">{t('customer.bookingSuccessDesc')}</p>
        </motion.div>
        <Card className="p-5">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{t('customer.bookingIdLabel')}</span>
              <span className="text-off-white font-mono">#{booking.id.split('-')[1]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('customer.branch')}</span>
              <span className="text-off-white">{selected.branch?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('customer.services')}</span>
              <span className="text-off-white text-right">{selected.services.map(s => s.name).join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('customer.barber')}</span>
              <span className="text-off-white">{selected.barber?.name || t('customer.anyAvailable')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('customer.date')}</span>
              <span className="text-off-white">{formatDate(selected.date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t('customer.time')}</span>
              <span className="text-off-white">{selected.time}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-dark-border pt-2">
              <span className="text-muted">{t('customer.estimatedCost')}</span>
              <span className="text-gold">{formatRupiah(totalPrice)}</span>
            </div>
          </div>
        </Card>
        <Button fullWidth onClick={() => { setBooked(false); setStep(0); setSelected({ branch: null, services: [], barber: null, date: null, time: null }) }}>
          {t('customer.bookAnother')}
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('customer.createBooking')}</h1>
        <p className="text-muted text-sm mt-1">{t('customer.bookingSubtitle')}</p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-2 flex-shrink-0 ${i <= step ? 'text-gold' : 'text-muted'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${i < step ? 'bg-gold border-gold text-dark' : i === step ? 'border-gold text-gold' : 'border-dark-border text-muted'}`}>
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className="text-xs font-medium hidden md:block">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px min-w-4 ${i < step ? 'bg-gold' : 'bg-dark-border'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

          {/* Step 0: Branch */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableBranches.map(branch => (
                <button key={branch.id} onClick={() => { setSelected(s => ({ ...s, branch })); setStep(1) }}
                  className={`p-5 rounded-2xl border text-left transition-all ${selected.branch?.id === branch.id ? 'border-gold bg-gold/5' : 'border-dark-border bg-dark-card hover:border-gold/30'}`}
                >
                  <h3 className="font-semibold text-off-white text-lg">{branch.name}</h3>
                  <div className="flex items-start gap-2 mt-2">
                    <MapPin className="w-4 h-4 text-muted flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-muted">{branch.address}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4 text-muted" />
                    <p className="text-sm text-muted">{branch.openTime} – {branch.closeTime}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Step 1: Services */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                {branchServices.map(svc => {
                  const isSelected = selected.services.find(s => s.id === svc.id)
                  return (
                    <button key={svc.id} onClick={() => toggleService(svc)}
                      className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${isSelected ? 'border-gold bg-gold/5' : 'border-dark-border bg-dark-card hover:border-gold/30'}`}
                    >
                      <span className="text-2xl">{svc.icon}</span>
                      <div className="flex-1">
                        <p className="font-medium text-off-white">{svc.name}</p>
                        <p className="text-xs text-muted">{svc.duration} {t('customer.minutes')}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gold">{formatRupiah(svc.price)}</p>
                        {isSelected && <Check className="w-4 h-4 text-gold ml-auto mt-1" />}
                      </div>
                    </button>
                  )
                })}
              </div>
              {selected.services.length > 0 && (
                <div className="p-3 bg-gold/10 border border-gold/20 rounded-xl flex justify-between text-sm">
                  <span className="text-muted">{t('customer.servicesSelectedSummary', { count: selected.services.length, minutes: totalDuration })}</span>
                  <span className="text-gold font-semibold">{formatRupiah(totalPrice)}</span>
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" fullWidth onClick={() => setStep(0)}>{t('customer.back')}</Button>
                <Button fullWidth disabled={selected.services.length === 0} onClick={() => setStep(2)}>{t('customer.continue')}</Button>
              </div>
            </div>
          )}

          {/* Step 2: Barber */}
          {step === 2 && (
            <div className="space-y-4">
              <button
                onClick={() => { setSelected(s => ({ ...s, barber: null })); setStep(3) }}
                className="w-full p-4 rounded-xl border border-dashed border-dark-border text-muted hover:border-gold/30 transition-all text-sm"
              >
                {t('customer.anyAvailable')}
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {branchBarbers.map(barber => (
                  <button key={barber.id} onClick={() => { setSelected(s => ({ ...s, barber })); setStep(3) }}
                    className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${selected.barber?.id === barber.id ? 'border-gold bg-gold/5' : 'border-dark-border bg-dark-card hover:border-gold/30'}`}
                  >
                    <Avatar src={barber.photo} name={barber.name} size="lg" />
                    <div>
                      <p className="font-semibold text-off-white">{barber.name}</p>
                      {barber.rating && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="w-3.5 h-3.5 text-gold fill-gold" />
                          <span className="text-xs text-gold">{barber.rating}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {barber.specializations?.slice(0, 2).map(s => (
                          <span key={s} className="px-1.5 py-0.5 bg-gold/10 text-gold text-xs rounded">{s}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <Button variant="outline" fullWidth onClick={() => setStep(1)}>{t('customer.back')}</Button>
            </div>
          )}

          {/* Step 3: Date & Time */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted mb-2">{t('customer.pickDate')}</h3>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {nextDays.map(day => (
                    <button key={day.toISOString()} onClick={() => setSelected(s => ({ ...s, date: day, time: null }))}
                      className={`flex-shrink-0 px-4 py-3 rounded-xl text-center transition-all ${selected.date?.toDateString() === day.toDateString() ? 'bg-gold text-dark' : 'bg-dark-card border border-dark-border text-off-white hover:border-gold/30'}`}
                    >
                      <p className="text-xs font-medium">{format(day, 'EEE', { locale: idLocale })}</p>
                      <p className="text-lg font-bold">{format(day, 'd')}</p>
                      <p className="text-xs">{format(day, 'MMM', { locale: idLocale })}</p>
                    </button>
                  ))}
                </div>
              </div>
              {selected.date && (
                <div>
                  <h3 className="text-sm font-medium text-muted mb-2">{t('customer.pickTime')}</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {TIME_SLOTS.map(time => (
                      <button key={time} onClick={() => setSelected(s => ({ ...s, time }))}
                        className={`py-2.5 rounded-xl text-sm font-medium transition-all ${selected.time === time ? 'bg-gold text-dark' : 'bg-dark-card border border-dark-border text-off-white hover:border-gold/30'}`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" fullWidth onClick={() => setStep(2)}>{t('customer.back')}</Button>
                <Button fullWidth disabled={!selected.date || !selected.time} onClick={() => setStep(4)}>{t('customer.continue')}</Button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="space-y-4">
              <Card className="p-5">
                <h3 className="font-semibold text-off-white mb-4">{t('customer.bookingSummary')}</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">{t('customer.branch')}</span>
                    <span className="text-off-white">{selected.branch?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t('customer.services')}</span>
                    <span className="text-off-white text-right">{selected.services.map(s => s.name).join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t('customer.barber')}</span>
                    <span className="text-off-white">{selected.barber?.name || t('customer.available')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t('customer.date')}</span>
                    <span className="text-off-white">{formatDate(selected.date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t('customer.time')}</span>
                    <span className="text-off-white">{selected.time}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">{t('customer.duration')}</span>
                    <span className="text-off-white">~{totalDuration} {t('customer.minutes')}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-dark-border pt-3">
                    <span className="text-off-white">{t('customer.totalEstimate')}</span>
                    <span className="text-gold">{formatRupiah(totalPrice)}</span>
                  </div>
                </div>
              </Card>
              <div className="flex gap-3">
                <Button variant="outline" fullWidth onClick={() => setStep(3)}>{t('customer.back')}</Button>
                <Button fullWidth onClick={handleConfirm}>{t('customer.confirmBooking')}</Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

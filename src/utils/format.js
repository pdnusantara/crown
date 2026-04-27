import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

export const formatRupiah = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

export const formatDate = (dateStr) => {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    return format(date, 'd MMM yyyy', { locale: idLocale })
  } catch {
    return dateStr
  }
}

export const formatDateTime = (dateStr) => {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    return format(date, 'd MMM yyyy, HH:mm', { locale: idLocale })
  } catch {
    return dateStr
  }
}

export const formatTime = (dateStr) => {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    return format(date, 'HH:mm')
  } catch {
    return dateStr
  }
}

export const timeAgo = (dateStr) => {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    return formatDistanceToNow(date, { addSuffix: true, locale: idLocale })
  } catch {
    return dateStr
  }
}

export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ')
}

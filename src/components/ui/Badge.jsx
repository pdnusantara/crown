import React from 'react'

const variants = {
  success: 'bg-green-500/15 text-green-400 border border-green-500/20',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/20',
  info: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  gold: 'bg-gold/15 text-gold border border-gold/20',
  muted: 'bg-dark-surface text-muted border border-dark-border',
  purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/20',
}

export const Badge = ({ children, variant = 'muted', className = '', dot = false }) => (
  <span className={`
    inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
    ${variants[variant] || variants.muted}
    ${className}
  `}>
    {dot && (
      <span className={`w-1.5 h-1.5 rounded-full ${
        variant === 'success' ? 'bg-green-400' :
        variant === 'warning' ? 'bg-amber-400' :
        variant === 'danger' ? 'bg-red-400' :
        variant === 'info' ? 'bg-blue-400' :
        variant === 'gold' ? 'bg-gold' : 'bg-muted'
      }`} />
    )}
    {children}
  </span>
)

export const getSegmentBadge = (segment) => {
  const map = {
    VIP: 'gold',
    Regular: 'info',
    New: 'success',
    Inactive: 'muted',
  }
  return map[segment] || 'muted'
}

export const getStatusBadge = (status) => {
  const map = {
    active: 'success',
    inactive: 'muted',
    suspended: 'danger',
    pending: 'warning',
    confirmed: 'success',
    cancelled: 'danger',
    completed: 'success',
    waiting: 'warning',
    'in-progress': 'info',
    done: 'success',
    paid: 'gold',
    cash: 'success',
    transfer: 'info',
    qris: 'purple',
  }
  return map[status?.toLowerCase()] || 'muted'
}

export default Badge

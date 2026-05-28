import React, { useState } from 'react'

const sizes = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-20 h-20 text-2xl',
}

const getInitials = (name = '') => {
  const trimmed = String(name || '').trim()
  if (!trimmed) return '?'
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || '?'
}

const COLORS = [
  'from-amber-500 to-orange-500',
  'from-blue-500 to-cyan-500',
  'from-violet-500 to-purple-500',
  'from-green-500 to-emerald-500',
  'from-pink-500 to-rose-500',
  'from-brand to-brand-light',
]

const getColor = (name = '') => {
  const trimmed = String(name || '').trim()
  if (!trimmed) return COLORS[5]
  const index = trimmed.charCodeAt(0) % COLORS.length
  return COLORS[index] || COLORS[5]
}

export const Avatar = ({ src, name, size = 'md', className = '', ring = false }) => {
  const [imgError, setImgError] = useState(false)

  return (
    <div className={`
      relative flex-shrink-0 rounded-full overflow-hidden
      ${sizes[size] || sizes.md}
      ${ring ? 'ring-2 ring-brand/50 ring-offset-2 ring-offset-dark' : ''}
      ${className}
    `}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`w-full h-full flex items-center justify-center font-semibold text-white bg-gradient-to-br ${getColor(name)}`}>
          {getInitials(name)}
        </div>
      )}
    </div>
  )
}

export default Avatar

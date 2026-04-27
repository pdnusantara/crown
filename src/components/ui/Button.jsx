import React from 'react'
import { Loader2 } from 'lucide-react'

const variants = {
  primary: 'bg-gold text-dark font-semibold hover:bg-gold-light active:bg-gold-dark shadow-gold hover:shadow-gold-lg',
  secondary: 'border border-gold/40 text-gold hover:bg-gold/10 hover:border-gold',
  ghost: 'text-muted hover:text-off-white hover:bg-dark-card',
  danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
  success: 'bg-green-600 text-white hover:bg-green-500',
  outline: 'border border-dark-border text-off-white hover:border-gold/40 hover:text-gold',
}

const sizes = {
  xs: 'px-2.5 py-1 text-xs rounded-md',
  sm: 'px-3.5 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
  xl: 'px-8 py-4 text-base rounded-2xl',
}

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  fullWidth = false,
  ...props
}) => {
  const isDisabled = disabled || loading

  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2
        font-body font-medium
        transition-all duration-200
        cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant] || variants.primary}
        ${sizes[size] || sizes.md}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {!loading && Icon && iconPosition === 'left' && <Icon className="w-4 h-4" />}
      {children}
      {!loading && Icon && iconPosition === 'right' && <Icon className="w-4 h-4" />}
    </button>
  )
}

export default Button

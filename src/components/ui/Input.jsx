import React, { forwardRef } from 'react'

export const Input = forwardRef(({
  label,
  error,
  hint,
  icon: Icon,
  iconRight: IconRight,
  className = '',
  containerClassName = '',
  fullWidth = true,
  ...props
}, ref) => {
  return (
    <div className={`${fullWidth ? 'w-full' : ''} ${containerClassName}`}>
      {label && (
        <label className="block text-sm font-medium text-muted mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Icon className="w-4 h-4 text-muted" />
          </div>
        )}
        <input
          ref={ref}
          className={`
            w-full bg-dark-surface border text-off-white placeholder-muted
            rounded-xl px-4 py-2.5 text-sm
            transition-all duration-200
            outline-none
            ${Icon ? 'pl-10' : ''}
            ${IconRight ? 'pr-10' : ''}
            ${error
              ? 'border-red-500/60 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
              : 'border-dark-border focus:border-gold/60 focus:ring-2 focus:ring-gold/15'
            }
            ${className}
          `}
          {...props}
        />
        {IconRight && (
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
            <IconRight className="w-4 h-4 text-muted" />
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
})

Input.displayName = 'Input'

export const Textarea = forwardRef(({ label, error, className = '', ...props }, ref) => (
  <div className="w-full">
    {label && <label className="block text-sm font-medium text-muted mb-1.5">{label}</label>}
    <textarea
      ref={ref}
      className={`
        w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted
        rounded-xl px-4 py-2.5 text-sm resize-none
        transition-all duration-200 outline-none
        focus:border-gold/60 focus:ring-2 focus:ring-gold/15
        ${error ? 'border-red-500/60' : ''}
        ${className}
      `}
      {...props}
    />
    {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
  </div>
))

Textarea.displayName = 'Textarea'

export default Input

import React, { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'

export const Select = forwardRef(({ label, error, options = [], className = '', placeholder = 'Pilih...', ...props }, ref) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-medium text-muted mb-1.5">{label}</label>
    )}
    <div className="relative">
      <select
        ref={ref}
        className={`
          w-full appearance-none
          bg-dark-surface border text-off-white
          rounded-xl px-4 py-2.5 pr-10 text-sm
          transition-all duration-200 outline-none cursor-pointer
          ${error
            ? 'border-red-500/60 focus:border-red-500'
            : 'border-dark-border focus:border-gold/60 focus:ring-2 focus:ring-gold/15'
          }
          ${className}
        `}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-dark-surface">
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
    </div>
    {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
  </div>
))

Select.displayName = 'Select'
export default Select

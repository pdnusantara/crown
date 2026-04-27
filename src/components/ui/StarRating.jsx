import { Star } from 'lucide-react'

export function StarRating({ value = 0, onChange, readonly = false, size = 20 }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={`transition-all ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
        >
          <Star
            size={size}
            className={star <= value ? 'text-gold fill-gold' : 'text-dark-border'}
          />
        </button>
      ))}
    </div>
  )
}

export default StarRating

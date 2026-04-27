import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useUrlState(key, defaultValue) {
  const [searchParams, setSearchParams] = useSearchParams()

  const value = searchParams.get(key) ?? defaultValue

  const setValue = useCallback((newValue) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (newValue === defaultValue || newValue === null || newValue === '') {
        next.delete(key)
      } else {
        next.set(key, String(newValue))
      }
      return next
    }, { replace: true })
  }, [key, defaultValue, setSearchParams])

  return [value, setValue]
}

import { useCallback, useEffect, useRef } from 'react'

export function useScrollClass(className: string, delay = 800) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      el.classList.add(className)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => el.classList.remove(className), delay)
    },
    [className, delay],
  )
}

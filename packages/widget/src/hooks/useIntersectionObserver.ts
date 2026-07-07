import { useEffect, useRef } from 'react'

interface UseIntersectionObserverProps {
  triggerRef: React.RefObject<Element | null>
  callback: (entry: IntersectionObserverEntry) => void
  root?: React.RefObject<Element | null>
  rootMargin?: string
  threshold?: number | number[]
}

export function useIntersectionObserver({
  triggerRef,
  callback,
  root,
  rootMargin,
  threshold,
}: UseIntersectionObserverProps): void {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    const target = triggerRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) callbackRef.current(entry)
      },
      {
        root: root?.current ?? null,
        ...(rootMargin !== undefined && { rootMargin }),
        ...(threshold !== undefined && { threshold }),
      },
    )

    observer.observe(target)

    return () => observer.disconnect()
  }, [triggerRef, root, rootMargin, threshold])
}

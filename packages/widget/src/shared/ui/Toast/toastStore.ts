import { useSyncExternalStore } from 'react'

export interface ToastItem {
  id: number
  message: string
  /** действие по клику; плашка без него не кликабельна и остаётся неинтерактивной */
  onClick?: () => void
}

type Listener = () => void

const listeners = new Set<Listener>()

let queue: ToastItem[] = []
let nextId = 1

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Ставит тост в очередь; показывается по одному, следующий ждёт ухода предыдущего.
 *
 * Стор живёт отдельно от `chatStore`: тост — это UI-инфраструктура, которую зовут и из
 * контроллера, и из компонентов, а состоянию чата он ничего не добавляет.
 */
export function showToast(message: string, onClick?: () => void): void {
  // повтор того же текста, пока он ещё висит, ничего не сообщает: один /sync может отклонить
  // сразу несколько файлов, и очередь из одинаковых плашек была бы просто задержкой
  if (queue.some((toast) => toast.message === message)) return

  queue = [...queue, { id: nextId++, message, ...(onClick ? { onClick } : {}) }]
  notify()
}

export function dismissToast(id: number): void {
  const next = queue.filter((toast) => toast.id !== id)
  if (next.length === queue.length) return

  queue = next
  notify()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ToastItem[] {
  return queue
}

export function useToastQueue(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

import { useSyncExternalStore } from 'react'

export type ToastTone = 'error' | 'success'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  /** действие по клику; плашка без него не кликабельна и остаётся неинтерактивной */
  onClick?: () => void
}

/**
 * Всё, кроме текста, — именованные поля: тон нужен редко, и позиционным третьим аргументом
 * он заставлял бы писать `showToast(text, undefined, 'success')` на каждом вызове без клика.
 */
export interface ToastOptions {
  /** по умолчанию подтверждение действия; плашка об ошибке помечается явно */
  tone?: ToastTone
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
export function showToast(message: string, options: ToastOptions = {}): void {
  // повтор того же текста, пока он ещё висит, ничего не сообщает: один /sync может отклонить
  // сразу несколько файлов, и очередь из одинаковых плашек была бы просто задержкой
  if (queue.some((toast) => toast.message === message)) return

  const { tone = 'success', onClick } = options

  queue = [...queue, { id: nextId++, message, tone, ...(onClick ? { onClick } : {}) }]
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

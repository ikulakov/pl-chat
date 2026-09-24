import type { SendStatus } from '@/domain/timeline'
import type { ReactNode } from 'react'

/**
 * Место сообщения в серии подряд от одного отправителя. Считает лента по соседям, а ряд по нему
 * решает и форму пузыря, и начало группы.
 */
export type MessageGroupPosition = 'single' | 'first' | 'middle' | 'last'

/** Статус доставки своего сообщения. */
export interface Delivery {
  sendStatus: SendStatus
  isRead: boolean
}

/** Время сообщения и статус доставки; статус есть только у своего сообщения, у чужого — null. */
export interface MessageMetaData {
  ts: number
  delivery: Delivery | null
}

/**
 * Общие пропы оболочек `BubbleLayout` и `UnboxedLayout`. Ряд отдаёт им одно и то же, а куда
 * встанут время и реакции, каждая оболочка решает сама.
 */
export interface LayoutProps {
  isOwn: boolean
  /** null — времени нет: пока вложение льётся или заливка сорвалась, о нём говорит само вложение. */
  meta: MessageMetaData | null
  reply?: ReactNode
  reactions?: ReactNode
}

// Публичный API слайса: снаружи берут только строку ленты и тип её позиции в группе.
// Всё остальное (пузырь, действия, медиа-хуки, размеры превью) — внутреннее устройство ряда.
export { MessageRow } from './MessageRow'
export type { BubblePosition } from './bubble/MessageBubble'

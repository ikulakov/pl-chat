// Публичный API слайса: снаружи берут только строку ленты и тип её позиции в группе.
// Всё остальное (пузырь, действия, медиа-хуки, размеры превью) — внутреннее устройство ряда.
export { MessageRow } from './ui/MessageRow'
export type { BubblePosition } from './ui/bubble/MessageBubble'

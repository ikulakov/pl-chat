import { cn } from '../../shared/utils/cn'
import styles from './Silhouette.module.css'

interface Props {
  /** data:-URL заглушки из каталога (поле `p`). */
  src: string
  /** Класс с размерами и позиционированием — своя геометрия у ленты и у сетки пикера. */
  className?: string | undefined
}

/**
 * Заглушка на время загрузки эмодзи или стикера.
 *
 * Сервер отдаёт `p` как **luminance-маску**: непрозрачный PNG, белая фигура на чёрном фоне,
 * альфы в нём нет. Показывать его как `<img>` нельзя — на белом фоне получается чёрный
 * квадрат. Поэтому маска уходит в `mask-image`, а видимый цвет даёт заливка: фигура
 * превращается в нейтральное серое пятно и одинаково работает в любой теме.
 */
export function Silhouette({ src, className }: Props) {
  return (
    <span
      data-silhouette
      className={cn(styles.silhouette, className)}
      // URL приезжает по сети — в CSS его не вписать, только инлайном.
      style={{ '--silhouette': `url("${src}")` } as React.CSSProperties}
      aria-hidden
    />
  )
}

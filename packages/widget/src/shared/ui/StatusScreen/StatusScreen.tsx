import type { ButtonHTMLAttributes, HTMLAttributes, ImgHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../utils/cn'
import styles from './StatusScreen.module.css'

export interface StatusScreenProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'title'
> {
  ref?: Ref<HTMLDivElement>
  /** Иконка, иллюстрация или индикатор загрузки над текстом. */
  media?: ReactNode
  /** Основной заголовок состояния. Рендерится семантическим h2. */
  title?: ReactNode
  /** Дополнительное пояснение под заголовком. */
  description?: ReactNode
  /** Одна или несколько кнопок действия. */
  actions?: ReactNode
  /** Второстепенный контент в нижней части экрана. */
  footer?: ReactNode
}

function hasSlot(slot: ReactNode): boolean {
  return slot !== null && slot !== undefined
}

export function StatusScreen({
  ref,
  media,
  title,
  description,
  actions,
  footer,
  className,
  ...rest
}: StatusScreenProps) {
  const hasMedia = hasSlot(media)
  const hasTitle = hasSlot(title)
  const hasDescription = hasSlot(description)
  const hasActions = hasSlot(actions)
  const hasFooter = hasSlot(footer)
  const hasText = hasTitle || hasDescription

  return (
    <div
      ref={ref}
      className={cn(styles.screen, hasText && styles.withText, className)}
      {...rest}
    >
      <div className={styles.main}>
        {hasMedia && <div className={styles.media}>{media}</div>}
        {hasText && (
          <div className={styles.textBlock}>
            {hasTitle && <h2 className={styles.title}>{title}</h2>}
            {hasDescription && <div className={styles.description}>{description}</div>}
          </div>
        )}
        {hasActions && <div className={styles.actions}>{actions}</div>}
      </div>
      {hasFooter && <div className={styles.footer}>{footer}</div>}
    </div>
  )
}

export interface StatusScreenImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  ref?: Ref<HTMLImageElement>
}

export function StatusScreenImage({
  ref,
  alt = '',
  decoding = 'async',
  className,
  ...rest
}: StatusScreenImageProps) {
  return (
    <img
      ref={ref}
      alt={alt}
      decoding={decoding}
      className={cn(styles.image, className)}
      {...rest}
    />
  )
}

export interface StatusScreenActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
}

export function StatusScreenAction({
  ref,
  type = 'button',
  className,
  ...rest
}: StatusScreenActionProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(styles.actionButton, className)}
      {...rest}
    />
  )
}

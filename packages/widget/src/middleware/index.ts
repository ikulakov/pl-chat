import type { DispatchMiddleware } from '../store/store'
import { mediaRejectedToast } from './mediaRejectedToast'

/**
 * Все перехватчики действий стора. Новый обработчик — отдельный файл в этой папке и строка здесь.
 *
 * Порядок значим: первый в списке видит действие раньше остальных, а результат — позже.
 */
export const dispatchMiddleware: DispatchMiddleware[] = [mediaRejectedToast]

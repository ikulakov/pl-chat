import type { AnimationItem } from 'lottie-web'

/**
 * Плеер с явным размером.
 *
 * `resize` есть в рантайме lottie-web, но потерян в его `.d.ts` — без него плеер берёт размер
 * из контейнера, а у canvas вне документа он нулевой, и кадр выходит пустым.
 */
export type SizedAnimation = AnimationItem & { resize: (width: number, height: number) => void }

/**
 * Размер растеризации первого кадра. 64 хватает и строчному эмодзи, и среднему (48 CSS-пикселей
 * на 2× экране), 128 — «большому» из макета.
 */
export type EmojiBitmapSize = 64 | 128

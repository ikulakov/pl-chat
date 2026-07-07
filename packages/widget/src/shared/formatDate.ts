import { t } from '../i18n'

const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function formatDateLabel(ts: number): string {
  const day = startOfDay(ts)
  const today = startOfDay(Date.now())

  if (day === today) return t('date.today')
  if (day === today - DAY_MS) return t('date.yesterday')

  const date = new Date(ts)
  const isSameYear = date.getFullYear() === new Date(today).getFullYear()

  return date.toLocaleDateString(
    'ru',
    isSameYear
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' },
  )
}

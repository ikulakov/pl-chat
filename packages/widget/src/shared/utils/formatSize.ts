import { t } from '../../i18n'

export function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} ${t('size.b')}`
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} ${t('size.kb')}`
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} ${t('size.mb')}`
}

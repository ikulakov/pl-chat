export function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} КБ`
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} МБ`
}

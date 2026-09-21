/** Расширение из имени файла, в нижнем регистре; без точки в имени — пустая строка. */
export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

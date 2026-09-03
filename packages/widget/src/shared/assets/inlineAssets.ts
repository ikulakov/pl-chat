/*
 * Ассеты, которые обязаны ехать внутри JS-бандла, а не отдельными файлами.
 *
 * `?inline` подставляет на сборке не путь к файлу, а сами байты в виде строки
 * `data:image/png;base64,...`. Экран ошибки показывается ровно тогда, когда сети нет, —
 * запрос за отдельным файлом на нём обречён, поэтому картинка должна ехать внутри бандла.
 */
import errorIllustration from './error-illustration.png?inline'

export const ERROR_ILLUSTRATION = errorIllustration

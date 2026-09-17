// Единая точка входа для wire-типов: потребители пишут `import type * as Matrix from '…/wire'`
// и читают форму с провода как `Matrix.ClientEvent` / `Matrix.SyncResponse`. Один префикс на
// весь протокол — иначе файл, которому нужны и события, и конверты, получил бы два имени.
// Здесь только типовые файлы. `consts.ts` (значения) и `guards.ts` (функции) импортируются
// напрямую: `export type *` их не пропустит, а тянуть рантайм через баррель незачем.
export type * from './dto'
export type * from './emoji'
export type * from './types'

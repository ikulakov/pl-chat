// Соседние тултипы делят одно окно задержки: когда курсор переходит с одной обрезанной
// кнопки на другую, второй тултип показывается сразу — паузу перед первым пользователь уже
// «отстоял». Состояние модульное, а не в контексте: тултипы не связаны общим поддеревом, и
// провайдер ради пары значений был бы лишней машинерией.
const GROUP_WINDOW_MS = 300

// закрытие открытого сейчас тултипа. Группа действует, пока он открыт, а не только после
// закрытия: при переходе на соседа прежний ещё держится на задержке скрытия
let closeOpenTooltip: (() => void) | null = null
let lastClosedAt = 0

export function markTooltipOpened(close: () => void): void {
  // на экране один тултип: новый сразу закрывает прежний, не дожидаясь его задержки скрытия
  if (closeOpenTooltip !== close) closeOpenTooltip?.()
  closeOpenTooltip = close
}

export function markTooltipClosed(): void {
  closeOpenTooltip = null
  lastClosedAt = Date.now()
}

export function isInDelayGroup(): boolean {
  return closeOpenTooltip !== null || Date.now() - lastClosedAt < GROUP_WINDOW_MS
}

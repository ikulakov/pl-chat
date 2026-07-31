// компилятор ловит забытый case в switch по discriminated union — если после добавления
// нового варианта юниона забыть обработать его в switch, TS откажется компилировать
// вызов assertNever(action), а не молча уйдёт в default
export function assertNever(value: never): never {
  throw new Error(`Необработанный вариант: ${JSON.stringify(value)}`)
}

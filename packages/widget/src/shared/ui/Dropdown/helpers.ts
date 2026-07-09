// В shadow-embed (виджет без iframe) getRootNode() возвращает ShadowRoot: портал и
// activeElement должны идти от корня дерева, иначе меню теряет тему (переменные с :host не
// наследуются в document.body), а activeElement указывает на shadow-хост, а не на пункт.
export function resolveRoot(node: Node | null): Document | ShadowRoot {
  const root = node?.getRootNode()
  return root instanceof ShadowRoot ? root : document
}

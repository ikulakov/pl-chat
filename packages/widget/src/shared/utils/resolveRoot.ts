// ShadowRoot в shadow-embed, иначе document
export function resolveRoot(node: Node | null): Document | ShadowRoot {
  const root = node?.getRootNode()
  return root instanceof ShadowRoot ? root : document
}

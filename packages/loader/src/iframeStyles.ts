// Inline-стили iframe-бокса на host-странице.
// Только loader владеет размером/позицией iframe,
// поэтому раскладка (docked/fullscreen/collapsed) задаётся отсюда, а не из виджета.

export type Style = Partial<CSSStyleDeclaration>

export const BASE_STYLE: Style = {
  position: 'fixed',
  border: '0',
  zIndex: '2147483000',
  colorScheme: 'normal',
}

export const TRANSITION_STYLE: Style = {
  transition: 'opacity 0.18s ease, transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
}

export const COLLAPSED_STYLE: Style = {
  width: '0',
  height: '0',
  opacity: '0',
  pointerEvents: 'none',
  inset: 'auto 0 0 auto',
}

export const DOCKED_STYLE: Style = {
  width: '444px',
  height: '656px',
  borderRadius: '20px',
  boxShadow: '0px 0px 56px 0px rgba(0,0,0,0.1)',
  inset: 'auto 17px 80px auto',
}

// Fullscreen: height:100dvh — единственный авторитет высоты
// (не inset:0, иначе bottom:0 конкурировал бы с height).
export const FULLSCREEN_STYLE: Style = {
  top: '0',
  left: '0',
  right: '0',
  bottom: 'auto',
  width: '100%',
  height: '100dvh',
  borderRadius: '0px',
  boxShadow: 'none',
}

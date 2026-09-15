import type { Ref } from 'react'

export interface DropdownTriggerProps {
  ref: Ref<HTMLButtonElement>
  onClick: () => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'data-popup-open': '' | undefined
  'data-backdrop': '' | undefined
}

export interface DropdownOpenOptions {
  /** Поставить слой относительно этого элемента, а не триггера. */
  anchor?: HTMLElement
  /** Размыть всё вокруг слоя. Кто должен остаться чётким, поднимается над подложкой сам. */
  backdrop?: boolean
}

export interface DropdownCloseOptions {
  /**
   * Вернуть фокус на триггер (по умолчанию да). Нет — когда фокус уже у цели (внешний клик,
   * прокрутка) или пункт выбран мышью: `:focus-within` оставил бы кнопку «…» видимой.
   */
  returnFocus?: boolean
}

/** Открытие не с триггера — например, долгим нажатием на сообщение. При недоступном триггере — no-op. */
export interface DropdownHandle {
  open: (options?: DropdownOpenOptions) => void
}

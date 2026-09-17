import type { Ref } from 'react'

export interface DropdownTriggerProps {
  ref: Ref<HTMLButtonElement>
  disabled: boolean
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
   * прокрутка). После выбора пункта фокус возвращается всегда, каким бы указателем его ни выбрали.
   */
  returnFocus?: boolean
}

/** Открытие не с триггера — например, долгим нажатием на сообщение. При `disabled` — no-op. */
export interface DropdownHandle {
  open: (options?: DropdownOpenOptions) => void
}

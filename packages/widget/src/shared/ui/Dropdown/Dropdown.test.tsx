/* eslint-disable i18next/no-literal-string -- тестовые метки пунктов, не UI-текст */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown } from './Dropdown'
import { DropdownItem } from './DropdownItem'
import type { DropdownHandle, DropdownTriggerProps } from './types'

function renderDropdown(above?: React.ReactNode) {
  return render(
    <Dropdown
      above={above}
      trigger={(props) => (
        <button
          {...props}
          type="button"
        >
          menu
        </button>
      )}
    >
      <DropdownItem onSelect={() => {}}>one</DropdownItem>
      <DropdownItem onSelect={() => {}}>two</DropdownItem>
    </Dropdown>,
  )
}

describe('Dropdown a11y', () => {
  it('reflects open state on the trigger via aria-expanded/aria-haspopup', () => {
    renderDropdown()
    const trigger = screen.getByRole('button', { name: 'menu' })

    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('moves focus to the first item on open', () => {
    renderDropdown()

    fireEvent.click(screen.getByRole('button', { name: 'menu' }))

    expect(screen.getByRole('menuitem', { name: 'one' })).toHaveFocus()
  })

  it('returns focus to the trigger when closed via Escape', () => {
    renderDropdown()
    const trigger = screen.getByRole('button', { name: 'menu' })
    fireEvent.click(trigger)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('does NOT steal focus back to the trigger when closed by an outside click', () => {
    renderDropdown()
    const trigger = screen.getByRole('button', { name: 'menu' })
    fireEvent.click(trigger)

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).not.toHaveFocus()
  })

  it('closes itself when an item is selected (DropdownItem owns close)', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: 'menu' }))

    fireEvent.click(screen.getByRole('menuitem', { name: 'one' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('navigates items with ArrowDown/ArrowUp and wraps around', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: 'menu' }))
    const [one, two] = screen.getAllByRole('menuitem') as [HTMLElement, HTMLElement]

    fireEvent.keyDown(one, { key: 'ArrowDown' })
    expect(two).toHaveFocus()

    // с последнего пункта ArrowDown уводит на первый (кольцо)
    fireEvent.keyDown(two, { key: 'ArrowDown' })
    expect(one).toHaveFocus()

    fireEvent.keyDown(one, { key: 'ArrowUp' })
    expect(two).toHaveFocus()
  })

  it('Home и End ведут на первый и последний пункт', () => {
    renderDropdown()
    fireEvent.click(screen.getByRole('button', { name: 'menu' }))
    const [one, two] = screen.getAllByRole('menuitem') as [HTMLElement, HTMLElement]

    fireEvent.keyDown(one, { key: 'End' })
    expect(two).toHaveFocus()

    fireEvent.keyDown(two, { key: 'Home' })
    expect(one).toHaveFocus()
  })

  it('прокрутка закрывает меню и не возвращает фокус на триггер', () => {
    renderDropdown()
    const trigger = screen.getByRole('button', { name: 'menu' })
    fireEvent.click(trigger)

    fireEvent.scroll(window)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).not.toHaveFocus()
  })

  // detail — число кликов: у мыши ≥ 1, у Enter/Space 0. Скринридер в режиме обзора шлёт клик
  // с detail ≥ 1, поэтому различать их нельзя: иначе его фокус падал бы в body.
  it.each([
    ['мышью', 1],
    ['с клавиатуры', 0],
  ])('выбор пункта %s возвращает фокус на триггер', (_, detail) => {
    renderDropdown()
    const trigger = screen.getByRole('button', { name: 'menu' })
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('menuitem', { name: 'one' }), { detail })

    expect(trigger).toHaveFocus()
  })

  it('клик мышью по надстройке не отнимает возврат фокуса у следующего Escape', () => {
    renderDropdown(<button type="button">react</button>)
    const trigger = screen.getByRole('button', { name: 'menu' })
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('button', { name: 'react' }), { detail: 1 })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger).toHaveFocus()
  })

  it('клик мышью мимо пунктов меню не отнимает возврат фокуса у следующего Escape', () => {
    renderDropdown()
    const trigger = screen.getByRole('button', { name: 'menu' })
    fireEvent.click(trigger)

    // отступ коробки меню: слой не закрывается, и решать судьбу фокуса этому клику нечего
    fireEvent.click(screen.getByRole('menu'), { detail: 1 })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(trigger).toHaveFocus()
  })

  it('рендерит надстройку above в том же слое, что и меню', () => {
    renderDropdown(<button type="button">react</button>)

    fireEvent.click(screen.getByRole('button', { name: 'menu' }))

    expect(screen.getByRole('button', { name: 'react' })).toBeInTheDocument()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('не считает клик по надстройке внешним — иначе он не долетел бы до её кнопки', () => {
    const onClick = vi.fn()
    renderDropdown(
      <button
        type="button"
        onClick={onClick}
      >
        react
      </button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'menu' }))
    const item = screen.getByRole('button', { name: 'react' })

    fireEvent.pointerDown(item)
    fireEvent.click(item)

    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('закрывает надстройку вместе с меню по Escape', () => {
    renderDropdown(<button type="button">react</button>)
    fireEvent.click(screen.getByRole('button', { name: 'menu' }))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('button', { name: 'react' })).not.toBeInTheDocument()
  })
})

describe('Dropdown — открытие снаружи с подложкой', () => {
  function renderWithHandle() {
    const handle = createRef<DropdownHandle>()
    render(
      <Dropdown
        ref={handle}
        trigger={(props) => (
          <button
            {...props}
            type="button"
          >
            menu
          </button>
        )}
      >
        <DropdownItem onSelect={() => {}}>one</DropdownItem>
      </Dropdown>,
    )
    return handle
  }

  it('подложка есть только у открытия снаружи, не у клика по триггеру', () => {
    const handle = renderWithHandle()

    fireEvent.click(screen.getByRole('button', { name: 'menu' }))
    expect(document.querySelector('[class*="backdrop"]')).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    act(() => handle.current?.open({ backdrop: true }))
    expect(document.querySelector('[class*="backdrop"]')).toBeInTheDocument()
  })

  // Закройся слой на pointerdown, подложка исчезла бы до отпускания пальца, и click
  // провалился бы в кнопку под ней (например, «Отправить» в композере).
  it('подложка закрывает слой своим click, а не pointerdown', () => {
    const handle = renderWithHandle()
    act(() => handle.current?.open({ backdrop: true }))
    const backdrop = document.querySelector('[class*="backdrop"]')
    if (!backdrop) throw new Error('backdrop not rendered')

    fireEvent.pointerDown(backdrop)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.click(backdrop)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // По этим атрибутам потребитель стилизует себя без своего состояния: ряд сообщения поднимается
  // над подложкой через :has(). Имена — как у Base UI (`data-popup-open` у Menu.Trigger).
  it('триггер отражает открытие атрибутами: data-popup-open всегда, data-backdrop — только с подложкой', () => {
    const handle = renderWithHandle()
    const trigger = screen.getByRole('button', { name: 'menu' })

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('data-popup-open')
    expect(trigger).not.toHaveAttribute('data-backdrop')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).not.toHaveAttribute('data-popup-open')

    act(() => handle.current?.open({ backdrop: true }))
    expect(trigger).toHaveAttribute('data-popup-open')
    expect(trigger).toHaveAttribute('data-backdrop')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).not.toHaveAttribute('data-popup-open')
    expect(trigger).not.toHaveAttribute('data-backdrop')
  })
})

describe('Dropdown — края контракта', () => {
  function trigger(props: DropdownTriggerProps) {
    return (
      <button
        {...props}
        type="button"
      >
        menu
      </button>
    )
  }

  it('повторный open() на открытом слое ничего не меняет: подложка не появляется', () => {
    const handle = createRef<DropdownHandle>()
    render(
      <Dropdown
        ref={handle}
        trigger={trigger}
      >
        <DropdownItem onSelect={() => {}}>one</DropdownItem>
      </Dropdown>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'menu' }))
    act(() => handle.current?.open({ backdrop: true }))

    expect(document.querySelector('[class*="backdrop"]')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'menu' })).not.toHaveAttribute('data-backdrop')
  })

  it('disabled: open() ничего не открывает, а триггер получает disabled', () => {
    const handle = createRef<DropdownHandle>()
    render(
      <Dropdown
        ref={handle}
        disabled
        trigger={trigger}
      >
        <DropdownItem onSelect={() => {}}>one</DropdownItem>
      </Dropdown>,
    )

    act(() => handle.current?.open({ backdrop: true }))

    expect(screen.getByRole('button', { name: 'menu' })).toBeDisabled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(document.querySelector('[class*="backdrop"]')).not.toBeInTheDocument()
  })

  it.each([
    ['null', null],
    ['false', false],
  ])('children = %s — пунктов нет, пустую коробку меню не рисуем', (_, children) => {
    render(
      <Dropdown
        trigger={trigger}
        above={<button type="button">react</button>}
      >
        {children}
      </Dropdown>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'menu' }))

    expect(screen.getByRole('button', { name: 'react' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // Событие из теневого дерева доходит до document с target, подменённым на хост: по нему
  // любое нажатие внутри меню выглядело бы внешним и закрывало слой раньше клика по пункту.
  it('в Shadow DOM нажатие на пункт не считается внешним', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const mount = document.createElement('div')
    host.attachShadow({ mode: 'open' }).append(mount)
    const onSelect = vi.fn()

    render(
      <Dropdown trigger={trigger}>
        <DropdownItem onSelect={onSelect}>one</DropdownItem>
      </Dropdown>,
      { container: mount },
    )

    fireEvent.click(within(mount).getByRole('button', { name: 'menu' }))
    const item = host.shadowRoot!.querySelector<HTMLElement>('[role="menuitem"]')!

    fireEvent.pointerDown(item)
    fireEvent.click(item)

    expect(onSelect).toHaveBeenCalledOnce()
    host.remove()
  })
})

/* eslint-disable i18next/no-literal-string -- тестовые метки пунктов, не UI-текст */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown } from './Dropdown'
import { DropdownItem } from './DropdownItem'

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

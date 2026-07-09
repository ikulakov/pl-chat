/* eslint-disable i18next/no-literal-string -- тестовые метки пунктов, не UI-текст */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dropdown } from './Dropdown'
import { DropdownItem } from './DropdownItem'

function renderDropdown() {
  return render(
    <Dropdown
      trigger={(props) => (
        <button
          {...props}
          type="button"
        >
          menu
        </button>
      )}
    >
      {({ close }) => (
        <>
          <DropdownItem onSelect={close}>one</DropdownItem>
          <DropdownItem onSelect={close}>two</DropdownItem>
        </>
      )}
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
})

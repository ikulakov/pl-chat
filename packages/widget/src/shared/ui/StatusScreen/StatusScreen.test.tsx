/* eslint-disable i18next/no-literal-string -- тестовые фикстуры API компонента */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusScreen, StatusScreenAction, StatusScreenImage } from './StatusScreen'

describe('StatusScreen', () => {
  it('renders named slots and forwards root attributes', () => {
    render(
      <StatusScreen
        aria-label="Connection state"
        className="custom-screen"
        media={<span>Media</span>}
        title="Connection lost"
        description="Try again later"
        actions={<StatusScreenAction>Retry</StatusScreenAction>}
        footer={<a href="/help">Help</a>}
      />,
    )

    const screenRoot = screen.getByLabelText('Connection state')
    expect(screenRoot).toHaveClass('custom-screen')
    expect(screen.getByRole('heading', { level: 2, name: 'Connection lost' })).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()
    expect(screen.getByText('Try again later')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('link', { name: 'Help' })).toBeInTheDocument()
  })
})

describe('StatusScreenImage', () => {
  it('is decorative by default and forwards image attributes', () => {
    const { container } = render(
      <StatusScreenImage
        src="/illustration.webp"
        width={275}
        height={188}
        className="custom-image"
      />,
    )

    const image = container.querySelector('img')
    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('width', '275')
    expect(image).toHaveAttribute('height', '188')
    expect(image).toHaveClass('custom-image')
  })
})

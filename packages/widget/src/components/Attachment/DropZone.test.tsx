import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DropZone } from './DropZone'

const pickFile = vi.fn()
vi.mock('./AttachmentContext', () => ({
  useAttachment: () => ({ pickFile }),
}))

function makeFile(name = 'doc.pdf'): File {
  return new File([new Uint8Array(1)], name, { type: 'application/pdf' })
}

// jsdom не строит настоящий DataTransfer — подкладываем минимум, который читает DropZone.
function fileDrag(file?: File) {
  return { dataTransfer: { types: ['Files'], files: file ? [file] : [] } }
}

function overlay(): HTMLElement {
  return screen.getByText('Поместите файл сюда').closest('[aria-hidden]') as HTMLElement
}

describe('DropZone', () => {
  afterEach(() => pickFile.mockReset())

  function renderZone() {
    const { container } = render(
      <DropZone>
        <div data-testid="content" />
      </DropZone>,
    )
    return container.firstChild as HTMLElement
  }

  it('показывает оверлей при заносе файла и прячет при уходе', () => {
    const root = renderZone()
    expect(overlay()).toHaveAttribute('aria-hidden', 'true')

    fireEvent.dragEnter(root, fileDrag())
    expect(overlay()).toHaveAttribute('aria-hidden', 'false')

    fireEvent.dragLeave(root, fileDrag())
    expect(overlay()).toHaveAttribute('aria-hidden', 'true')
  })

  it('бросок в оверлей грузит файл', () => {
    const root = renderZone()
    const file = makeFile()

    fireEvent.dragEnter(root, fileDrag(file))
    fireEvent.drop(overlay(), fileDrag(file))

    expect(pickFile).toHaveBeenCalledExactlyOnceWith(file)
    expect(overlay()).toHaveAttribute('aria-hidden', 'true')
  })

  it('бросок мимо оверлея (в ленту) отменяет — файл не берётся', () => {
    const root = renderZone()

    fireEvent.dragEnter(root, fileDrag(makeFile()))
    fireEvent.drop(root, fileDrag(makeFile()))

    expect(pickFile).not.toHaveBeenCalled()
    expect(overlay()).toHaveAttribute('aria-hidden', 'true')
  })
})

import { makeFile } from '@/shared/testUtils/matrixFixtures'
import { t } from '@/i18n'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AttachmentProvider } from './AttachmentProvider'
import { FilePickerButton } from './FilePickerButton'
import { AttachmentPreview } from './AttachmentPreview'
import { useAttachment } from '../AttachmentContext'

const sendFile = vi.fn().mockResolvedValue(undefined)

vi.mock<unknown>(import('@/hooks/useChatActions'), () => ({
  useChatActions: () => ({ sendFile }),
}))

function AttachmentControls() {
  const { pending, cancel } = useAttachment()
  return (
    <>
      <FilePickerButton />
      {pending && (
        <AttachmentPreview
          pending={pending}
          onCancel={cancel}
        />
      )}
    </>
  )
}

function renderAttachment() {
  const view = render(
    <AttachmentProvider>
      <AttachmentControls />
    </AttachmentProvider>,
  )
  const pickFile = (file: File) => {
    const input = view.container.querySelector('input[type=file]')!
    fireEvent.change(input, { target: { files: [file] } })
  }
  return { pickFile }
}

describe('Attachment — выбор и превью', () => {
  beforeEach(() => {
    sendFile.mockClear()
  })

  it('слишком большой файл показывает ошибку и допускает замену', () => {
    const { pickFile } = renderAttachment()
    pickFile(makeFile('big.pdf', 11 * 1024 * 1024))

    expect(screen.getByText(t('composer.upload.tooLarge'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('input.attachFile') })).toBeEnabled()
    expect(sendFile).not.toHaveBeenCalled()
  })

  it('валидный файл блокирует повторный выбор до отмены вложения', () => {
    const { pickFile } = renderAttachment()
    pickFile(makeFile('doc.pdf', 100))
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('input.attachFile') })).toBeDisabled()
    expect(sendFile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: t('composer.attach.cancel') }))
    expect(screen.queryByText('doc.pdf')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('input.attachFile') })).toBeEnabled()
  })
})

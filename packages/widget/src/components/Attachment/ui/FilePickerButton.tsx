import { useAttachment } from '../AttachmentContext'
import { t } from '@/i18n'
import { IconButton } from '@/shared/ui/IconButton'
import { AttachIcon } from '@/shared/ui/icons'
import { FILE_ACCEPT } from '@/shared/utils/fileValidation'
import { useRef } from 'react'

/**
 * Кнопка-скрепка вместе со скрытым file-input:
 * владеет ref, allowlist-расширениями и сбросом value
 */
export function FilePickerButton() {
  const { pending, pickFile } = useAttachment()
  const disabled = pending !== null && !pending.error
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // сброс, чтобы повторный выбор того же файла снова вызвал change
    e.target.value = ''
    if (file) pickFile(file)
  }

  return (
    <>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={t('input.attachFile')}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <AttachIcon />
      </IconButton>
      <input
        ref={inputRef}
        name="attachment"
        type="file"
        accept={FILE_ACCEPT}
        onChange={handleChange}
        hidden
      />
    </>
  )
}

import { useRef } from 'react'
import { t } from '../../i18n'
import { FILE_ACCEPT } from '../../shared/fileValidation'
import { IconButton } from '../../shared/ui/IconButton'
import { AttachIcon } from '../../shared/ui/icons'

interface Props {
  disabled: boolean
  onFileSelect: (file: File) => void
}

/**
 * Кнопка-скрепка вместе со скрытым file-input:
 * владеет ref, allowlist-расширениями и сбросом value
 */
export function FilePickerButton({ disabled, onFileSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // сброс, чтобы повторный выбор того же файла снова вызвал change
    e.target.value = ''
    if (file) onFileSelect(file)
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

import type { PropsWithChildren } from 'react'
import { AttachmentContext } from './AttachmentContext'
import { DropZone } from './DropZone'
import { useAttachmentState } from './useAttachmentState'

interface Props extends PropsWithChildren {
  dropZoneEnabled?: boolean
}

/**
 * Единый стейт для вложений (useAttachmentState)
 * Composer, и DropZone берут состояние через useAttachment()
 */
export function AttachmentProvider({ children, dropZoneEnabled = true }: Props) {
  const attachment = useAttachmentState()

  return (
    <AttachmentContext value={attachment}>
      {dropZoneEnabled ? <DropZone>{children}</DropZone> : children}
    </AttachmentContext>
  )
}

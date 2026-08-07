import { createContext, use } from 'react'
import type { FileAttachment } from './useAttachmentState'

export const AttachmentContext = createContext<FileAttachment | null>(null)

export function useAttachment(): FileAttachment {
  const ctx = use(AttachmentContext)
  if (ctx === null) {
    throw new Error('useAttachment должен вызываться внутри AttachmentProvider')
  }
  return ctx
}

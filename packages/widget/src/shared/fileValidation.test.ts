import { describe, expect, it } from 'vitest'
import { isPreviewableImage, resolveMimeType, validateFile } from './fileValidation'

function file(name: string, size: number, type = ''): File {
  const blob = new Blob([new Uint8Array(Math.min(size, 1024))], { type })
  // jsdom File: переопределяем size, т.к. реальные байты не создаём.
  return Object.defineProperty(new File([blob], name, { type }), 'size', { value: size })
}

describe('validateFile', () => {
  it('accepts whitelisted extensions within the size limit', () => {
    expect(validateFile(file('doc.pdf', 1024)).ok).toBe(true)
    expect(validateFile(file('photo.JPG', 2048)).ok).toBe(true)
    expect(validateFile(file('выписка.docx', 500)).ok).toBe(true)
    expect(validateFile(file('anim.gif', 500)).ok).toBe(true)
    expect(validateFile(file('pic.webp', 500)).ok).toBe(true)
  })

  it('rejects non-whitelisted extensions (.doc, .exe, archives)', () => {
    expect(validateFile(file('legacy.doc', 1024)).ok).toBe(false)
    expect(validateFile(file('evil.exe', 1024)).ok).toBe(false)
    expect(validateFile(file('a.zip', 1024)).ok).toBe(false)
    expect(validateFile(file('noext', 1024)).ok).toBe(false)
  })

  it('rejects files over the size limit', () => {
    const res = validateFile(file('big.pdf', 11 * 1024 * 1024))
    expect(res.ok).toBe(false)
  })

  it('flags previewable images for raster formats, not documents', () => {
    expect(isPreviewableImage(file('p.png', 10))).toBe(true)
    expect(isPreviewableImage(file('p.jpeg', 10))).toBe(true)
    expect(isPreviewableImage(file('p.webp', 10))).toBe(true)
    expect(isPreviewableImage(file('p.gif', 10))).toBe(true)
    expect(isPreviewableImage(file('d.pdf', 10))).toBe(false)
    expect(isPreviewableImage(file('d.docx', 10))).toBe(false)
  })
})

describe('resolveMimeType', () => {
  it('falls back to the extension when the browser MIME is missing or wrong', () => {
    // .docx в браузере часто приходит с пустым type — octet-stream дал бы 400
    expect(resolveMimeType(file('выписка.docx', 10, ''))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(resolveMimeType(file('photo.JPG', 10, 'application/octet-stream'))).toBe('image/jpeg')
  })

  it('keeps the browser MIME when it matches the extension', () => {
    expect(resolveMimeType(file('p.png', 10, 'image/png'))).toBe('image/png')
  })
})

import { describe, it, expect } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  formatBytes,
  isAllowedMimeType,
  sanitizeFilename,
  validateAttachment,
} from './validate'

describe('isAllowedMimeType', () => {
  it('should accept every allowlisted type', () => {
    for (const type of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]) {
      expect(isAllowedMimeType(type)).toBe(true)
    }
  })

  it('should reject executables, archives, svg and an empty type', () => {
    for (const type of [
      'application/x-msdownload',
      'application/zip',
      'image/svg+xml',
      'text/html',
      '',
    ]) {
      expect(isAllowedMimeType(type)).toBe(false)
    }
  })
})

describe('sanitizeFilename', () => {
  it('should keep an ordinary filename unchanged', () => {
    expect(sanitizeFilename('report-2026.pdf')).toBe('report-2026.pdf')
  })

  it('should strip posix and windows path separators', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('C:\\Users\\bob\\secret.txt')).toBe('secret.txt')
    expect(sanitizeFilename('a/b/c/notes.md')).toBe('notes.md')
  })

  it('should strip control characters', () => {
    expect(sanitizeFilename('bad\u0000name\u001f.txt')).toBe('badname.txt')
    expect(sanitizeFilename('del\u007f.csv')).toBe('del.csv')
  })

  it('should strip leading dots so no dotfile or traversal survives', () => {
    expect(sanitizeFilename('...hidden.png')).toBe('hidden.png')
  })

  it('should fall back to "file" when nothing usable remains', () => {
    expect(sanitizeFilename('')).toBe('file')
    expect(sanitizeFilename('/')).toBe('file')
    expect(sanitizeFilename('...')).toBe('file')
  })

  it('should cap the length at 120 chars while keeping the extension', () => {
    const long = 'a'.repeat(300) + '.png'
    const result = sanitizeFilename(long)
    expect(result).toHaveLength(120)
    expect(result.endsWith('.png')).toBe(true)
  })

  it('should cap an extensionless name at 120 chars', () => {
    expect(sanitizeFilename('b'.repeat(500))).toHaveLength(120)
  })

  it('should keep non-ascii characters', () => {
    expect(sanitizeFilename('årsrapport.pdf')).toBe('årsrapport.pdf')
  })
})

describe('validateAttachment', () => {
  it('should accept an allowed type under the size limit', () => {
    const result = validateAttachment({
      name: 'shot.png',
      type: 'image/png',
      size: 1024,
    })
    expect(result).toEqual({ ok: true, filename: 'shot.png' })
  })

  it('should return the sanitized filename on success', () => {
    const result = validateAttachment({
      name: '../evil.pdf',
      type: 'application/pdf',
      size: 10,
    })
    expect(result.ok && result.filename).toBe('evil.pdf')
  })

  it('should reject a disallowed type', () => {
    const result = validateAttachment({
      name: 'run.exe',
      type: 'application/x-msdownload',
      size: 10,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/not allowed/)
  })

  it('should reject an empty file', () => {
    const result = validateAttachment({ name: 'e.txt', type: 'text/plain', size: 0 })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/empty/)
  })

  it('should reject a file over the 10 MB limit', () => {
    const result = validateAttachment({
      name: 'big.pdf',
      type: 'application/pdf',
      size: MAX_ATTACHMENT_BYTES + 1,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/10 MB limit/)
  })

  it('should accept a file exactly at the limit', () => {
    const result = validateAttachment({
      name: 'edge.pdf',
      type: 'application/pdf',
      size: MAX_ATTACHMENT_BYTES,
    })
    expect(result.ok).toBe(true)
  })
})

describe('formatBytes', () => {
  it('should format bytes, kilobytes and megabytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

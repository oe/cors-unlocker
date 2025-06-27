import { describe, it, expect } from 'vitest'
import { 
  isValidHeaderName, 
  parseExtraHeaders, 
  mergeHeaders,
  PRESET_CORS_HEADERS 
} from '../../src/common/rules'

describe('rules.ts', () => {
  describe('isValidHeaderName', () => {
    it('should accept valid header names', () => {
      expect(isValidHeaderName('Content-Type')).toBe(true)
      expect(isValidHeaderName('X-API-Key')).toBe(true)
      expect(isValidHeaderName('Authorization')).toBe(true)
      expect(isValidHeaderName('custom-header')).toBe(true)
      expect(isValidHeaderName('X-Custom123')).toBe(true)
    })

    it('should reject invalid header names', () => {
      expect(isValidHeaderName('')).toBe(false)
      expect(isValidHeaderName('Header With Spaces')).toBe(false)
      expect(isValidHeaderName('Header/WithSlash')).toBe(false)
      expect(isValidHeaderName('Header[WithBrackets]')).toBe(false)
      expect(isValidHeaderName('Header{WithBraces}')).toBe(false)
    })

    it('should handle edge cases', () => {
      expect(isValidHeaderName(null as any)).toBe(false)
      expect(isValidHeaderName(undefined as any)).toBe(false)
      expect(isValidHeaderName(123 as any)).toBe(false)
    })
  })

  describe('parseExtraHeaders', () => {
    it('should parse comma-separated headers', () => {
      const result = parseExtraHeaders('X-Custom-1, X-Custom-2, X-Custom-3')
      expect(result).toEqual(['X-Custom-1', 'X-Custom-2', 'X-Custom-3'])
    })

    it('should trim whitespace', () => {
      const result = parseExtraHeaders(' X-Custom-1 ,  X-Custom-2  , X-Custom-3 ')
      expect(result).toEqual(['X-Custom-1', 'X-Custom-2', 'X-Custom-3'])
    })

    it('should filter out invalid headers', () => {
      const result = parseExtraHeaders('Valid-Header, Invalid Header With Spaces, Another-Valid')
      expect(result).toEqual(['Valid-Header', 'Another-Valid'])
    })

    it('should handle empty string', () => {
      expect(parseExtraHeaders('')).toEqual([])
      expect(parseExtraHeaders(undefined)).toEqual([])
    })

    it('should filter out empty headers', () => {
      const result = parseExtraHeaders('Valid-Header, , Another-Valid, ')
      expect(result).toEqual(['Valid-Header', 'Another-Valid'])
    })
  })

  describe('mergeHeaders', () => {
    it('should include all preset headers', () => {
      const result = mergeHeaders()
      PRESET_CORS_HEADERS.forEach(header => {
        expect(result).toContain(header)
      })
    })

    it('should add custom headers', () => {
      const result = mergeHeaders('X-Custom-Header')
      expect(result).toContain('X-Custom-Header')
    })

    it('should remove duplicates (case-insensitive)', () => {
      const result = mergeHeaders('authorization, CONTENT-TYPE, x-new-header')
      const authCount = result.filter(h => h.toLowerCase() === 'authorization').length
      const contentTypeCount = result.filter(h => h.toLowerCase() === 'content-type').length
      
      expect(authCount).toBe(1)
      expect(contentTypeCount).toBe(1)
      expect(result).toContain('x-new-header')
    })

    it('should preserve original case for custom headers', () => {
      const result = mergeHeaders('X-Custom-Header')
      expect(result).toContain('X-Custom-Header')
    })
  })
})

/**
 * Tests for deep-link.ts module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureDeepLinks, handleDeepLink, parseDeepLink } from './deep-link'

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  getCurrent: vi.fn().mockResolvedValue(null),
  onOpenUrl: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

describe('deep-link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parseDeepLink', () => {
    it('should parse item URL with numeric ID', () => {
      const result = parseDeepLink('pastelhn://item/12345')
      expect(result).toEqual({ type: 'item', id: 12345 })
    })

    it('should parse story URL (alias for item)', () => {
      const result = parseDeepLink('pastelhn://story/67890')
      expect(result).toEqual({ type: 'item', id: 67890 })
    })

    it('should parse user URL', () => {
      const result = parseDeepLink('pastelhn://user/dang')
      expect(result).toEqual({ type: 'user', username: 'dang' })
    })

    it('should parse feed URL', () => {
      const result = parseDeepLink('pastelhn://feed/best')
      expect(result).toEqual({ type: 'feed', feed: 'best' })
    })

    it('should return unknown for invalid feed', () => {
      const result = parseDeepLink('pastelhn://feed/invalid')
      expect(result.type).toBe('unknown')
    })

    it('should parse search URL with query param', () => {
      const result = parseDeepLink('pastelhn://search?q=rust')
      expect(result).toEqual({ type: 'search', query: 'rust' })
    })

    it('should parse search URL with path value', () => {
      const result = parseDeepLink('pastelhn://search/typescript')
      expect(result).toEqual({ type: 'search', query: 'typescript' })
    })

    it('should return unknown for invalid item ID', () => {
      const result = parseDeepLink('pastelhn://item/abc')
      expect(result.type).toBe('unknown')
    })

    it('should return unknown for missing user', () => {
      const result = parseDeepLink('pastelhn://user/')
      expect(result.type).toBe('unknown')
    })

    it('should return unknown for unsupported scheme', () => {
      const result = parseDeepLink('https://example.com')
      expect(result.type).toBe('unknown')
    })

    it('should return unknown for malformed URL', () => {
      const result = parseDeepLink('not a url')
      expect(result.type).toBe('unknown')
    })

    it('should handle URL with triple slashes as unknown', () => {
      // Triple slashes create a malformed URL structure
      const result = parseDeepLink('pastelhn:///item/12345')
      expect(result.type).toBe('unknown')
    })
  })

  describe('configureDeepLinks', () => {
    it('should accept callback configuration', () => {
      const callbacks = {
        onItem: vi.fn(),
        onUser: vi.fn(),
        onFeed: vi.fn(),
        onSearch: vi.fn(),
      }

      expect(() => configureDeepLinks(callbacks)).not.toThrow()
    })

    it('should accept empty callbacks', () => {
      expect(() => configureDeepLinks({})).not.toThrow()
    })
  })

  describe('handleDeepLink', () => {
    it('should call onItem callback for item URLs', () => {
      const onItem = vi.fn()
      configureDeepLinks({ onItem })

      handleDeepLink('pastelhn://item/12345')

      expect(onItem).toHaveBeenCalledWith(12345)
    })

    it('should call onUser callback for user URLs', () => {
      const onUser = vi.fn()
      configureDeepLinks({ onUser })

      handleDeepLink('pastelhn://user/pg')

      expect(onUser).toHaveBeenCalledWith('pg')
    })

    it('should call onFeed callback for feed URLs', () => {
      const onFeed = vi.fn()
      configureDeepLinks({ onFeed })

      handleDeepLink('pastelhn://feed/ask')

      expect(onFeed).toHaveBeenCalledWith('ask')
    })

    it('should call onSearch callback for search URLs', () => {
      const onSearch = vi.fn()
      configureDeepLinks({ onSearch })

      handleDeepLink('pastelhn://search?q=javascript')

      expect(onSearch).toHaveBeenCalledWith('javascript')
    })

    it('should not throw for unknown URLs', () => {
      configureDeepLinks({})

      expect(() => handleDeepLink('pastelhn://unknown/path')).not.toThrow()
    })

    it('should not call callbacks if not configured', () => {
      configureDeepLinks({})

      expect(() => handleDeepLink('pastelhn://item/123')).not.toThrow()
    })
  })
})

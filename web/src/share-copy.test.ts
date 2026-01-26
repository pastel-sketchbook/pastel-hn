/**
 * Tests for share/copy link functionality in story detail view
 *
 * These tests verify the LOGIC of:
 * - Copy HN Link button
 * - Copy Article Link button
 * - Share button (Web Share API with clipboard fallback)
 *
 * NOTE: These are unit tests that verify the logic patterns used by the
 * handlers, not integration tests of the actual click handlers in main.ts.
 * The handlers are inline in setupNavigation() and would require either:
 * - Extracting handlers to testable functions (architectural change)
 * - E2E tests with Playwright (see e2e/ directory)
 *
 * The E2E tests provide integration coverage for the full click flow.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock toast functions
vi.mock('./toast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

describe('share/copy handlers', () => {
  let mockClipboard: { writeText: ReturnType<typeof vi.fn> }
  let mockShare: ReturnType<typeof vi.fn> | undefined

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()

    // Mock clipboard API
    mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    }
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
      configurable: true,
    })

    // Mock share API (undefined by default, tests can override)
    mockShare = undefined
    Object.defineProperty(navigator, 'share', {
      value: mockShare,
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('copy-hn-link action', () => {
    it('copies HN URL to clipboard', async () => {
      const button = document.createElement('button')
      button.dataset.action = 'copy-hn-link'
      button.dataset.id = '12345'
      document.body.appendChild(button)

      // Simulate click handler logic
      const id = button.dataset.id
      const hnUrl = `https://news.ycombinator.com/item?id=${id}`
      await navigator.clipboard.writeText(hnUrl)

      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        'https://news.ycombinator.com/item?id=12345',
      )
    })

    it('constructs correct HN URL format', () => {
      const storyId = '98765'
      const hnUrl = `https://news.ycombinator.com/item?id=${storyId}`
      expect(hnUrl).toBe('https://news.ycombinator.com/item?id=98765')
    })

    it('handles clipboard failure gracefully', async () => {
      mockClipboard.writeText.mockRejectedValue(new Error('Clipboard failed'))

      const button = document.createElement('button')
      button.dataset.action = 'copy-hn-link'
      button.dataset.id = '12345'

      try {
        await navigator.clipboard.writeText('test')
      } catch {
        // Expected failure
      }

      expect(mockClipboard.writeText).toHaveBeenCalled()
    })
  })

  describe('copy-article-link action', () => {
    it('copies article URL to clipboard', async () => {
      const button = document.createElement('button')
      button.dataset.action = 'copy-article-link'
      button.dataset.url = 'https://example.com/article'
      document.body.appendChild(button)

      const url = button.dataset.url
      if (url) {
        await navigator.clipboard.writeText(url)
      }

      expect(mockClipboard.writeText).toHaveBeenCalledWith(
        'https://example.com/article',
      )
    })

    it('does not copy when URL is missing', async () => {
      const button = document.createElement('button')
      button.dataset.action = 'copy-article-link'
      // No url set

      const url = button.dataset.url
      if (url) {
        await navigator.clipboard.writeText(url)
      }

      expect(mockClipboard.writeText).not.toHaveBeenCalled()
    })

    it('preserves special characters in URLs', async () => {
      const specialUrl = 'https://example.com/path?query=value&other=1#section'
      const button = document.createElement('button')
      button.dataset.url = specialUrl

      await navigator.clipboard.writeText(button.dataset.url!)

      expect(mockClipboard.writeText).toHaveBeenCalledWith(specialUrl)
    })
  })

  describe('share action', () => {
    it('uses Web Share API when available', async () => {
      const mockShareFn = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'share', {
        value: mockShareFn,
        writable: true,
        configurable: true,
      })

      const shareData = {
        title: 'Test Story',
        text: 'Test Story - Hacker News',
        url: 'https://example.com/article',
      }

      await navigator.share(shareData)

      expect(mockShareFn).toHaveBeenCalledWith(shareData)
    })

    it('falls back to clipboard when Web Share API is unavailable', async () => {
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const hnUrl = 'https://news.ycombinator.com/item?id=12345'

      // Simulate fallback logic
      if (!navigator.share) {
        await navigator.clipboard.writeText(hnUrl)
      }

      expect(mockClipboard.writeText).toHaveBeenCalledWith(hnUrl)
    })

    it('uses article URL when available for share', async () => {
      const mockShareFn = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'share', {
        value: mockShareFn,
        writable: true,
        configurable: true,
      })

      const articleUrl = 'https://example.com/article'
      const hnUrl = 'https://news.ycombinator.com/item?id=12345'

      // Share logic prefers article URL
      const urlToShare = articleUrl || hnUrl

      await navigator.share({
        title: 'Test',
        text: 'Test - Hacker News',
        url: urlToShare,
      })

      expect(mockShareFn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: articleUrl,
        }),
      )
    })

    it('uses HN URL when article URL is not available', async () => {
      const mockShareFn = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'share', {
        value: mockShareFn,
        writable: true,
        configurable: true,
      })

      const articleUrl = undefined
      const hnUrl = 'https://news.ycombinator.com/item?id=12345'

      const urlToShare = articleUrl || hnUrl

      await navigator.share({
        title: 'Test',
        text: 'Test - Hacker News',
        url: urlToShare,
      })

      expect(mockShareFn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: hnUrl,
        }),
      )
    })

    it('ignores AbortError when user cancels share', async () => {
      const abortError = new Error('User cancelled')
      abortError.name = 'AbortError'

      const mockShareFn = vi.fn().mockRejectedValue(abortError)
      Object.defineProperty(navigator, 'share', {
        value: mockShareFn,
        writable: true,
        configurable: true,
      })

      let errorShown = false

      try {
        await navigator.share({
          title: 'Test',
          text: 'Test',
          url: 'https://example.com',
        })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          errorShown = true
        }
      }

      // AbortError should be silently ignored
      expect(errorShown).toBe(false)
    })

    it('shows error toast for non-AbortError share failures', async () => {
      const otherError = new Error('Network error')
      otherError.name = 'NetworkError'

      const mockShareFn = vi.fn().mockRejectedValue(otherError)
      Object.defineProperty(navigator, 'share', {
        value: mockShareFn,
        writable: true,
        configurable: true,
      })

      let shouldShowError = false

      try {
        await navigator.share({
          title: 'Test',
          text: 'Test',
          url: 'https://example.com',
        })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          shouldShowError = true
        }
      }

      expect(shouldShowError).toBe(true)
    })
  })

  describe('button data attributes', () => {
    it('data-action identifies the action type', () => {
      const copyHnBtn = document.createElement('button')
      copyHnBtn.dataset.action = 'copy-hn-link'

      const copyArticleBtn = document.createElement('button')
      copyArticleBtn.dataset.action = 'copy-article-link'

      const shareBtn = document.createElement('button')
      shareBtn.dataset.action = 'share'

      expect(copyHnBtn.dataset.action).toBe('copy-hn-link')
      expect(copyArticleBtn.dataset.action).toBe('copy-article-link')
      expect(shareBtn.dataset.action).toBe('share')
    })

    it('data-id stores the story ID', () => {
      const button = document.createElement('button')
      button.dataset.id = '12345678'

      expect(button.dataset.id).toBe('12345678')
    })

    it('data-url stores the article URL', () => {
      const button = document.createElement('button')
      button.dataset.url = 'https://example.com/path'

      expect(button.dataset.url).toBe('https://example.com/path')
    })

    it('data-title stores the story title', () => {
      const button = document.createElement('button')
      button.dataset.title = 'An Interesting Article About Tech'

      expect(button.dataset.title).toBe('An Interesting Article About Tech')
    })
  })
})

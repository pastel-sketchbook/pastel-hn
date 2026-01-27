import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateReadingTime,
  countWords,
  escapeHtml,
  formatAccountAge,
  getHNItemUrl,
  getScoreHeat,
  getStoryType,
  prefersReducedMotion,
  sanitizeHtml,
} from './utils'

describe('utils', () => {
  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert("xss")&lt;/script&gt;',
      )
    })

    it('escapes ampersands', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar')
    })

    it('escapes quotes', () => {
      expect(escapeHtml('"quoted"')).toBe('"quoted"')
    })

    it('handles empty string', () => {
      expect(escapeHtml('')).toBe('')
    })

    it('returns plain text unchanged', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World')
    })
  })

  describe('sanitizeHtml', () => {
    it('removes script tags', () => {
      expect(sanitizeHtml('<p>Hello</p><script>alert("xss")</script>')).toBe(
        '<p>Hello</p>',
      )
    })

    it('removes onclick handlers', () => {
      expect(sanitizeHtml('<a onclick="alert(1)">link</a>')).toBe(
        '<a >link</a>',
      )
    })

    it('removes onmouseover handlers', () => {
      expect(sanitizeHtml('<div onmouseover="hack()">text</div>')).toBe(
        '<div >text</div>',
      )
    })

    it('returns empty string for null', () => {
      expect(sanitizeHtml(null)).toBe('')
    })

    it('preserves safe HTML tags', () => {
      expect(sanitizeHtml('<p>Hello <a href="url">link</a></p>')).toBe(
        '<p>Hello <a href="url">link</a></p>',
      )
    })
  })

  describe('calculateReadingTime', () => {
    it('returns empty string for zero words', () => {
      expect(calculateReadingTime(0)).toBe('')
    })

    it('returns empty string for negative words', () => {
      expect(calculateReadingTime(-10)).toBe('')
    })

    it('returns 1 min read for short text', () => {
      expect(calculateReadingTime(50)).toBe('1 min read')
    })

    it('returns 1 min read for ~200 words', () => {
      expect(calculateReadingTime(200)).toBe('1 min read')
    })

    it('returns 2 min read for ~400 words', () => {
      expect(calculateReadingTime(400)).toBe('2 min read')
    })

    it('rounds up to nearest minute', () => {
      expect(calculateReadingTime(250)).toBe('2 min read')
    })
  })

  describe('countWords', () => {
    it('counts words in plain text', () => {
      expect(countWords('Hello world foo bar')).toBe(4)
    })

    it('strips HTML tags before counting', () => {
      expect(countWords('<p>Hello <strong>world</strong></p>')).toBe(2)
    })

    it('handles multiple whitespace', () => {
      expect(countWords('Hello    world   foo')).toBe(3)
    })

    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0)
    })

    it('returns 0 for null-ish input', () => {
      expect(countWords(null as unknown as string)).toBe(0)
    })
  })

  describe('getStoryType', () => {
    it('returns ask for Ask HN posts', () => {
      expect(getStoryType('Ask HN: How do I learn Rust?')).toBe('ask')
    })

    it('returns ask for Ask HN with dash separator', () => {
      expect(getStoryType('Ask HN – Best practices for testing')).toBe('ask')
    })

    it('returns show for Show HN posts', () => {
      expect(getStoryType('Show HN: My new side project')).toBe('show')
    })

    it('returns show for Show HN with dash separator', () => {
      expect(getStoryType('Show HN – I built a thing')).toBe('show')
    })

    it('returns null for regular posts', () => {
      expect(getStoryType('Google announces new AI model')).toBe(null)
    })

    it('returns null for null title', () => {
      expect(getStoryType(null)).toBe(null)
    })

    it('is case insensitive', () => {
      expect(getStoryType('ASK HN: Question?')).toBe('ask')
      expect(getStoryType('SHOW HN: Project')).toBe('show')
    })
  })

  describe('getScoreHeat', () => {
    it('returns fire for scores >= 500', () => {
      expect(getScoreHeat(500)).toBe('fire')
      expect(getScoreHeat(1000)).toBe('fire')
    })

    it('returns hot for scores >= 200', () => {
      expect(getScoreHeat(200)).toBe('hot')
      expect(getScoreHeat(499)).toBe('hot')
    })

    it('returns warm for scores >= 100', () => {
      expect(getScoreHeat(100)).toBe('warm')
      expect(getScoreHeat(199)).toBe('warm')
    })

    it('returns empty string for low scores', () => {
      expect(getScoreHeat(99)).toBe('')
      expect(getScoreHeat(0)).toBe('')
    })
  })

  describe('formatAccountAge', () => {
    const now = Date.now()

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(now)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('formats years and months', () => {
      // 2 years and 3 months ago
      const created = Math.floor(now / 1000) - 2 * 365 * 86400 - 3 * 30 * 86400
      expect(formatAccountAge(created)).toBe('2y 3mo')
    })

    it('formats years only when no months', () => {
      // Exactly 3 years ago
      const created = Math.floor(now / 1000) - 3 * 365 * 86400
      expect(formatAccountAge(created)).toBe('3 years')
    })

    it('formats months only', () => {
      // 6 months ago
      const created = Math.floor(now / 1000) - 6 * 30 * 86400
      expect(formatAccountAge(created)).toBe('6 months')
    })

    it('formats days for new accounts', () => {
      // 15 days ago
      const created = Math.floor(now / 1000) - 15 * 86400
      expect(formatAccountAge(created)).toBe('15 days')
    })
  })

  describe('prefersReducedMotion', () => {
    it('returns false by default', () => {
      // jsdom/happy-dom default is no preference
      expect(prefersReducedMotion()).toBe(false)
    })
  })

  describe('getHNItemUrl', () => {
    it('generates correct Hacker News item URL', () => {
      expect(getHNItemUrl(12345)).toBe(
        'https://news.ycombinator.com/item?id=12345',
      )
    })
  })
})

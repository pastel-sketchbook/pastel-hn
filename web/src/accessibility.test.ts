import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announce, escapeAttr } from './accessibility'

describe('accessibility', () => {
  describe('announce', () => {
    let announcer: HTMLDivElement

    beforeEach(() => {
      vi.useFakeTimers()
      // Create mock announcer element
      announcer = document.createElement('div')
      announcer.id = 'announcer'
      document.body.appendChild(announcer)
    })

    afterEach(() => {
      vi.useRealTimers()
      announcer.remove()
    })

    it('sets announcer text content', () => {
      announce('Stories loaded')
      expect(announcer.textContent).toBe('Stories loaded')
    })

    it('clears announcer after delay', () => {
      announce('Stories loaded')
      expect(announcer.textContent).toBe('Stories loaded')

      vi.advanceTimersByTime(1000)
      expect(announcer.textContent).toBe('')
    })

    it('allows re-announcement of same message after clear', () => {
      announce('Loading')
      expect(announcer.textContent).toBe('Loading')

      vi.advanceTimersByTime(1000)
      expect(announcer.textContent).toBe('')

      announce('Loading')
      expect(announcer.textContent).toBe('Loading')
    })

    it('does nothing if announcer element not found', () => {
      announcer.remove()
      // Should not throw
      expect(() => announce('Test message')).not.toThrow()
    })

    it('overwrites previous message immediately', () => {
      announce('First message')
      announce('Second message')
      expect(announcer.textContent).toBe('Second message')
    })
  })

  describe('escapeAttr', () => {
    it('escapes ampersands', () => {
      expect(escapeAttr('foo & bar')).toBe('foo &amp; bar')
    })

    it('escapes less-than', () => {
      expect(escapeAttr('a < b')).toBe('a &lt; b')
    })

    it('escapes greater-than', () => {
      expect(escapeAttr('a > b')).toBe('a &gt; b')
    })

    it('escapes double quotes', () => {
      expect(escapeAttr('say "hello"')).toBe('say &quot;hello&quot;')
    })

    it('escapes single quotes', () => {
      expect(escapeAttr("it's fine")).toBe('it&#x27;s fine')
    })

    it('escapes all special characters together', () => {
      expect(escapeAttr('<script>"alert(\'xss\')&"</script>')).toBe(
        '&lt;script&gt;&quot;alert(&#x27;xss&#x27;)&amp;&quot;&lt;/script&gt;',
      )
    })

    it('returns empty string for empty input', () => {
      expect(escapeAttr('')).toBe('')
    })

    it('passes through safe text unchanged', () => {
      expect(escapeAttr('Hello World 123')).toBe('Hello World 123')
    })

    it('handles URLs with query params', () => {
      expect(escapeAttr('https://example.com?a=1&b=2')).toBe(
        'https://example.com?a=1&amp;b=2',
      )
    })
  })
})

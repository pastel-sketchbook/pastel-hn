/**
 * Tests for tts-ui.ts
 *
 * These tests verify the TTS UI functions work correctly.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createTtsButton, extractArticleText } from './tts-ui'

describe('tts-ui', () => {
  describe('createTtsButton', () => {
    it('should return button HTML when not playing', () => {
      const button = createTtsButton()
      expect(button).toContain('Read Aloud')
      expect(button).toContain('data-action="tts-toggle"')
      expect(button).toContain('aria-pressed="false"')
    })

    it('should return playing state button HTML', () => {
      const button = createTtsButton(true)
      expect(button).toContain('Stop Reading')
      expect(button).toContain('playing')
      expect(button).toContain('aria-pressed="true"')
    })
  })

  describe('extractArticleText', () => {
    let container: HTMLElement

    beforeEach(() => {
      container = document.createElement('div')
    })

    it('should extract text from simple content', () => {
      container.innerHTML = '<p>Hello world</p>'
      const text = extractArticleText(container)
      expect(text).toBe('Hello world')
    })

    it('should handle multiple paragraphs', () => {
      container.innerHTML = '<p>First paragraph.</p><p>Second paragraph.</p>'
      const text = extractArticleText(container)
      expect(text).toContain('First paragraph.')
      expect(text).toContain('Second paragraph.')
    })

    it('should remove script tags', () => {
      container.innerHTML = '<p>Content</p><script>alert("bad")</script>'
      const text = extractArticleText(container)
      expect(text).toBe('Content')
      expect(text).not.toContain('alert')
    })

    it('should remove style tags', () => {
      container.innerHTML = '<p>Content</p><style>.foo { color: red; }</style>'
      const text = extractArticleText(container)
      expect(text).toBe('Content')
      expect(text).not.toContain('color')
    })

    it('should remove buttons', () => {
      container.innerHTML = '<p>Content</p><button>Click me</button>'
      const text = extractArticleText(container)
      expect(text).toBe('Content')
      expect(text).not.toContain('Click me')
    })

    it('should remove skeleton elements', () => {
      container.innerHTML =
        '<p>Content</p><div class="skeleton">Loading...</div>'
      const text = extractArticleText(container)
      expect(text).toBe('Content')
      expect(text).not.toContain('Loading')
    })

    it('should remove loading indicators', () => {
      container.innerHTML =
        '<p>Content</p><div class="article-loading">Loading article...</div>'
      const text = extractArticleText(container)
      expect(text).toBe('Content')
    })

    it('should clean up excess whitespace', () => {
      container.innerHTML = '<p>Content   with    spaces</p>'
      const text = extractArticleText(container)
      expect(text).toBe('Content with spaces')
    })

    it('should return empty string for empty container', () => {
      container.innerHTML = ''
      const text = extractArticleText(container)
      expect(text).toBe('')
    })

    it('should preserve text from nested elements', () => {
      container.innerHTML =
        '<div><span>Nested <strong>text</strong> content</span></div>'
      const text = extractArticleText(container)
      expect(text).toBe('Nested text content')
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONTEXT_MENU_HEIGHT,
  CONTEXT_MENU_WIDTH,
  getContextMenu,
  handleTextSelection,
  hideContextMenu,
  initContextMenu,
  isAssistantOpen,
  resetContextMenu,
  toggleAssistant,
  updateAssistantZenMode,
} from './assistant-ui'

// Mock copilot-client module
vi.mock('./copilot-client', () => ({
  getCopilotClient: () => ({
    check: vi.fn().mockResolvedValue({ available: true }),
    init: vi.fn().mockResolvedValue(undefined),
    isInitialized: vi.fn().mockReturnValue(true),
    explain: vi.fn().mockResolvedValue({ content: 'Explanation here' }),
    draftReply: vi.fn().mockResolvedValue({ content: 'Draft reply here' }),
  }),
}))

describe('assistant-ui', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.className = ''
    resetContextMenu()

    // Create assistant toggle button mock
    const button = document.createElement('button')
    button.id = 'assistant-toggle'
    document.body.appendChild(button)

    // Create assistant panel mock
    const panel = document.createElement('div')
    panel.id = 'assistant-panel'
    document.body.appendChild(panel)
  })

  describe('updateAssistantZenMode', () => {
    it('shows toggle button when zen mode is active and in detail view', () => {
      const toggleBtn = document.getElementById('assistant-toggle')
      updateAssistantZenMode(true, 'detail')
      expect(toggleBtn?.style.display).toBe('flex')
      expect(
        document.documentElement.classList.contains('assistant-toggle-visible'),
      ).toBe(true)
    })

    it('hides toggle button when in list view even if zen mode is active', () => {
      const toggleBtn = document.getElementById('assistant-toggle')
      updateAssistantZenMode(true, 'list')
      expect(toggleBtn?.style.display).toBe('none')
      expect(
        document.documentElement.classList.contains('assistant-toggle-visible'),
      ).toBe(false)
    })

    it('hides toggle button when zen mode is inactive', () => {
      const toggleBtn = document.getElementById('assistant-toggle')
      updateAssistantZenMode(false, 'detail')
      expect(toggleBtn?.style.display).toBe('none')
      expect(
        document.documentElement.classList.contains('assistant-toggle-visible'),
      ).toBe(false)
    })

    it('auto-closes assistant when visibility becomes hidden', () => {
      // First ensure it's visible so we can open it
      updateAssistantZenMode(true, 'detail')

      // Open the assistant
      if (!isAssistantOpen()) {
        toggleAssistant()
      }
      expect(isAssistantOpen()).toBe(true)

      // Switch to list view (visibility becomes false)
      updateAssistantZenMode(true, 'list')
      expect(isAssistantOpen()).toBe(false)
    })
  })

  describe('context menu constants', () => {
    it('has expected dimensions', () => {
      expect(CONTEXT_MENU_WIDTH).toBe(160)
      expect(CONTEXT_MENU_HEIGHT).toBe(80)
    })
  })

  describe('initContextMenu', () => {
    it('creates context menu element in DOM', () => {
      initContextMenu()
      const menu = document.getElementById('assistant-context-menu')
      expect(menu).toBeTruthy()
      expect(menu?.classList.contains('assistant-context-menu')).toBe(true)
    })

    it('has correct ARIA role', () => {
      initContextMenu()
      const menu = document.getElementById('assistant-context-menu')
      expect(menu?.getAttribute('role')).toBe('menu')
    })

    it('contains Explain This button', () => {
      initContextMenu()
      const menu = document.getElementById('assistant-context-menu')
      const explainBtn = menu?.querySelector('[data-action="explain"]')
      expect(explainBtn).toBeTruthy()
      expect(explainBtn?.textContent).toContain('Explain This')
    })

    it('contains Draft Reply button (hidden by default)', () => {
      initContextMenu()
      const menu = document.getElementById('assistant-context-menu')
      const draftBtn = menu?.querySelector(
        '[data-action="draft-reply"]',
      ) as HTMLElement
      expect(draftBtn).toBeTruthy()
      expect(draftBtn?.style.display).toBe('none')
    })

    it('only initializes once', () => {
      initContextMenu()
      const menu1 = document.getElementById('assistant-context-menu')
      initContextMenu()
      const menu2 = document.getElementById('assistant-context-menu')
      expect(menu1).toBe(menu2)
      expect(document.querySelectorAll('#assistant-context-menu').length).toBe(
        1,
      )
    })
  })

  describe('hideContextMenu', () => {
    beforeEach(() => {
      initContextMenu()
    })

    it('removes visible class from context menu', () => {
      const menu = getContextMenu()
      menu?.classList.add('visible')
      expect(menu?.classList.contains('visible')).toBe(true)

      hideContextMenu()
      expect(menu?.classList.contains('visible')).toBe(false)
    })

    it('does not throw when context menu is not initialized', () => {
      // Reset context menu by clearing DOM
      document.body.innerHTML = ''
      expect(() => hideContextMenu()).not.toThrow()
    })
  })

  describe('handleTextSelection', () => {
    beforeEach(() => {
      initContextMenu()
      // Enable zen mode (required for context menu)
      document.documentElement.classList.add('zen-mode')
    })

    afterEach(() => {
      hideContextMenu()
    })

    it('does not show menu when not in zen mode', () => {
      document.documentElement.classList.remove('zen-mode')

      // Create mock selection
      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      expect(menu?.classList.contains('visible')).toBe(false)
    })

    it('does not show menu for short selections (< 3 chars)', () => {
      // Create article content
      const article = document.createElement('div')
      article.className = 'article-content'
      article.textContent = 'ab'
      document.body.appendChild(article)

      // Mock window.getSelection to return short text
      const mockSelection = {
        toString: () => 'ab',
        getRangeAt: () => ({
          commonAncestorContainer: article,
          getBoundingClientRect: () => ({ left: 100, top: 100, width: 50 }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      expect(menu?.classList.contains('visible')).toBe(false)
    })

    it('does not show menu for selections outside content areas', () => {
      // Create non-content element
      const header = document.createElement('header')
      header.textContent = 'This is a header with some text'
      document.body.appendChild(header)

      // Mock window.getSelection to return text from header
      const mockSelection = {
        toString: () => 'This is a header',
        getRangeAt: () => ({
          commonAncestorContainer: header,
          getBoundingClientRect: () => ({ left: 100, top: 100, width: 150 }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      expect(menu?.classList.contains('visible')).toBe(false)
    })

    it('shows menu for selections in article content', () => {
      // Create article content
      const article = document.createElement('div')
      article.className = 'article-content'
      const textNode = document.createTextNode(
        'This is an interesting article about technology',
      )
      article.appendChild(textNode)
      document.body.appendChild(article)

      // Mock window.getSelection
      const mockSelection = {
        toString: () => 'interesting article',
        getRangeAt: () => ({
          commonAncestorContainer: textNode,
          getBoundingClientRect: () => ({
            left: 100,
            top: 200,
            width: 150,
            bottom: 220,
          }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      expect(menu?.classList.contains('visible')).toBe(true)
      expect(menu?.dataset.selectedText).toBe('interesting article')
    })

    it('shows Draft Reply button when selection is in a comment', () => {
      // Create comment structure
      const comment = document.createElement('div')
      comment.className = 'comment'
      comment.dataset.id = '12345'

      const author = document.createElement('span')
      author.className = 'comment-author'
      author.textContent = 'testuser'
      comment.appendChild(author)

      const commentText = document.createElement('div')
      commentText.className = 'comment-text'
      const textNode = document.createTextNode('This is a thoughtful comment')
      commentText.appendChild(textNode)
      comment.appendChild(commentText)

      document.body.appendChild(comment)

      // Mock window.getSelection
      const mockSelection = {
        toString: () => 'thoughtful comment',
        getRangeAt: () => ({
          commonAncestorContainer: textNode,
          getBoundingClientRect: () => ({
            left: 100,
            top: 200,
            width: 150,
            bottom: 220,
          }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      expect(menu?.classList.contains('visible')).toBe(true)

      const draftBtn = menu?.querySelector(
        '[data-action="draft-reply"]',
      ) as HTMLElement
      expect(draftBtn?.style.display).toBe('flex')

      // Check stored comment info
      expect(menu?.dataset.commentId).toBe('12345')
      expect(menu?.dataset.commentAuthor).toBe('testuser')
    })

    it('hides Draft Reply button when selection is in article (not comment)', () => {
      // Create article content
      const article = document.createElement('div')
      article.className = 'article-content'
      const textNode = document.createTextNode('Article text here')
      article.appendChild(textNode)
      document.body.appendChild(article)

      // Mock window.getSelection
      const mockSelection = {
        toString: () => 'Article text',
        getRangeAt: () => ({
          commonAncestorContainer: textNode,
          getBoundingClientRect: () => ({
            left: 100,
            top: 200,
            width: 150,
            bottom: 220,
          }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      const draftBtn = menu?.querySelector(
        '[data-action="draft-reply"]',
      ) as HTMLElement
      expect(draftBtn?.style.display).toBe('none')
    })

    it('positions menu above selection by default', () => {
      // Create article content
      const article = document.createElement('div')
      article.className = 'article-content'
      const textNode = document.createTextNode('Some article text')
      article.appendChild(textNode)
      document.body.appendChild(article)

      const mockSelection = {
        toString: () => 'article text',
        getRangeAt: () => ({
          commonAncestorContainer: textNode,
          getBoundingClientRect: () => ({
            left: 200,
            top: 300,
            width: 100,
            bottom: 320,
          }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      // Menu should be positioned above: top = 300 - 80 - 8 = 212
      expect(menu?.style.top).toBe('212px')
      // Centered: left = 200 + 100/2 - 160/2 = 200 + 50 - 80 = 170
      expect(menu?.style.left).toBe('170px')
    })

    it('positions menu below selection when too close to top', () => {
      // Create article content
      const article = document.createElement('div')
      article.className = 'article-content'
      const textNode = document.createTextNode('Some article text')
      article.appendChild(textNode)
      document.body.appendChild(article)

      const mockSelection = {
        toString: () => 'article text',
        getRangeAt: () => ({
          commonAncestorContainer: textNode,
          getBoundingClientRect: () => ({
            left: 200,
            top: 50, // Too close to top (50 - 80 - 8 = -38 < 8)
            width: 100,
            bottom: 70,
          }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      // Menu should be positioned below: top = bottom + 8 = 70 + 8 = 78
      expect(menu?.style.top).toBe('78px')
    })

    it('constrains menu to left edge of viewport', () => {
      // Create article content
      const article = document.createElement('div')
      article.className = 'article-content'
      const textNode = document.createTextNode('Some article text')
      article.appendChild(textNode)
      document.body.appendChild(article)

      const mockSelection = {
        toString: () => 'article text',
        getRangeAt: () => ({
          commonAncestorContainer: textNode,
          getBoundingClientRect: () => ({
            left: 0, // At left edge
            top: 300,
            width: 50,
            bottom: 320,
          }),
        }),
      }
      vi.spyOn(window, 'getSelection').mockReturnValue(
        mockSelection as unknown as Selection,
      )

      const mockEvent = new MouseEvent('mouseup')
      handleTextSelection(mockEvent)

      const menu = getContextMenu()
      // Should be constrained to 8px from left edge
      expect(menu?.style.left).toBe('8px')
    })
  })

  describe('getContextMenu', () => {
    it('returns null before initialization', () => {
      // resetContextMenu() is called in beforeEach, so contextMenu is null
      const menu = getContextMenu()
      expect(menu).toBeNull()
    })

    it('returns menu element after initialization', () => {
      initContextMenu()
      const menu = getContextMenu()
      expect(menu).toBeTruthy()
      expect(menu?.id).toBe('assistant-context-menu')
    })
  })

  describe('parseMarkdown', () => {
    let parseMarkdown: (text: string) => string

    beforeEach(async () => {
      // Dynamically import to get the exported function
      const module = await import('./assistant-ui')
      parseMarkdown = module.parseMarkdown
    })

    describe('heading hierarchy', () => {
      it('converts # to h3 (not h2) for proper nesting under panel h2', () => {
        const result = parseMarkdown('# Main Heading')
        expect(result).toContain('<h3>Main Heading</h3>')
        expect(result).not.toContain('<h2>')
      })

      it('converts ## to h4 for proper nesting', () => {
        const result = parseMarkdown('## Subheading')
        expect(result).toContain('<h4>Subheading</h4>')
        expect(result).not.toContain('<h3>Subheading</h3>')
      })

      it('converts ### to h5 for proper nesting', () => {
        const result = parseMarkdown('### Sub-subheading')
        expect(result).toContain('<h5>Sub-subheading</h5>')
        expect(result).not.toContain('<h4>Sub-subheading</h4>')
      })

      it('handles multiple heading levels in same text', () => {
        const result = parseMarkdown('# H1\n## H2\n### H3')
        expect(result).toContain('<h3>H1</h3>')
        expect(result).toContain('<h4>H2</h4>')
        expect(result).toContain('<h5>H3</h5>')
      })

      it('preserves heading text with special characters', () => {
        const result = parseMarkdown('# What is `async/await`?')
        expect(result).toContain('<h3>What is <code>async/await</code>?</h3>')
      })
    })

    describe('other markdown features', () => {
      it('converts inline code', () => {
        const result = parseMarkdown('Use `const` for constants')
        expect(result).toContain('<code>const</code>')
      })

      it('converts code blocks', () => {
        const result = parseMarkdown('```js\nconst x = 1;\n```')
        expect(result).toContain('<pre><code>')
        expect(result).toContain('const x = 1;')
      })

      it('converts bold text', () => {
        const result = parseMarkdown('This is **important**')
        expect(result).toContain('<strong>important</strong>')
      })

      it('converts italic text', () => {
        const result = parseMarkdown('This is *emphasized*')
        expect(result).toContain('<em>emphasized</em>')
      })

      it('converts unordered lists', () => {
        const result = parseMarkdown('- Item 1\n- Item 2')
        expect(result).toContain('<ul>')
        expect(result).toContain('<li>Item 1</li>')
        expect(result).toContain('<li>Item 2</li>')
      })

      it('escapes HTML in input', () => {
        const result = parseMarkdown('<script>alert("xss")</script>')
        expect(result).not.toContain('<script>')
        expect(result).toContain('&lt;script&gt;')
      })
    })
  })
})

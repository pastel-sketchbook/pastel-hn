import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from './api'
import {
  closeSearchModal,
  isSearchModalOpen,
  renderSearchResult,
  showSearchModal,
} from './search'

describe('search', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // Ensure modal is closed before each test
    closeSearchModal()
  })

  afterEach(() => {
    closeSearchModal()
    vi.restoreAllMocks()
  })

  describe('isSearchModalOpen', () => {
    it('returns false when modal is not open', () => {
      expect(isSearchModalOpen()).toBe(false)
    })

    it('returns true when modal is open', () => {
      showSearchModal()
      expect(isSearchModalOpen()).toBe(true)
    })
  })

  describe('showSearchModal', () => {
    it('creates modal overlay', () => {
      showSearchModal()
      const overlay = document.querySelector('.search-modal-overlay')
      expect(overlay).not.toBeNull()
    })

    it('creates search input', () => {
      showSearchModal()
      const input = document.querySelector('.search-input')
      expect(input).not.toBeNull()
    })

    it('creates filter buttons', () => {
      showSearchModal()
      const allBtn = document.querySelector('[data-filter="all"]')
      const storiesBtn = document.querySelector('[data-filter="story"]')
      const commentsBtn = document.querySelector('[data-filter="comment"]')
      expect(allBtn).not.toBeNull()
      expect(storiesBtn).not.toBeNull()
      expect(commentsBtn).not.toBeNull()
    })

    it('creates sort toggle button', () => {
      showSearchModal()
      const sortBtn = document.querySelector('[data-sort="toggle"]')
      expect(sortBtn).not.toBeNull()
    })

    it('shows search hint initially', () => {
      showSearchModal()
      const hint = document.querySelector('.search-hint')
      expect(hint).not.toBeNull()
      expect(hint?.textContent).toContain('Type to search')
    })

    it('does not create duplicate modals', () => {
      showSearchModal()
      showSearchModal()
      const overlays = document.querySelectorAll('.search-modal-overlay')
      expect(overlays.length).toBe(1)
    })

    it('has cyber-frame styling', () => {
      showSearchModal()
      const modal = document.querySelector('.search-modal')
      expect(modal?.classList.contains('cyber-frame')).toBe(true)
    })
  })

  describe('closeSearchModal', () => {
    it('removes modal overlay', () => {
      showSearchModal()
      closeSearchModal()
      const overlay = document.querySelector('.search-modal-overlay')
      expect(overlay).toBeNull()
    })

    it('sets modal state to closed', () => {
      showSearchModal()
      closeSearchModal()
      expect(isSearchModalOpen()).toBe(false)
    })

    it('does nothing when modal is not open', () => {
      // Should not throw
      closeSearchModal()
      expect(isSearchModalOpen()).toBe(false)
    })
  })

  describe('renderSearchResult', () => {
    describe('story results', () => {
      const storyResult: SearchResult = {
        id: '12345',
        type: 'story',
        title: 'Test Story Title',
        url: 'https://example.com/article',
        author: 'testuser',
        points: 100,
        numComments: 50,
        createdAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      }

      it('renders story with title', () => {
        const html = renderSearchResult(storyResult)
        expect(html).toContain('Test Story Title')
      })

      it('renders story with data-type="story"', () => {
        const html = renderSearchResult(storyResult)
        expect(html).toContain('data-type="story"')
      })

      it('renders story with id', () => {
        const html = renderSearchResult(storyResult)
        expect(html).toContain('data-id="12345"')
      })

      it('renders domain from URL', () => {
        const html = renderSearchResult(storyResult)
        expect(html).toContain('example.com')
      })

      it('renders points', () => {
        const html = renderSearchResult(storyResult)
        expect(html).toContain('100')
      })

      it('renders author', () => {
        const html = renderSearchResult(storyResult)
        expect(html).toContain('testuser')
      })

      it('renders comment count', () => {
        const html = renderSearchResult(storyResult)
        expect(html).toContain('50')
      })

      it('escapes HTML in title', () => {
        const result: SearchResult = {
          ...storyResult,
          title: '<script>alert("xss")</script>',
        }
        const html = renderSearchResult(result)
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')
      })

      it('handles missing title', () => {
        const result: SearchResult = {
          ...storyResult,
          title: undefined,
        }
        const html = renderSearchResult(result)
        expect(html).toContain('Untitled')
      })

      it('handles missing URL (no domain shown)', () => {
        const result: SearchResult = {
          ...storyResult,
          url: undefined,
        }
        const html = renderSearchResult(result)
        expect(html).toContain('Test Story Title')
        expect(html).not.toContain('result-domain')
      })
    })

    describe('comment results', () => {
      const commentResult: SearchResult = {
        id: '67890',
        type: 'comment',
        text: 'This is a test comment with some content that might be long',
        author: 'commentuser',
        storyId: '12345',
        storyTitle: 'Parent Story Title',
        createdAt: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      }

      it('renders comment with data-type="comment"', () => {
        const html = renderSearchResult(commentResult)
        expect(html).toContain('data-type="comment"')
      })

      it('renders comment with id', () => {
        const html = renderSearchResult(commentResult)
        expect(html).toContain('data-id="67890"')
      })

      it('renders story ID reference', () => {
        const html = renderSearchResult(commentResult)
        expect(html).toContain('data-story-id="12345"')
      })

      it('renders "Re:" prefix with story title', () => {
        const html = renderSearchResult(commentResult)
        expect(html).toContain('Re: Parent Story Title')
      })

      it('renders text preview', () => {
        const html = renderSearchResult(commentResult)
        expect(html).toContain('This is a test comment')
      })

      it('renders author', () => {
        const html = renderSearchResult(commentResult)
        expect(html).toContain('commentuser')
      })

      it('has search-result-comment class', () => {
        const html = renderSearchResult(commentResult)
        expect(html).toContain('search-result-comment')
      })

      it('handles missing story title', () => {
        const result: SearchResult = {
          ...commentResult,
          storyTitle: undefined,
        }
        const html = renderSearchResult(result)
        expect(html).toContain('Re: Unknown story')
      })

      it('truncates long text to 200 characters', () => {
        const longText = 'A'.repeat(300)
        const result: SearchResult = {
          ...commentResult,
          text: longText,
        }
        const html = renderSearchResult(result)
        // Should contain truncated text (200 chars) plus "..."
        const truncated = 'A'.repeat(200)
        expect(html).toContain(`${truncated}...`)
      })

      it('escapes HTML in comment text', () => {
        const result: SearchResult = {
          ...commentResult,
          text: '<script>alert("xss")</script>',
        }
        const html = renderSearchResult(result)
        expect(html).not.toContain('<script>')
        expect(html).toContain('&lt;script&gt;')
      })
    })
  })

  describe('keyboard interaction', () => {
    it('closes on Escape key in input', () => {
      showSearchModal()
      const input = document.querySelector('.search-input') as HTMLInputElement
      expect(input).not.toBeNull()

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      })
      input.dispatchEvent(event)

      expect(isSearchModalOpen()).toBe(false)
    })
  })

  describe('click interaction', () => {
    it('closes on backdrop click', () => {
      showSearchModal()
      const overlay = document.querySelector(
        '.search-modal-overlay',
      ) as HTMLElement
      expect(overlay).not.toBeNull()

      // Simulate click on the overlay itself (not the modal content)
      overlay.click()

      expect(isSearchModalOpen()).toBe(false)
    })

    it('toggles sort between relevance and date', () => {
      showSearchModal()
      const sortBtn = document.querySelector(
        '[data-sort="toggle"]',
      ) as HTMLElement
      const sortLabel = sortBtn.querySelector('.sort-label')

      expect(sortLabel?.textContent).toBe('Relevance')

      sortBtn.click()
      expect(sortLabel?.textContent).toBe('Date')
      expect(sortBtn.classList.contains('active')).toBe(true)

      sortBtn.click()
      expect(sortLabel?.textContent).toBe('Relevance')
      expect(sortBtn.classList.contains('active')).toBe(false)
    })

    it('switches filter buttons', () => {
      showSearchModal()
      const allBtn = document.querySelector(
        '[data-filter="all"]',
      ) as HTMLElement
      const storiesBtn = document.querySelector(
        '[data-filter="story"]',
      ) as HTMLElement

      expect(allBtn.classList.contains('active')).toBe(true)
      expect(storiesBtn.classList.contains('active')).toBe(false)

      storiesBtn.click()

      expect(allBtn.classList.contains('active')).toBe(false)
      expect(storiesBtn.classList.contains('active')).toBe(true)
    })
  })
})

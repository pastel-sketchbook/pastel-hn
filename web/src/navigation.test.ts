import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('./storage', () => ({
  bookmarkStory: vi.fn(),
  removeBookmark: vi.fn(),
  isStoryBookmarked: vi.fn(),
  followStory: vi.fn(),
  unfollowStory: vi.fn(),
  isStoryFollowed: vi.fn(),
}))

vi.mock('./toast', () => ({
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('./icons', () => ({
  icons: {
    bookmark: '<svg>bookmark</svg>',
    bookmarkFilled: '<svg>bookmarkFilled</svg>',
    bell: '<svg>bell</svg>',
    bellFilled: '<svg>bellFilled</svg>',
  },
}))

// Import after mocks
import {
  configureNavigation,
  handleHashChange,
  type NavigationCallbacks,
  setupActionHandlers,
  setupAllNavigation,
  setupBackNavigation,
  setupCommentLinkHandlers,
  setupFeedNavigation,
  setupRetryHandlers,
  setupStoryCardHandlers,
  setupUserLinkHandlers,
} from './navigation'
import {
  bookmarkStory,
  followStory,
  isStoryBookmarked,
  isStoryFollowed,
  removeBookmark,
  unfollowStory,
} from './storage'
import { toastError, toastInfo, toastSuccess } from './toast'
import type { HNItem } from './types'

// Mock functions
const mockBookmarkStory = vi.mocked(bookmarkStory)
const mockRemoveBookmark = vi.mocked(removeBookmark)
const mockIsStoryBookmarked = vi.mocked(isStoryBookmarked)
const mockFollowStory = vi.mocked(followStory)
const mockUnfollowStory = vi.mocked(unfollowStory)
const mockIsStoryFollowed = vi.mocked(isStoryFollowed)
const mockToastSuccess = vi.mocked(toastSuccess)
const mockToastInfo = vi.mocked(toastInfo)
const mockToastError = vi.mocked(toastError)

/**
 * Factory for creating mock navigation callbacks
 */
function createMockCallbacks(
  overrides: Partial<NavigationCallbacks> = {},
): NavigationCallbacks {
  return {
    getCurrentView: vi.fn().mockReturnValue('list'),
    setCurrentView: vi.fn(),
    getCurrentFeed: vi.fn().mockReturnValue('top'),
    setCurrentFeed: vi.fn(),
    getCurrentStoryId: vi.fn().mockReturnValue(123),
    getCurrentUserId: vi.fn().mockReturnValue('dang'),
    getCurrentStoryData: vi.fn().mockReturnValue({
      id: 123,
      title: 'Test Story',
      url: 'https://example.com',
      by: 'testuser',
      score: 100,
      time: Date.now() / 1000,
      descendants: 50,
    } as HNItem),
    renderStories: vi.fn().mockResolvedValue(undefined),
    renderStoryDetail: vi.fn().mockResolvedValue(undefined),
    renderUserProfile: vi.fn().mockResolvedValue(undefined),
    navigateBackToList: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('navigation', () => {
  let mockCallbacks: NavigationCallbacks

  let mockClipboardWriteText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    mockCallbacks = createMockCallbacks()

    // Reset location hash
    window.location.hash = ''

    // Mock clipboard API using vi.stubGlobal
    mockClipboardWriteText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: mockClipboardWriteText,
        readText: vi.fn(),
      },
      share: undefined,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('configureNavigation', () => {
    it('stores callbacks for later use', () => {
      configureNavigation(mockCallbacks)

      // Verify callbacks are stored by testing that navigation works
      document.body.innerHTML =
        '<nav id="nav"><button data-feed="new">New</button></nav>'
      setupFeedNavigation()

      const btn = document.querySelector('[data-feed="new"]') as HTMLElement
      btn.click()

      expect(mockCallbacks.setCurrentFeed).toHaveBeenCalledWith('new')
    })
  })

  describe('setupFeedNavigation', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <nav id="nav">
          <button data-feed="top" class="active" aria-pressed="true">Top</button>
          <button data-feed="new" aria-pressed="false">New</button>
          <button data-feed="best" aria-pressed="false">Best</button>
        </nav>
      `
      configureNavigation(mockCallbacks)
      setupFeedNavigation()
    })

    it('switches feed on nav button click', () => {
      const newBtn = document.querySelector('[data-feed="new"]') as HTMLElement
      newBtn.click()

      expect(mockCallbacks.setCurrentFeed).toHaveBeenCalledWith('new')
      expect(mockCallbacks.setCurrentView).toHaveBeenCalledWith('list')
      expect(mockCallbacks.renderStories).toHaveBeenCalledWith('new')
    })

    it('updates active state on feed switch', () => {
      const newBtn = document.querySelector('[data-feed="new"]') as HTMLElement
      newBtn.click()

      expect(newBtn.classList.contains('active')).toBe(true)
      expect(newBtn.getAttribute('aria-pressed')).toBe('true')

      const topBtn = document.querySelector('[data-feed="top"]') as HTMLElement
      expect(topBtn.classList.contains('active')).toBe(false)
      expect(topBtn.getAttribute('aria-pressed')).toBe('false')
    })

    it('ignores click if same feed and already in list view', () => {
      const topBtn = document.querySelector('[data-feed="top"]') as HTMLElement
      topBtn.click()

      expect(mockCallbacks.setCurrentFeed).not.toHaveBeenCalled()
      expect(mockCallbacks.renderStories).not.toHaveBeenCalled()
    })

    it('reloads if same feed but in detail view', () => {
      ;(
        mockCallbacks.getCurrentView as ReturnType<typeof vi.fn>
      ).mockReturnValue('detail')

      const topBtn = document.querySelector('[data-feed="top"]') as HTMLElement
      topBtn.click()

      expect(mockCallbacks.setCurrentFeed).toHaveBeenCalledWith('top')
      expect(mockCallbacks.renderStories).toHaveBeenCalled()
    })

    it('clears location hash on feed switch', () => {
      window.location.hash = '#item/123'

      const newBtn = document.querySelector('[data-feed="new"]') as HTMLElement
      newBtn.click()

      expect(window.location.hash).toBe('')
    })
  })

  describe('setupBackNavigation', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <button data-action="back">Back</button>
      `
      configureNavigation(mockCallbacks)
      setupBackNavigation()
    })

    it('calls navigateBackToList on back button click', () => {
      const backBtn = document.querySelector(
        '[data-action="back"]',
      ) as HTMLElement
      backBtn.click()

      expect(mockCallbacks.navigateBackToList).toHaveBeenCalled()
    })

    it('prevents default event behavior', () => {
      const backBtn = document.querySelector(
        '[data-action="back"]',
      ) as HTMLElement
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

      backBtn.dispatchEvent(event)

      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  describe('setupRetryHandlers', () => {
    beforeEach(() => {
      configureNavigation(mockCallbacks)
      setupRetryHandlers()
    })

    it('retries stories on retry-stories action', () => {
      document.body.innerHTML =
        '<button data-action="retry-stories">Retry</button>'

      const btn = document.querySelector(
        '[data-action="retry-stories"]',
      ) as HTMLElement
      btn.click()

      expect(mockCallbacks.renderStories).toHaveBeenCalledWith('top')
    })

    it('retries story detail on retry-story action', () => {
      document.body.innerHTML =
        '<button data-action="retry-story">Retry</button>'

      const btn = document.querySelector(
        '[data-action="retry-story"]',
      ) as HTMLElement
      btn.click()

      expect(mockCallbacks.renderStoryDetail).toHaveBeenCalledWith(123)
    })

    it('retries user profile on retry-user action', () => {
      document.body.innerHTML =
        '<button data-action="retry-user">Retry</button>'

      const btn = document.querySelector(
        '[data-action="retry-user"]',
      ) as HTMLElement
      btn.click()

      expect(mockCallbacks.renderUserProfile).toHaveBeenCalledWith('dang')
    })

    it('does not retry story if no current story id', () => {
      ;(
        mockCallbacks.getCurrentStoryId as ReturnType<typeof vi.fn>
      ).mockReturnValue(null)
      document.body.innerHTML =
        '<button data-action="retry-story">Retry</button>'

      const btn = document.querySelector(
        '[data-action="retry-story"]',
      ) as HTMLElement
      btn.click()

      expect(mockCallbacks.renderStoryDetail).not.toHaveBeenCalled()
    })

    it('does not retry user if no current user id', () => {
      ;(
        mockCallbacks.getCurrentUserId as ReturnType<typeof vi.fn>
      ).mockReturnValue(null)
      document.body.innerHTML =
        '<button data-action="retry-user">Retry</button>'

      const btn = document.querySelector(
        '[data-action="retry-user"]',
      ) as HTMLElement
      btn.click()

      expect(mockCallbacks.renderUserProfile).not.toHaveBeenCalled()
    })
  })

  describe('setupActionHandlers', () => {
    beforeEach(() => {
      configureNavigation(mockCallbacks)
      setupActionHandlers()
    })

    describe('toggle-bookmark', () => {
      it('adds bookmark when not bookmarked', async () => {
        mockIsStoryBookmarked.mockReturnValue(false)
        document.body.innerHTML =
          '<button data-action="toggle-bookmark" data-id="123"><span>Bookmark</span></button>'

        const btn = document.querySelector(
          '[data-action="toggle-bookmark"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockBookmarkStory).toHaveBeenCalled()
        })
        expect(mockToastSuccess).toHaveBeenCalledWith('Story bookmarked')
        expect(btn.classList.contains('bookmarked')).toBe(true)
      })

      it('removes bookmark when already bookmarked', async () => {
        mockIsStoryBookmarked.mockReturnValue(true)
        document.body.innerHTML =
          '<button data-action="toggle-bookmark" data-id="123" class="bookmarked"><span>Bookmarked</span></button>'

        const btn = document.querySelector(
          '[data-action="toggle-bookmark"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockRemoveBookmark).toHaveBeenCalledWith(123)
        })
        expect(mockToastInfo).toHaveBeenCalledWith('Bookmark removed')
        expect(btn.classList.contains('bookmarked')).toBe(false)
      })
    })

    describe('toggle-follow', () => {
      it('follows story when not followed', async () => {
        mockIsStoryFollowed.mockReturnValue(false)
        document.body.innerHTML =
          '<button data-action="toggle-follow" data-id="123"><span>Follow</span></button>'

        const btn = document.querySelector(
          '[data-action="toggle-follow"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockFollowStory).toHaveBeenCalled()
        })
        expect(mockToastSuccess).toHaveBeenCalledWith(
          "Following story - you'll be notified of new comments",
        )
        expect(btn.classList.contains('followed')).toBe(true)
      })

      it('unfollows story when already followed', async () => {
        mockIsStoryFollowed.mockReturnValue(true)
        document.body.innerHTML =
          '<button data-action="toggle-follow" data-id="123" class="followed"><span>Following</span></button>'

        const btn = document.querySelector(
          '[data-action="toggle-follow"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockUnfollowStory).toHaveBeenCalledWith(123)
        })
        expect(mockToastInfo).toHaveBeenCalledWith('Stopped following story')
        expect(btn.classList.contains('followed')).toBe(false)
      })
    })

    describe('copy-hn-link', () => {
      it('copies HN link to clipboard', async () => {
        document.body.innerHTML =
          '<button data-action="copy-hn-link" data-id="123">Copy HN Link</button>'

        const btn = document.querySelector(
          '[data-action="copy-hn-link"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockClipboardWriteText).toHaveBeenCalledWith(
            'https://news.ycombinator.com/item?id=123',
          )
        })
        expect(mockToastSuccess).toHaveBeenCalledWith(
          'HN link copied to clipboard',
        )
      })

      it('shows error toast on clipboard failure', async () => {
        mockClipboardWriteText.mockRejectedValue(new Error('Clipboard error'))
        document.body.innerHTML =
          '<button data-action="copy-hn-link" data-id="123">Copy HN Link</button>'

        const btn = document.querySelector(
          '[data-action="copy-hn-link"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockToastError).toHaveBeenCalledWith('Failed to copy link')
        })
      })
    })

    describe('copy-article-link', () => {
      it('copies article link to clipboard', async () => {
        document.body.innerHTML =
          '<button data-action="copy-article-link" data-url="https://example.com/article">Copy Article Link</button>'

        const btn = document.querySelector(
          '[data-action="copy-article-link"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockClipboardWriteText).toHaveBeenCalledWith(
            'https://example.com/article',
          )
        })
        expect(mockToastSuccess).toHaveBeenCalledWith(
          'Article link copied to clipboard',
        )
      })
    })

    describe('share', () => {
      it('uses Web Share API when available', async () => {
        const mockShare = vi.fn().mockResolvedValue(undefined)
        vi.stubGlobal('navigator', {
          ...navigator,
          clipboard: { writeText: mockClipboardWriteText },
          share: mockShare,
        })

        document.body.innerHTML =
          '<button data-action="share" data-id="123" data-title="Test Title" data-url="https://example.com">Share</button>'

        const btn = document.querySelector(
          '[data-action="share"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockShare).toHaveBeenCalledWith({
            title: 'Test Title',
            text: 'Test Title - Hacker News',
            url: 'https://example.com',
          })
        })
      })

      it('falls back to clipboard when Web Share unavailable', async () => {
        vi.stubGlobal('navigator', {
          ...navigator,
          clipboard: { writeText: mockClipboardWriteText },
          share: undefined,
        })

        document.body.innerHTML =
          '<button data-action="share" data-id="123" data-title="Test Title">Share</button>'

        const btn = document.querySelector(
          '[data-action="share"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockClipboardWriteText).toHaveBeenCalledWith(
            'https://news.ycombinator.com/item?id=123',
          )
        })
        expect(mockToastSuccess).toHaveBeenCalledWith(
          'Link copied to clipboard (share not available)',
        )
      })

      it('ignores AbortError from share cancellation', async () => {
        const abortError = new Error('User cancelled')
        abortError.name = 'AbortError'
        const mockShare = vi.fn().mockRejectedValue(abortError)
        vi.stubGlobal('navigator', {
          ...navigator,
          clipboard: { writeText: mockClipboardWriteText },
          share: mockShare,
        })

        document.body.innerHTML =
          '<button data-action="share" data-id="123" data-title="Test">Share</button>'

        const btn = document.querySelector(
          '[data-action="share"]',
        ) as HTMLElement
        btn.click()

        await vi.waitFor(() => {
          expect(mockShare).toHaveBeenCalled()
        })
        expect(mockToastError).not.toHaveBeenCalled()
      })
    })
  })

  describe('setupCommentLinkHandlers', () => {
    beforeEach(() => {
      configureNavigation(mockCallbacks)
      setupCommentLinkHandlers()
    })

    it('navigates to story detail on item link click', () => {
      document.body.innerHTML = '<a href="#item/456">View comments</a>'

      const link = document.querySelector('a') as HTMLAnchorElement
      link.click()

      expect(mockCallbacks.renderStoryDetail).toHaveBeenCalledWith(
        456,
        undefined,
      )
      expect(window.location.hash).toBe('#item/456')
    })

    it('passes clicked story card element when available', () => {
      document.body.innerHTML = `
        <div class="story" data-id="456">
          <a href="#item/456">View comments</a>
        </div>
      `

      const link = document.querySelector('a') as HTMLAnchorElement
      link.click()

      const storyCard = document.querySelector('.story') as HTMLElement
      expect(mockCallbacks.renderStoryDetail).toHaveBeenCalledWith(
        456,
        storyCard,
      )
    })
  })

  describe('setupUserLinkHandlers', () => {
    beforeEach(() => {
      setupUserLinkHandlers()
    })

    it('updates hash on user link click', () => {
      document.body.innerHTML = '<a href="#user/testuser">testuser</a>'

      const link = document.querySelector('a') as HTMLAnchorElement
      link.click()

      expect(window.location.hash).toBe('#user/testuser')
    })

    it('handles encoded user IDs', () => {
      document.body.innerHTML = '<a href="#user/test%20user">test user</a>'

      const link = document.querySelector('a') as HTMLAnchorElement
      link.click()

      expect(window.location.hash).toBe('#user/test%20user')
    })
  })

  describe('setupStoryCardHandlers', () => {
    beforeEach(() => {
      configureNavigation(mockCallbacks)
      setupStoryCardHandlers()
    })

    it('navigates to story detail on card click', () => {
      document.body.innerHTML = `
        <div class="story" data-id="789">
          <div class="story-content">Story content</div>
        </div>
      `

      const content = document.querySelector('.story-content') as HTMLElement
      content.click()

      expect(mockCallbacks.renderStoryDetail).toHaveBeenCalledWith(
        789,
        expect.any(HTMLElement),
      )
      expect(window.location.hash).toBe('#item/789')
    })

    it('does not navigate when clicking on a link', () => {
      document.body.innerHTML = `
        <div class="story" data-id="789">
          <a href="https://example.com">External link</a>
        </div>
      `

      const link = document.querySelector('a') as HTMLAnchorElement
      link.click()

      expect(mockCallbacks.renderStoryDetail).not.toHaveBeenCalled()
    })

    it('does not navigate when clicking on a button', () => {
      document.body.innerHTML = `
        <div class="story" data-id="789">
          <button class="vote-btn">Vote</button>
        </div>
      `

      const btn = document.querySelector('button') as HTMLButtonElement
      btn.click()

      expect(mockCallbacks.renderStoryDetail).not.toHaveBeenCalled()
    })

    it('does not navigate when in detail view', () => {
      ;(
        mockCallbacks.getCurrentView as ReturnType<typeof vi.fn>
      ).mockReturnValue('detail')
      document.body.innerHTML = `
        <div class="story" data-id="789">
          <div class="story-content">Story content</div>
        </div>
      `

      const content = document.querySelector('.story-content') as HTMLElement
      content.click()

      expect(mockCallbacks.renderStoryDetail).not.toHaveBeenCalled()
    })
  })

  describe('handleHashChange', () => {
    beforeEach(() => {
      configureNavigation(mockCallbacks)
    })

    it('navigates to story detail on #item/123 hash', () => {
      window.location.hash = '#item/456'
      handleHashChange()

      expect(mockCallbacks.renderStoryDetail).toHaveBeenCalledWith(456)
    })

    it('navigates to user profile on #user/dang hash', () => {
      window.location.hash = '#user/pg'
      handleHashChange()

      expect(mockCallbacks.renderUserProfile).toHaveBeenCalledWith('pg')
    })

    it('decodes encoded user IDs', () => {
      window.location.hash = '#user/test%20user'
      handleHashChange()

      expect(mockCallbacks.renderUserProfile).toHaveBeenCalledWith('test user')
    })

    it('returns to list view when hash is cleared from detail view', () => {
      ;(
        mockCallbacks.getCurrentView as ReturnType<typeof vi.fn>
      ).mockReturnValue('detail')
      window.location.hash = ''
      handleHashChange()

      expect(mockCallbacks.setCurrentView).toHaveBeenCalledWith('list')
      expect(mockCallbacks.renderStories).toHaveBeenCalledWith('top')
    })

    it('returns to list view when hash is cleared from user view', () => {
      ;(
        mockCallbacks.getCurrentView as ReturnType<typeof vi.fn>
      ).mockReturnValue('user')
      window.location.hash = ''
      handleHashChange()

      expect(mockCallbacks.setCurrentView).toHaveBeenCalledWith('list')
      expect(mockCallbacks.renderStories).toHaveBeenCalledWith('top')
    })

    it('does nothing when hash is cleared and already in list view', () => {
      ;(
        mockCallbacks.getCurrentView as ReturnType<typeof vi.fn>
      ).mockReturnValue('list')
      window.location.hash = ''
      handleHashChange()

      expect(mockCallbacks.setCurrentView).not.toHaveBeenCalled()
      expect(mockCallbacks.renderStories).not.toHaveBeenCalled()
    })
  })

  describe('setupAllNavigation', () => {
    it('sets up all navigation handlers without error', () => {
      document.body.innerHTML = `
        <nav id="nav">
          <button data-feed="top">Top</button>
        </nav>
      `
      configureNavigation(mockCallbacks)

      expect(() => setupAllNavigation()).not.toThrow()
    })
  })
})

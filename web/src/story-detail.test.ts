import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('./api', () => ({
  fetchStoryWithComments: vi.fn(),
  fetchCommentChildren: vi.fn(),
  fetchArticleContent: vi.fn().mockResolvedValue({
    title: 'Article Title',
    content: '<p>Article content</p>',
    textContent: 'Article content',
    byline: 'Author Name',
    excerpt: 'Article excerpt',
    siteName: 'Example Site',
    lang: 'en',
    wordCount: 500,
  }),
  extractDomain: vi
    .fn()
    .mockImplementation((url) =>
      url ? new URL(url).hostname.replace('www.', '') : null,
    ),
  formatTimeAgo: vi.fn().mockReturnValue('1 hour ago'),
}))

vi.mock('./storage', () => ({
  markStoryAsRead: vi.fn(),
  saveStoryCommentCount: vi.fn(),
  isStoryBookmarked: vi.fn().mockReturnValue(false),
  isStoryFollowed: vi.fn().mockReturnValue(false),
  getBookmarkedStoryById: vi.fn(),
}))

vi.mock('./prefetch', () => ({
  getCachedStoryDetail: vi.fn(),
}))

vi.mock('./animations', () => ({
  animateStoriesAway: vi.fn().mockResolvedValue(undefined),
  animateDetailEnter: vi.fn().mockResolvedValue(undefined),
  applyStaggerAnimation: vi.fn(),
}))

vi.mock('./assistant-ui', () => ({
  setStoryContext: vi.fn(),
  updateAssistantZenMode: vi.fn(),
}))

vi.mock('./offline', () => ({
  isCurrentlyOffline: vi.fn().mockReturnValue(false),
}))

vi.mock('./accessibility', () => ({
  announce: vi.fn(),
  escapeAttr: vi.fn().mockImplementation((s) => s),
}))

vi.mock('./errors', () => ({
  parseApiError: vi
    .fn()
    .mockReturnValue({ message: 'Test error', code: 'UNKNOWN' }),
  renderErrorWithRetry: vi
    .fn()
    .mockReturnValue('<div class="error-state">Error occurred</div>'),
  showErrorToast: vi.fn(),
}))

vi.mock('./renderers', () => ({
  renderComment: vi
    .fn()
    .mockImplementation(
      (c, depth, _op) =>
        `<div class="comment" data-id="${c.id}" data-depth="${depth}" data-collapsed="false"><button class="comment-collapse" aria-expanded="true"></button><div class="comment-children"></div></div>`,
    ),
}))

vi.mock('./skeletons', () => ({
  renderCommentSkeletons: vi
    .fn()
    .mockReturnValue('<div class="comment-skeleton">Loading...</div>'),
}))

vi.mock('./zen-mode', () => ({
  isZenModeActive: vi.fn().mockReturnValue(false),
}))

vi.mock('./toast', () => ({
  toastInfo: vi.fn(),
}))

vi.mock('./scroll-utils', () => ({
  restoreStoryScrollPosition: vi.fn(),
  setScrollTop: vi.fn(),
}))

vi.mock('./icons', () => ({
  icons: {
    back: '<svg>back</svg>',
    link: '<svg>link</svg>',
    points: '<svg>points</svg>',
    user: '<svg>user</svg>',
    clock: '<svg>clock</svg>',
    comment: '<svg>comment</svg>',
    book: '<svg>book</svg>',
    bookmark: '<svg>bookmark</svg>',
    bookmarkFilled: '<svg>bookmarkFilled</svg>',
    bell: '<svg>bell</svg>',
    bellFilled: '<svg>bellFilled</svg>',
    copy: '<svg>copy</svg>',
    share: '<svg>share</svg>',
    article: '<svg>article</svg>',
    expand: '<svg>expand</svg>',
    wifiOff: '<svg>wifiOff</svg>',
  },
}))

vi.mock('./utils', () => ({
  escapeHtml: vi.fn().mockImplementation((s) => s || ''),
  sanitizeHtml: vi.fn().mockImplementation((s) => s || ''),
  getScoreHeat: vi.fn().mockReturnValue('warm'),
  getStoryType: vi.fn().mockReturnValue(null),
  calculateReadingTime: vi.fn().mockReturnValue('3 min read'),
  countWords: vi.fn().mockReturnValue(500),
}))

import { announce } from './accessibility'
import {
  animateDetailEnter,
  animateStoriesAway,
  applyStaggerAnimation,
} from './animations'
// Import after mocks
import { fetchCommentChildren, fetchStoryWithComments } from './api'
import { setStoryContext, updateAssistantZenMode } from './assistant-ui'
import { parseApiError, renderErrorWithRetry, showErrorToast } from './errors'
import { isCurrentlyOffline } from './offline'
import { getCachedStoryDetail } from './prefetch'
import { renderComment } from './renderers'
import { restoreStoryScrollPosition, setScrollTop } from './scroll-utils'
import { renderCommentSkeletons } from './skeletons'
import {
  getBookmarkedStoryById,
  isStoryBookmarked,
  isStoryFollowed,
  markStoryAsRead,
  saveStoryCommentCount,
} from './storage'
import {
  getCurrentStoryAuthor,
  getCurrentStoryCommentCount,
  getCurrentStoryData,
  getCurrentStoryId,
  isStoryDetailLoading,
  renderStoryDetail,
  saveAndResetStoryState,
} from './story-detail'
import { toastInfo } from './toast'
import type { CommentWithChildren, HNItem, StoryWithComments } from './types'
import { ItemType } from './types'
import { isZenModeActive } from './zen-mode'

// Typed mocks
const mockFetchStoryWithComments = vi.mocked(fetchStoryWithComments)
const mockFetchCommentChildren = vi.mocked(fetchCommentChildren)
const mockMarkStoryAsRead = vi.mocked(markStoryAsRead)
const mockSaveStoryCommentCount = vi.mocked(saveStoryCommentCount)
const mockIsStoryBookmarked = vi.mocked(isStoryBookmarked)
const mockIsStoryFollowed = vi.mocked(isStoryFollowed)
const mockGetBookmarkedStoryById = vi.mocked(getBookmarkedStoryById)
const mockGetCachedStoryDetail = vi.mocked(getCachedStoryDetail)
const mockAnimateStoriesAway = vi.mocked(animateStoriesAway)
const mockAnimateDetailEnter = vi.mocked(animateDetailEnter)
const mockApplyStaggerAnimation = vi.mocked(applyStaggerAnimation)
const mockSetStoryContext = vi.mocked(setStoryContext)
const mockUpdateAssistantZenMode = vi.mocked(updateAssistantZenMode)
const mockIsCurrentlyOffline = vi.mocked(isCurrentlyOffline)
const mockAnnounce = vi.mocked(announce)
const mockParseApiError = vi.mocked(parseApiError)
const mockRenderErrorWithRetry = vi.mocked(renderErrorWithRetry)
const mockShowErrorToast = vi.mocked(showErrorToast)
const mockRenderComment = vi.mocked(renderComment)
const mockRenderCommentSkeletons = vi.mocked(renderCommentSkeletons)
const _mockIsZenModeActive = vi.mocked(isZenModeActive)
const mockToastInfo = vi.mocked(toastInfo)
const mockRestoreStoryScrollPosition = vi.mocked(restoreStoryScrollPosition)
const _mockSetScrollTop = vi.mocked(setScrollTop)

describe('story-detail', () => {
  let container: HTMLElement

  // Test data
  const mockStory: HNItem = {
    id: 123,
    type: ItemType.Story,
    by: 'author',
    time: Math.floor(Date.now() / 1000) - 3600,
    title: 'Test Story Title',
    url: 'https://example.com/article',
    score: 100,
    descendants: 50,
    text: null,
    kids: [1, 2, 3],
    parent: null,
    dead: false,
    deleted: false,
  }

  const mockStoryWithText: HNItem = {
    ...mockStory,
    id: 456,
    title: 'Ask HN: Test Question',
    url: null,
    text: 'This is a text post with content',
  }

  const mockComments: CommentWithChildren[] = [
    {
      id: 1,
      type: ItemType.Comment,
      by: 'commenter1',
      time: Math.floor(Date.now() / 1000) - 1800,
      title: null,
      url: null,
      score: 10,
      descendants: 0,
      text: 'First comment',
      kids: [10, 11],
      parent: 123,
      dead: false,
      deleted: false,
      children: [],
    },
    {
      id: 2,
      type: ItemType.Comment,
      by: 'commenter2',
      time: Math.floor(Date.now() / 1000) - 900,
      title: null,
      url: null,
      score: 5,
      descendants: 0,
      text: 'Second comment',
      kids: null,
      parent: 123,
      dead: false,
      deleted: false,
      children: [],
    },
  ]

  const mockStoryWithComments: StoryWithComments = {
    story: mockStory,
    comments: mockComments,
  }

  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>'
    container = document.getElementById('container') as HTMLElement
    vi.clearAllMocks()

    // Default mock implementations
    mockFetchStoryWithComments.mockResolvedValue(mockStoryWithComments)
    mockGetCachedStoryDetail.mockReturnValue(null)
    mockIsCurrentlyOffline.mockReturnValue(false)
    mockIsStoryBookmarked.mockReturnValue(false)
    mockIsStoryFollowed.mockReturnValue(false)
    mockGetBookmarkedStoryById.mockReturnValue(null)
  })

  afterEach(() => {
    // Reset module state by rendering a story then navigating away
    saveAndResetStoryState(new Map())
    vi.restoreAllMocks()
  })

  describe('state getters', () => {
    it('getCurrentStoryId returns null initially', () => {
      expect(getCurrentStoryId()).toBeNull()
    })

    it('getCurrentStoryAuthor returns null initially', () => {
      expect(getCurrentStoryAuthor()).toBeNull()
    })

    it('getCurrentStoryData returns null initially', () => {
      expect(getCurrentStoryData()).toBeNull()
    })

    it('getCurrentStoryCommentCount returns null initially', () => {
      expect(getCurrentStoryCommentCount()).toBeNull()
    })

    it('returns values after story loads', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(getCurrentStoryId()).toBe(123)
      expect(getCurrentStoryAuthor()).toBe('author')
      expect(getCurrentStoryData()).toEqual(mockStory)
      expect(getCurrentStoryCommentCount()).toBe(50)
    })
  })

  describe('isStoryDetailLoading', () => {
    it('returns false initially', () => {
      expect(isStoryDetailLoading()).toBe(false)
    })

    it('returns false after loading completes', async () => {
      await renderStoryDetail(123, container, new Set())
      expect(isStoryDetailLoading()).toBe(false)
    })
  })

  describe('saveAndResetStoryState', () => {
    it('saves comment count to storage', async () => {
      await renderStoryDetail(123, container, new Set())

      const commentCountsMap = new Map<number, number>()
      saveAndResetStoryState(commentCountsMap)

      expect(mockSaveStoryCommentCount).toHaveBeenCalledWith(123, 50)
    })

    it('updates commentCountsMap', async () => {
      await renderStoryDetail(123, container, new Set())

      const commentCountsMap = new Map<number, number>()
      saveAndResetStoryState(commentCountsMap)

      expect(commentCountsMap.get(123)).toBe(50)
    })

    it('clears all module state', async () => {
      await renderStoryDetail(123, container, new Set())

      saveAndResetStoryState(new Map())

      expect(getCurrentStoryId()).toBeNull()
      expect(getCurrentStoryAuthor()).toBeNull()
      expect(getCurrentStoryData()).toBeNull()
      expect(getCurrentStoryCommentCount()).toBeNull()
    })
  })

  describe('setupCommentCollapse', () => {
    beforeEach(async () => {
      await renderStoryDetail(123, container, new Set())
    })

    it('toggles collapsed state on button click', async () => {
      // Find a comment collapse button
      const collapseBtn = container.querySelector(
        '.comment-collapse',
      ) as HTMLElement
      const comment = collapseBtn.closest('.comment') as HTMLElement

      expect(comment.dataset.collapsed).toBe('false')

      collapseBtn.click()

      expect(comment.dataset.collapsed).toBe('true')

      collapseBtn.click()

      expect(comment.dataset.collapsed).toBe('false')
    })

    it('updates aria-expanded attribute', async () => {
      const collapseBtn = container.querySelector(
        '.comment-collapse',
      ) as HTMLElement

      expect(collapseBtn.getAttribute('aria-expanded')).toBe('true')

      collapseBtn.click()

      expect(collapseBtn.getAttribute('aria-expanded')).toBe('false')
    })
  })

  describe('renderStoryDetail', () => {
    it('shows skeleton loading state initially', async () => {
      mockFetchStoryWithComments.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockStoryWithComments), 100),
          ),
      )

      const promise = renderStoryDetail(123, container, new Set())

      // Check skeleton is shown
      expect(container.innerHTML).toContain('skeleton')
      expect(mockRenderCommentSkeletons).toHaveBeenCalled()

      await promise
    })

    it('does not apply inline width style to skeleton', async () => {
      // Skeleton should not have inline max-width style - CSS handles both modes
      _mockIsZenModeActive.mockReturnValue(false)

      mockFetchStoryWithComments.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockStoryWithComments), 50),
          ),
      )

      const promise = renderStoryDetail(123, container, new Set())

      // Check skeleton immediately (before async fetch completes)
      const skeletonDetail = container.querySelector('.story-detail')
      expect(skeletonDetail).not.toBeNull()
      // Skeleton should NOT have inline max-width style
      expect(skeletonDetail?.getAttribute('style')).toBeNull()

      // Wait for content to load
      await promise

      // After loading, the content should also not have inline style
      const contentDetail = container.querySelector('.story-detail')
      expect(contentDetail).not.toBeNull()
      expect(contentDetail?.getAttribute('style')).toBeNull()
    })

    it('renders story title', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(container.innerHTML).toContain('Test Story Title')
    })

    it('renders story meta information', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(container.innerHTML).toContain('100 points')
      expect(container.innerHTML).toContain('author')
      expect(container.innerHTML).toContain('1 hour ago')
      expect(container.innerHTML).toContain('50 comments')
    })

    it('renders domain for external URLs', async () => {
      await renderStoryDetail(123, container, new Set())

      // extractDomain is called internally - verify the domain appears in rendered output
      expect(container.innerHTML).toContain('example.com')
    })

    it('renders action buttons', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(container.innerHTML).toContain('data-action="toggle-bookmark"')
      expect(container.innerHTML).toContain('data-action="toggle-follow"')
      expect(container.innerHTML).toContain('data-action="copy-hn-link"')
      expect(container.innerHTML).toContain('data-action="share"')
    })

    it('renders bookmark button as bookmarked when story is bookmarked', async () => {
      mockIsStoryBookmarked.mockReturnValue(true)

      await renderStoryDetail(123, container, new Set())

      const bookmarkBtn = container.querySelector(
        '[data-action="toggle-bookmark"]',
      ) as HTMLElement
      expect(bookmarkBtn.classList.contains('bookmarked')).toBe(true)
    })

    it('renders follow button as followed when story is followed', async () => {
      mockIsStoryFollowed.mockReturnValue(true)

      await renderStoryDetail(123, container, new Set())

      const followBtn = container.querySelector(
        '[data-action="toggle-follow"]',
      ) as HTMLElement
      expect(followBtn.classList.contains('followed')).toBe(true)
    })

    it('renders story tabs', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(container.innerHTML).toContain('data-tab="story"')
      expect(container.innerHTML).toContain('data-tab="comments"')
    })

    it('renders comments section', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(mockRenderComment).toHaveBeenCalledTimes(2)
      expect(container.innerHTML).toContain('comments-list')
    })

    it('shows no comments message when empty', async () => {
      mockFetchStoryWithComments.mockResolvedValue({
        story: mockStory,
        comments: [],
      })

      await renderStoryDetail(123, container, new Set())

      expect(container.innerHTML).toContain('No comments yet')
    })

    it('marks story as read', async () => {
      const readStoryIds = new Set<number>()

      await renderStoryDetail(123, container, readStoryIds)

      expect(mockMarkStoryAsRead).toHaveBeenCalledWith(123)
      expect(readStoryIds.has(123)).toBe(true)
    })

    it('uses cached data from prefetch when available', async () => {
      mockGetCachedStoryDetail.mockReturnValue(mockStoryWithComments)

      await renderStoryDetail(123, container, new Set())

      expect(mockGetCachedStoryDetail).toHaveBeenCalledWith(123)
      // Should not make API call when cached
      expect(mockFetchStoryWithComments).not.toHaveBeenCalled()
    })

    it('sets assistant context', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(mockSetStoryContext).toHaveBeenCalledWith(mockStory, mockComments)
    })

    it('updates assistant zen mode', async () => {
      // Reset zen mode mock to default (false) for this test
      _mockIsZenModeActive.mockReturnValue(false)

      await renderStoryDetail(123, container, new Set())

      expect(mockUpdateAssistantZenMode).toHaveBeenCalledWith(false, 'detail')
    })

    it('restores scroll position', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(mockRestoreStoryScrollPosition).toHaveBeenCalledWith(123)
    })

    it('announces to screen readers', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(mockAnnounce).toHaveBeenCalledWith('Story loaded with 50 comments')
    })

    it('animates story entry', async () => {
      const clickedEl = document.createElement('div')

      await renderStoryDetail(123, container, new Set(), clickedEl)

      expect(mockAnimateStoriesAway).toHaveBeenCalledWith(clickedEl)
      expect(mockAnimateDetailEnter).toHaveBeenCalledWith(container)
    })

    it('applies stagger animation to comments', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(mockApplyStaggerAnimation).toHaveBeenCalled()
    })

    it('renders back button', async () => {
      await renderStoryDetail(123, container, new Set())

      expect(container.innerHTML).toContain('data-action="back"')
      expect(container.innerHTML).toContain('back-btn')
    })

    it('handles text posts (Ask HN)', async () => {
      mockFetchStoryWithComments.mockResolvedValue({
        story: mockStoryWithText,
        comments: [],
      })

      await renderStoryDetail(456, container, new Set())

      expect(container.innerHTML).toContain('This is a text post with content')
    })
  })

  describe('error handling', () => {
    it('handles API error with retry button', async () => {
      const error = new Error('Network error')
      mockFetchStoryWithComments.mockRejectedValue(error)

      await renderStoryDetail(123, container, new Set())

      expect(mockParseApiError).toHaveBeenCalledWith(error)
      expect(mockRenderErrorWithRetry).toHaveBeenCalled()
      expect(container.innerHTML).toContain('error-state')
    })

    it('shows error toast on failure', async () => {
      const error = new Error('Network error')
      mockFetchStoryWithComments.mockRejectedValue(error)

      await renderStoryDetail(123, container, new Set())

      expect(mockShowErrorToast).toHaveBeenCalledWith(error, 'Load story')
    })

    it('announces error to screen readers', async () => {
      mockFetchStoryWithComments.mockRejectedValue(new Error('Network error'))

      await renderStoryDetail(123, container, new Set())

      expect(mockAnnounce).toHaveBeenCalledWith('Error loading story')
    })
  })

  describe('offline mode', () => {
    const bookmarkedStory: HNItem = {
      ...mockStory,
      id: 789,
    }

    beforeEach(() => {
      mockIsCurrentlyOffline.mockReturnValue(true)
      mockGetBookmarkedStoryById.mockReturnValue(bookmarkedStory)
      mockFetchStoryWithComments.mockRejectedValue(new Error('Offline'))
    })

    it('shows cached version for bookmarked stories when offline', async () => {
      await renderStoryDetail(789, container, new Set())

      expect(mockGetBookmarkedStoryById).toHaveBeenCalledWith(789)
      expect(container.innerHTML).toContain('offline-badge')
    })

    it('shows offline notice', async () => {
      await renderStoryDetail(789, container, new Set())

      expect(container.innerHTML).toContain('Viewing cached version')
    })

    it('shows toast info for offline mode', async () => {
      await renderStoryDetail(789, container, new Set())

      expect(mockToastInfo).toHaveBeenCalledWith(
        'Showing cached version (offline)',
      )
    })

    it('announces offline mode to screen readers', async () => {
      await renderStoryDetail(789, container, new Set())

      expect(mockAnnounce).toHaveBeenCalledWith(
        'Showing cached story. You are offline.',
      )
    })

    it('shows notice that comments are unavailable offline', async () => {
      await renderStoryDetail(789, container, new Set())

      expect(container.innerHTML).toContain(
        'Comments are not available while offline',
      )
    })

    it('renders story details from cache', async () => {
      await renderStoryDetail(789, container, new Set())

      expect(container.innerHTML).toContain('Test Story Title')
      expect(container.innerHTML).toContain('100 points')
    })

    it('shows error when not bookmarked and offline', async () => {
      mockGetBookmarkedStoryById.mockReturnValue(null)

      await renderStoryDetail(999, container, new Set())

      expect(container.innerHTML).toContain('error-state')
    })
  })

  describe('concurrent load prevention', () => {
    it('prevents concurrent loads', async () => {
      // Start first load
      const promise1 = renderStoryDetail(123, container, new Set())
      // Try to start second load immediately
      const promise2 = renderStoryDetail(123, container, new Set())

      await Promise.all([promise1, promise2])

      // Should only fetch once
      expect(mockFetchStoryWithComments).toHaveBeenCalledTimes(1)
    })
  })

  describe('load more replies', () => {
    it('handles load more replies button', async () => {
      // Set up a comment with unfetched children
      const commentWithUnfetchedKids: CommentWithChildren = {
        id: 1,
        type: ItemType.Comment,
        by: 'user',
        time: Date.now() / 1000,
        text: 'Parent comment',
        kids: [10, 11, 12],
        score: 5,
        descendants: 3,
        title: null,
        url: null,
        parent: 123,
        dead: false,
        deleted: false,
        children: [],
      }

      mockFetchStoryWithComments.mockResolvedValue({
        story: mockStory,
        comments: [commentWithUnfetchedKids],
      })

      const childComments: CommentWithChildren[] = [
        {
          id: 10,
          type: ItemType.Comment,
          by: 'child1',
          time: Date.now() / 1000,
          text: 'Child 1',
          kids: null,
          score: 1,
          descendants: 0,
          title: null,
          url: null,
          parent: 1,
          dead: false,
          deleted: false,
          children: [],
        },
      ]

      mockFetchCommentChildren.mockResolvedValue(childComments)

      await renderStoryDetail(123, container, new Set())

      // Manually create and click load more button (since renderComment is mocked)
      const loadMoreContainer = document.createElement('div')
      loadMoreContainer.className = 'comment-load-more'
      loadMoreContainer.dataset.parentId = '1'
      loadMoreContainer.dataset.depth = '1'
      loadMoreContainer.dataset.replyCount = '3'
      loadMoreContainer.innerHTML =
        '<button class="load-more-replies-btn">Load 3 replies</button>'

      const comment = container.querySelector('.comment') as HTMLElement
      if (comment) {
        comment.appendChild(loadMoreContainer)
      }

      // Click load more
      const btn = loadMoreContainer.querySelector(
        '.load-more-replies-btn',
      ) as HTMLButtonElement
      btn.click()

      await vi.waitFor(() => {
        expect(mockFetchCommentChildren).toHaveBeenCalledWith(1, 1)
      })
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('./api', () => ({
  fetchUser: vi.fn(),
  fetchUserSubmissions: vi.fn(),
}))

vi.mock('./accessibility', () => ({
  announce: vi.fn(),
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

vi.mock('./skeletons', () => ({
  renderUserProfileSkeleton: vi
    .fn()
    .mockReturnValue('<div class="user-skeleton">Loading...</div>'),
}))

vi.mock('./renderers', () => ({
  renderSubmissionItem: vi
    .fn()
    .mockImplementation(
      (item) =>
        `<div class="submission" data-id="${item.id}">Item ${item.id}</div>`,
    ),
}))

vi.mock('./scroll-utils', () => ({
  setScrollTop: vi.fn(),
}))

vi.mock('./icons', () => ({
  icons: {
    back: '<svg>back</svg>',
    user: '<svg>user</svg>',
    points: '<svg>points</svg>',
    clock: '<svg>clock</svg>',
    comment: '<svg>comment</svg>',
  },
}))

vi.mock('./utils', () => ({
  escapeHtml: vi.fn().mockImplementation((s) => s),
  formatAccountAge: vi.fn().mockReturnValue('1 year'),
  sanitizeHtml: vi.fn().mockImplementation((s) => s),
}))

import { announce } from './accessibility'
// Import after mocks
import { fetchUser, fetchUserSubmissions } from './api'
import { parseApiError, renderErrorWithRetry, showErrorToast } from './errors'
import { renderSubmissionItem } from './renderers'
import { setScrollTop } from './scroll-utils'
import { renderUserProfileSkeleton } from './skeletons'
import type { HNItem, HNUser, ItemType } from './types'
import {
  getCurrentUserId,
  isUserProfileLoading,
  renderUserProfile,
  resetUserProfileState,
} from './user-profile'

// Typed mocks
const mockFetchUser = vi.mocked(fetchUser)
const mockFetchUserSubmissions = vi.mocked(fetchUserSubmissions)
const mockAnnounce = vi.mocked(announce)
const mockParseApiError = vi.mocked(parseApiError)
const mockRenderErrorWithRetry = vi.mocked(renderErrorWithRetry)
const mockShowErrorToast = vi.mocked(showErrorToast)
const mockRenderUserProfileSkeleton = vi.mocked(renderUserProfileSkeleton)
const mockRenderSubmissionItem = vi.mocked(renderSubmissionItem)
const mockSetScrollTop = vi.mocked(setScrollTop)

describe('user-profile', () => {
  let container: HTMLElement

  // Test data
  const mockUser: HNUser = {
    id: 'testuser',
    created: Math.floor(Date.now() / 1000) - 365 * 24 * 3600, // 1 year ago
    karma: 12345,
    about: 'About <b>me</b> and my work',
    submitted: [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ],
  }

  const mockUserNoAbout: HNUser = {
    id: 'newuser',
    created: Math.floor(Date.now() / 1000) - 30 * 24 * 3600, // 30 days ago
    karma: 100,
    about: null,
    submitted: [1, 2, 3],
  }

  const mockSubmissions: HNItem[] = [
    {
      id: 1,
      type: 0 as ItemType, // Story
      by: 'testuser',
      time: Math.floor(Date.now() / 1000) - 3600,
      title: 'Test Story 1',
      url: 'https://example.com/1',
      score: 100,
      descendants: 50,
      text: null,
      kids: null,
      parent: null,
      dead: false,
      deleted: false,
    },
    {
      id: 2,
      type: 1 as ItemType, // Comment
      by: 'testuser',
      time: Math.floor(Date.now() / 1000) - 7200,
      title: null,
      url: null,
      score: 10,
      descendants: 0,
      text: 'A comment',
      kids: null,
      parent: 100,
      dead: false,
      deleted: false,
    },
  ]

  beforeEach(() => {
    document.body.innerHTML = '<div id="container"></div>'
    container = document.getElementById('container') as HTMLElement
    vi.clearAllMocks()

    // Default mock implementations
    mockFetchUser.mockResolvedValue(mockUser)
    mockFetchUserSubmissions.mockResolvedValue({
      items: mockSubmissions,
      hasMore: true,
      total: 21,
    })
  })

  afterEach(() => {
    resetUserProfileState()
    vi.restoreAllMocks()
  })

  describe('getCurrentUserId', () => {
    it('returns null initially', () => {
      expect(getCurrentUserId()).toBeNull()
    })

    it('returns userId after profile loads', async () => {
      await renderUserProfile('testuser', container)
      expect(getCurrentUserId()).toBe('testuser')
    })
  })

  describe('isUserProfileLoading', () => {
    it('returns false initially', () => {
      expect(isUserProfileLoading()).toBe(false)
    })

    it('returns false after loading completes', async () => {
      await renderUserProfile('testuser', container)
      expect(isUserProfileLoading()).toBe(false)
    })
  })

  describe('resetUserProfileState', () => {
    it('clears currentUserId', async () => {
      await renderUserProfile('testuser', container)
      expect(getCurrentUserId()).toBe('testuser')

      resetUserProfileState()
      expect(getCurrentUserId()).toBeNull()
    })
  })

  describe('renderUserProfile', () => {
    it('shows skeleton loading state initially', async () => {
      // Delay the API response to check skeleton
      mockFetchUser.mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(mockUser), 100)),
      )

      const promise = renderUserProfile('testuser', container)

      // Check skeleton is shown
      expect(container.innerHTML).toContain('user-skeleton')
      expect(mockRenderUserProfileSkeleton).toHaveBeenCalled()

      await promise
    })

    it('renders user card with name and karma', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('testuser')
      expect(container.innerHTML).toContain('12,345')
      expect(container.innerHTML).toContain('karma')
    })

    it('renders account age', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('1 year')
    })

    it('renders about section when present', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('About')
      expect(container.innerHTML).toContain('user-about')
    })

    it('does not render about section when absent', async () => {
      mockFetchUser.mockResolvedValue(mockUserNoAbout)

      await renderUserProfile('newuser', container)

      expect(container.innerHTML).not.toContain('user-about')
    })

    it('renders submission tabs (all/stories/comments)', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('data-filter="all"')
      expect(container.innerHTML).toContain('data-filter="stories"')
      expect(container.innerHTML).toContain('data-filter="comments"')
    })

    it('renders submissions list', async () => {
      await renderUserProfile('testuser', container)

      expect(mockRenderSubmissionItem).toHaveBeenCalledTimes(2)
      expect(container.innerHTML).toContain('submissions-list')
    })

    it('shows load more button when user has more submissions', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('load-more-submissions-btn')
    })

    it('does not show load more button when few submissions', async () => {
      mockFetchUser.mockResolvedValue(mockUserNoAbout)
      mockFetchUserSubmissions.mockResolvedValue({
        items: mockSubmissions,
        hasMore: false,
        total: 3,
      })

      await renderUserProfile('newuser', container)

      expect(container.innerHTML).not.toContain('load-more-submissions-btn')
    })

    it('shows no submissions message when empty', async () => {
      mockFetchUserSubmissions.mockResolvedValue({
        items: [],
        hasMore: false,
        total: 0,
      })

      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('No submissions yet')
    })

    it('scrolls to top after rendering', async () => {
      await renderUserProfile('testuser', container)

      expect(mockSetScrollTop).toHaveBeenCalledWith(0)
    })

    it('announces to screen readers', async () => {
      await renderUserProfile('testuser', container)

      expect(mockAnnounce).toHaveBeenCalledWith(
        'User profile loaded for testuser',
      )
    })

    it('handles API error with retry button', async () => {
      const error = new Error('Network error')
      mockFetchUser.mockRejectedValue(error)

      await renderUserProfile('testuser', container)

      expect(mockParseApiError).toHaveBeenCalledWith(error)
      expect(mockRenderErrorWithRetry).toHaveBeenCalled()
      expect(container.innerHTML).toContain('error-state')
    })

    it('shows error toast on failure', async () => {
      const error = new Error('Network error')
      mockFetchUser.mockRejectedValue(error)

      await renderUserProfile('testuser', container)

      expect(mockShowErrorToast).toHaveBeenCalledWith(error, 'Load user')
    })

    it('announces error to screen readers', async () => {
      mockFetchUser.mockRejectedValue(new Error('Network error'))

      await renderUserProfile('testuser', container)

      expect(mockAnnounce).toHaveBeenCalledWith('Error loading user profile')
    })

    it('prevents concurrent loads', async () => {
      // Start first load
      const promise1 = renderUserProfile('testuser', container)
      // Try to start second load immediately
      const promise2 = renderUserProfile('testuser', container)

      await Promise.all([promise1, promise2])

      // Should only fetch once
      expect(mockFetchUser).toHaveBeenCalledTimes(1)
    })

    it('includes back button', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('data-action="back"')
      expect(container.innerHTML).toContain('back-btn')
    })

    it('renders join date', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('Member since')
    })

    it('renders submission count', async () => {
      await renderUserProfile('testuser', container)

      expect(container.innerHTML).toContain('21')
      expect(container.innerHTML).toContain('submissions')
    })
  })

  describe('tab switching', () => {
    it('updates active tab on click', async () => {
      await renderUserProfile('testuser', container)

      const storiesTab = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab.click()

      await vi.waitFor(() => {
        expect(storiesTab.classList.contains('active')).toBe(true)
      })

      const allTab = container.querySelector(
        '[data-filter="all"]',
      ) as HTMLElement
      expect(allTab.classList.contains('active')).toBe(false)
    })

    it('reloads submissions with filter', async () => {
      await renderUserProfile('testuser', container)
      vi.clearAllMocks()

      const storiesTab = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab.click()

      await vi.waitFor(() => {
        expect(mockFetchUserSubmissions).toHaveBeenCalledWith(
          'testuser',
          0,
          20,
          'stories',
        )
      })
    })

    it('shows loading state during filter change', async () => {
      mockFetchUserSubmissions.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  items: mockSubmissions,
                  hasMore: false,
                  total: 2,
                }),
              100,
            ),
          ),
      )

      await renderUserProfile('testuser', container)

      const storiesTab = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab.click()

      // Check loading state
      await vi.waitFor(() => {
        const list = container.querySelector('.submissions-list')
        expect(list?.innerHTML).toContain('loading')
      })
    })

    it('handles filter error gracefully', async () => {
      await renderUserProfile('testuser', container)

      mockFetchUserSubmissions.mockRejectedValue(new Error('Filter error'))

      const storiesTab = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab.click()

      await vi.waitFor(() => {
        const list = container.querySelector('.submissions-list')
        expect(list?.innerHTML).toContain('Failed to load submissions')
      })
    })

    it('shows empty state for filtered results', async () => {
      await renderUserProfile('testuser', container)

      mockFetchUserSubmissions.mockResolvedValue({
        items: [],
        hasMore: false,
        total: 0,
      })

      const storiesTab = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab.click()

      await vi.waitFor(() => {
        expect(container.innerHTML).toContain('No stories yet')
      })
    })

    it('updates list data attributes after filter', async () => {
      await renderUserProfile('testuser', container)

      const storiesTab = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab.click()

      await vi.waitFor(() => {
        const list = container.querySelector('.submissions-list') as HTMLElement
        expect(list.dataset.filter).toBe('stories')
      })
    })
  })

  describe('load more', () => {
    it('loads additional submissions on button click', async () => {
      await renderUserProfile('testuser', container)
      vi.clearAllMocks()

      const loadMoreBtn = container.querySelector(
        '.load-more-submissions-btn',
      ) as HTMLButtonElement
      loadMoreBtn.click()

      await vi.waitFor(() => {
        expect(mockFetchUserSubmissions).toHaveBeenCalledWith(
          'testuser',
          20, // offset
          20, // limit
          'all', // filter
        )
      })
    })

    it('disables button while loading', async () => {
      mockFetchUserSubmissions.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  items: mockSubmissions,
                  hasMore: true,
                  total: 21,
                }),
              100,
            ),
          ),
      )

      await renderUserProfile('testuser', container)

      const loadMoreBtn = container.querySelector(
        '.load-more-submissions-btn',
      ) as HTMLButtonElement
      loadMoreBtn.click()

      expect(loadMoreBtn.disabled).toBe(true)
      expect(loadMoreBtn.textContent).toBe('Loading...')
    })

    it('updates offset after loading more', async () => {
      await renderUserProfile('testuser', container)

      const loadMoreBtn = container.querySelector(
        '.load-more-submissions-btn',
      ) as HTMLButtonElement
      loadMoreBtn.click()

      await vi.waitFor(() => {
        const list = container.querySelector('.submissions-list') as HTMLElement
        expect(list.dataset.offset).toBe('40')
      })
    })

    it('appends new submissions to list', async () => {
      await renderUserProfile('testuser', container)

      const additionalSubmissions: HNItem[] = [
        {
          id: 100,
          type: 0 as ItemType,
          by: 'testuser',
          time: Math.floor(Date.now() / 1000),
          title: 'New Story',
          url: 'https://example.com/new',
          score: 50,
          descendants: 10,
          text: null,
          kids: null,
          parent: null,
          dead: false,
          deleted: false,
        },
      ]

      mockFetchUserSubmissions.mockResolvedValue({
        items: additionalSubmissions,
        hasMore: false,
        total: 21,
      })

      const loadMoreBtn = container.querySelector(
        '.load-more-submissions-btn',
      ) as HTMLButtonElement
      loadMoreBtn.click()

      await vi.waitFor(() => {
        expect(container.innerHTML).toContain('data-id="100"')
      })
    })

    it('removes load more button when no more items', async () => {
      await renderUserProfile('testuser', container)

      mockFetchUserSubmissions.mockResolvedValue({
        items: [],
        hasMore: false,
        total: 21,
      })

      const loadMoreBtn = container.querySelector(
        '.load-more-submissions-btn',
      ) as HTMLButtonElement
      loadMoreBtn.click()

      await vi.waitFor(() => {
        expect(container.querySelector('.load-more-submissions-btn')).toBeNull()
      })
    })

    it('handles load more error', async () => {
      await renderUserProfile('testuser', container)

      mockFetchUserSubmissions.mockRejectedValue(new Error('Load more error'))

      const loadMoreBtn = container.querySelector(
        '.load-more-submissions-btn',
      ) as HTMLButtonElement
      loadMoreBtn.click()

      await vi.waitFor(() => {
        expect(loadMoreBtn.textContent).toBe('Failed. Retry?')
        expect(loadMoreBtn.disabled).toBe(false)
      })
    })

    it('respects current filter when loading more', async () => {
      await renderUserProfile('testuser', container)

      // Switch to stories filter
      const storiesTab = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab.click()

      await vi.waitFor(() => {
        const list = container.querySelector('.submissions-list') as HTMLElement
        expect(list.dataset.filter).toBe('stories')
      })

      vi.clearAllMocks()

      // Mock load more button being present after filter
      mockFetchUserSubmissions.mockResolvedValue({
        items: mockSubmissions,
        hasMore: true,
        total: 21,
      })

      // Re-render with load more button
      await renderUserProfile('testuser', container)
      const storiesTab2 = container.querySelector(
        '[data-filter="stories"]',
      ) as HTMLElement
      storiesTab2.click()

      await vi.waitFor(() => {
        expect(mockFetchUserSubmissions).toHaveBeenCalledWith(
          'testuser',
          0,
          20,
          'stories',
        )
      })
    })
  })
})

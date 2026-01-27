import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies before importing story-list
vi.mock('./api', () => ({
  fetchStoriesPaginated: vi.fn(),
  clearStoryIdsCache: vi.fn(),
}))

vi.mock('./storage', () => ({
  getReadStoryIds: vi.fn(() => new Set()),
  getCommentCountsMap: vi.fn(() => new Map()),
  getBookmarkedStories: vi.fn(() => []),
  saveFeedScrollPosition: vi.fn(),
  clearFeedScrollPosition: vi.fn(),
  getNewCommentsCount: vi.fn(() => 0),
  getStoryTrendingLevel: vi.fn(() => null),
  saveStoryScore: vi.fn(),
}))

vi.mock('./scroll-utils', () => ({
  getScrollTop: vi.fn(() => 0),
  setScrollTop: vi.fn(),
  restoreFeedScrollPosition: vi.fn(),
}))

vi.mock('./keyboard', () => ({
  resetSelection: vi.fn(),
}))

vi.mock('./prefetch', () => ({
  clearPrefetchCache: vi.fn(),
  onStoryHoverStart: vi.fn(),
  onStoryHoverEnd: vi.fn(),
  prefetchNextPage: vi.fn(),
  prefetchVisibleStories: vi.fn(),
}))

vi.mock('./animations', () => ({
  animateListEnter: vi.fn(() => Promise.resolve()),
  applyStaggerAnimation: vi.fn(),
}))

vi.mock('./accessibility', () => ({
  announce: vi.fn(),
}))

vi.mock('./skeletons', () => ({
  renderStorySkeletons: vi.fn(() => '<div class="skeleton"></div>'),
}))

vi.mock('./renderers', () => ({
  renderStory: vi.fn(() => '<div class="story"></div>'),
  renderLoadMoreIndicator: vi.fn(() => '<div class="load-more"></div>'),
}))

vi.mock('./errors', () => ({
  parseApiError: vi.fn((e) => ({ message: e.message, code: 'UNKNOWN' })),
  renderErrorWithRetry: vi.fn(() => '<div class="error"></div>'),
  showErrorToast: vi.fn(),
}))

vi.mock('./favicon', () => ({
  observeNewFavicons: vi.fn(),
}))

vi.mock('./duplicates', () => ({
  findDuplicates: vi.fn(() => new Map()),
}))

vi.mock('./assistant-ui', () => ({
  updateAssistantZenMode: vi.fn(),
}))

vi.mock('./zen-mode', () => ({
  isZenModeActive: vi.fn(() => false),
}))

import { fetchStoriesPaginated } from './api'
import {
  getCurrentFeed,
  getCurrentStories,
  getFeedTitle,
  renderStories,
  setCurrentFeed,
} from './story-list'
import type { StoryFeed } from './types'

const mockFetchStoriesPaginated = vi.mocked(fetchStoriesPaginated)

describe('getFeedTitle', () => {
  it('returns correct title for top feed', () => {
    expect(getFeedTitle('top')).toBe('Top Stories')
  })

  it('returns correct title for new feed', () => {
    expect(getFeedTitle('new')).toBe('New Stories')
  })

  it('returns correct title for best feed', () => {
    expect(getFeedTitle('best')).toBe('Best Stories')
  })

  it('returns correct title for ask feed', () => {
    expect(getFeedTitle('ask')).toBe('Ask HN')
  })

  it('returns correct title for show feed', () => {
    expect(getFeedTitle('show')).toBe('Show HN')
  })

  it('returns correct title for jobs feed', () => {
    expect(getFeedTitle('jobs')).toBe('Jobs')
  })

  it('returns correct title for saved feed', () => {
    expect(getFeedTitle('saved')).toBe('Saved Stories')
  })

  it('returns titles for all feed types', () => {
    const feeds: StoryFeed[] = [
      'top',
      'new',
      'best',
      'ask',
      'show',
      'jobs',
      'saved',
    ]
    for (const feed of feeds) {
      const title = getFeedTitle(feed)
      expect(title).toBeTruthy()
      expect(typeof title).toBe('string')
      expect(title.length).toBeGreaterThan(0)
    }
  })
})

describe('renderStories caching', () => {
  const mockStories = [
    {
      id: 1,
      type: 'story' as const,
      by: 'user1',
      time: 1700000000,
      title: 'Test Story 1',
      score: 100,
      descendants: 10,
      kids: [],
      url: 'https://example.com/1',
    },
    {
      id: 2,
      type: 'story' as const,
      by: 'user2',
      time: 1700000001,
      title: 'Test Story 2',
      score: 50,
      descendants: 5,
      kids: [],
      url: 'https://example.com/2',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Set up DOM
    document.body.innerHTML = '<div id="stories"></div>'

    // Reset module state by setting feed
    setCurrentFeed('top')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('reuses cached stories when returning from detail view', async () => {
    mockFetchStoriesPaginated.mockResolvedValue({
      stories: mockStories,
      hasMore: true,
    })

    // Initial render - fetches stories
    await renderStories('top', false, false)

    expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(1)
    expect(getCurrentStories()).toEqual(mockStories)

    // Clear mock to track new calls
    mockFetchStoriesPaginated.mockClear()

    // Return from detail view (animateIn=true) - should use cache
    await renderStories('top', false, true)

    expect(mockFetchStoriesPaginated).not.toHaveBeenCalled()
    expect(getCurrentStories()).toEqual(mockStories)
  })

  it('does not use cache on explicit refresh', async () => {
    const initialStories = [mockStories[0]]
    const refreshedStories = mockStories

    mockFetchStoriesPaginated.mockResolvedValueOnce({
      stories: initialStories,
      hasMore: true,
    })

    // Initial render
    await renderStories('top', false, false)
    expect(getCurrentStories()).toEqual(initialStories)

    mockFetchStoriesPaginated.mockResolvedValueOnce({
      stories: refreshedStories,
      hasMore: true,
    })

    // Refresh with animateIn=true - should still fetch
    await renderStories('top', true, true)

    expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(2)
    expect(getCurrentStories()).toEqual(refreshedStories)
  })

  it('does not use cache when switching feeds', async () => {
    mockFetchStoriesPaginated.mockResolvedValue({
      stories: mockStories,
      hasMore: true,
    })

    // Initial render of 'top' feed
    await renderStories('top', false, false)
    expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(1)

    mockFetchStoriesPaginated.mockClear()

    // Switch to 'new' feed with animateIn=true - should fetch
    await renderStories('new', false, true)

    expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(1)
    expect(getCurrentFeed()).toBe('new')
  })

  it('does not use cache when switching to different feed even with animateIn', async () => {
    mockFetchStoriesPaginated.mockResolvedValue({
      stories: mockStories,
      hasMore: true,
    })

    // Render 'top' feed first
    await renderStories('top', false, false)
    expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(1)

    mockFetchStoriesPaginated.mockClear()

    // Now try 'best' feed with animateIn - must fetch because different feed
    await renderStories('best', false, true)

    expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(1)
    expect(getCurrentFeed()).toBe('best')
  })

  it('preserves pagination state when using cached stories', async () => {
    const manyStories = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      type: 'story' as const,
      by: `user${i}`,
      time: 1700000000 + i,
      title: `Story ${i + 1}`,
      score: 100 - i,
      descendants: 10,
      kids: [],
      url: `https://example.com/${i}`,
    }))

    mockFetchStoriesPaginated.mockResolvedValue({
      stories: manyStories,
      hasMore: true,
    })

    // Initial render
    await renderStories('top', false, false)
    expect(getCurrentStories().length).toBe(30)

    mockFetchStoriesPaginated.mockClear()

    // Return from detail - should preserve stories
    await renderStories('top', false, true)

    expect(mockFetchStoriesPaginated).not.toHaveBeenCalled()
    expect(getCurrentStories().length).toBe(30)
  })
})

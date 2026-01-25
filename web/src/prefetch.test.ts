import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the api module
vi.mock('./api', () => ({
  fetchStoryWithComments: vi.fn(),
  fetchStoriesPaginated: vi.fn(),
}))

import { fetchStoriesPaginated, fetchStoryWithComments } from './api'
import {
  clearPrefetchCache,
  getCachedNextPage,
  getCachedStoryDetail,
  getPrefetchStats,
  isStoryCached,
  onStoryHoverEnd,
  onStoryHoverStart,
  prefetchNextPage,
  prefetchStoryDetail,
  prefetchVisibleStories,
} from './prefetch'

const mockFetchStoryWithComments = vi.mocked(fetchStoryWithComments)
const mockFetchStoriesPaginated = vi.mocked(fetchStoriesPaginated)

describe('prefetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    clearPrefetchCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('prefetchStoryDetail', () => {
    it('fetches and caches story details', async () => {
      const mockStory = {
        story: {
          id: 123,
          type: 0,
          by: 'user1',
          time: 1700000000,
          title: 'Test Story',
          score: 100,
          descendants: 50,
          kids: [],
          url: 'https://example.com',
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValueOnce(mockStory)

      await prefetchStoryDetail(123)

      expect(mockFetchStoryWithComments).toHaveBeenCalledWith(123, 1)
      expect(isStoryCached(123)).toBe(true)
      expect(getCachedStoryDetail(123)).toEqual(mockStory)
    })

    it('does not fetch if already cached', async () => {
      const mockStory = {
        story: {
          id: 456,
          type: 0,
          by: 'user2',
          time: 1700000000,
          title: 'Another Story',
          score: 50,
          descendants: 10,
          kids: [],
          url: null,
          text: 'Text post',
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      // First call should fetch
      await prefetchStoryDetail(456)
      expect(mockFetchStoryWithComments).toHaveBeenCalledTimes(1)

      // Second call should skip
      await prefetchStoryDetail(456)
      expect(mockFetchStoryWithComments).toHaveBeenCalledTimes(1)
    })

    it('handles fetch errors silently', async () => {
      mockFetchStoryWithComments.mockRejectedValueOnce(
        new Error('Network error'),
      )

      // Should not throw
      await expect(prefetchStoryDetail(789)).resolves.toBeUndefined()
      expect(isStoryCached(789)).toBe(false)
    })
  })

  describe('onStoryHoverStart/End', () => {
    it('triggers prefetch after delay on hover', async () => {
      const mockStory = {
        story: {
          id: 100,
          type: 0,
          by: 'user',
          time: 1700000000,
          title: 'Hover Story',
          score: 10,
          descendants: 0,
          kids: [],
          url: null,
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      onStoryHoverStart(100)

      // Should not fetch immediately
      expect(mockFetchStoryWithComments).not.toHaveBeenCalled()

      // Advance time past the delay (150ms)
      vi.advanceTimersByTime(200)
      await vi.runAllTimersAsync()

      expect(mockFetchStoryWithComments).toHaveBeenCalledWith(100, 1)
    })

    it('cancels prefetch when hover ends before delay', () => {
      onStoryHoverStart(200)

      // End hover before delay completes
      vi.advanceTimersByTime(100)
      onStoryHoverEnd(200)

      // Advance past the original delay
      vi.advanceTimersByTime(100)

      expect(mockFetchStoryWithComments).not.toHaveBeenCalled()
    })

    it('skips prefetch for already cached stories', () => {
      const mockStory = {
        story: {
          id: 300,
          type: 0,
          by: 'user',
          time: 1700000000,
          title: 'Cached Story',
          score: 10,
          descendants: 0,
          kids: [],
          url: null,
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      // Pre-cache the story
      prefetchStoryDetail(300)
      vi.runAllTimers()

      // Clear mock to track new calls
      mockFetchStoryWithComments.mockClear()

      // Hover should not trigger new fetch
      onStoryHoverStart(300)
      vi.advanceTimersByTime(200)

      expect(mockFetchStoryWithComments).not.toHaveBeenCalled()
    })
  })

  describe('prefetchNextPage', () => {
    it('fetches and caches next page of stories', async () => {
      const mockResponse = {
        stories: [
          {
            id: 1,
            type: 0,
            by: 'user',
            time: 1700000000,
            title: 'Story 1',
            score: 10,
            descendants: 0,
            kids: [],
            url: null,
            text: null,
            parent: null,
            dead: false,
            deleted: false,
          },
          {
            id: 2,
            type: 0,
            by: 'user',
            time: 1700000000,
            title: 'Story 2',
            score: 20,
            descendants: 0,
            kids: [],
            url: null,
            text: null,
            parent: null,
            dead: false,
            deleted: false,
          },
        ],
        hasMore: true,
      }

      mockFetchStoriesPaginated.mockResolvedValueOnce(mockResponse)

      await prefetchNextPage('top', 0, 30)

      expect(mockFetchStoriesPaginated).toHaveBeenCalledWith('top', 30, 30)

      const cached = getCachedNextPage('top', 30)
      expect(cached).toEqual(mockResponse)
    })

    it('does not fetch if already cached', async () => {
      const mockResponse = {
        stories: [
          {
            id: 1,
            type: 0,
            by: 'user',
            time: 1700000000,
            title: 'Story',
            score: 10,
            descendants: 0,
            kids: [],
            url: null,
            text: null,
            parent: null,
            dead: false,
            deleted: false,
          },
        ],
        hasMore: false,
      }

      mockFetchStoriesPaginated.mockResolvedValue(mockResponse)

      await prefetchNextPage('new', 0, 30)
      expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(1)

      // Second call should skip
      await prefetchNextPage('new', 0, 30)
      expect(mockFetchStoriesPaginated).toHaveBeenCalledTimes(1)
    })

    it('handles fetch errors silently', async () => {
      mockFetchStoriesPaginated.mockRejectedValueOnce(
        new Error('Network error'),
      )

      await expect(prefetchNextPage('best', 30, 30)).resolves.toBeUndefined()
      expect(getCachedNextPage('best', 60)).toBeNull()
    })
  })

  describe('prefetchVisibleStories', () => {
    it('schedules prefetch for visible stories during idle time', async () => {
      const mockStory = {
        story: {
          id: 500,
          type: 0,
          by: 'user',
          time: 1700000000,
          title: 'Visible Story',
          score: 10,
          descendants: 0,
          kids: [],
          url: null,
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      prefetchVisibleStories([500, 501, 502])

      // Advance through the setTimeout fallback and staggered delays
      vi.advanceTimersByTime(50) // Initial idle callback delay
      vi.advanceTimersByTime(300) // Staggered delays (0, 100, 200ms)
      await vi.runAllTimersAsync()

      // Should have called for uncached stories
      expect(mockFetchStoryWithComments).toHaveBeenCalled()
    })

    it('limits prefetch to first 5 stories', async () => {
      const mockStory = {
        story: {
          id: 1,
          type: 0,
          by: 'user',
          time: 1700000000,
          title: 'Story',
          score: 10,
          descendants: 0,
          kids: [],
          url: null,
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      prefetchVisibleStories([1, 2, 3, 4, 5, 6, 7, 8])

      vi.advanceTimersByTime(50)
      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      // Should only call for first 5
      expect(mockFetchStoryWithComments.mock.calls.length).toBeLessThanOrEqual(
        5,
      )
    })

    it('skips already cached stories', async () => {
      const mockStory = {
        story: {
          id: 600,
          type: 0,
          by: 'user',
          time: 1700000000,
          title: 'Cached Visible',
          score: 10,
          descendants: 0,
          kids: [],
          url: null,
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      // Pre-cache story 600
      await prefetchStoryDetail(600)
      mockFetchStoryWithComments.mockClear()

      prefetchVisibleStories([600, 601])

      vi.advanceTimersByTime(200)
      await vi.runAllTimersAsync()

      // Should only fetch 601, not 600 (cached)
      const calls = mockFetchStoryWithComments.mock.calls
      expect(calls.some((c) => c[0] === 600)).toBe(false)
    })
  })

  describe('clearPrefetchCache', () => {
    it('clears all cached data', async () => {
      const mockStory = {
        story: {
          id: 700,
          type: 0,
          by: 'user',
          time: 1700000000,
          title: 'To Clear',
          score: 10,
          descendants: 0,
          kids: [],
          url: null,
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      await prefetchStoryDetail(700)
      expect(isStoryCached(700)).toBe(true)

      clearPrefetchCache()

      expect(isStoryCached(700)).toBe(false)
      expect(getCachedStoryDetail(700)).toBeNull()
    })
  })

  describe('getPrefetchStats', () => {
    it('returns correct statistics', async () => {
      const mockStory = {
        story: {
          id: 800,
          type: 0,
          by: 'user',
          time: 1700000000,
          title: 'Stats Story',
          score: 10,
          descendants: 0,
          kids: [],
          url: null,
          text: null,
          parent: null,
          dead: false,
          deleted: false,
        },
        comments: [],
      }

      mockFetchStoryWithComments.mockResolvedValue(mockStory)

      const initialStats = getPrefetchStats()
      expect(initialStats.cachedStories).toBe(0)
      expect(initialStats.cachedPages).toBe(0)

      await prefetchStoryDetail(800)

      const afterStats = getPrefetchStats()
      expect(afterStats.cachedStories).toBe(1)
    })
  })
})

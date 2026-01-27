import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Tauri's invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import {
  clearCache,
  clearInFlightRequests,
  extractDomain,
  fetchArticleContent,
  fetchItem,
  fetchItems,
  fetchStoriesPaginated,
  fetchStoryWithComments,
  fetchUser,
  fetchUserSubmissions,
  formatTimeAgo,
  getCacheStats,
  getInFlightRequestCount,
  searchHN,
} from './api'

const mockInvoke = vi.mocked(invoke)

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInFlightRequests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearInFlightRequests()
  })

  describe('fetchUser', () => {
    it('fetches and returns user data', async () => {
      const mockUser = {
        id: 'dang',
        created: 1309740055,
        karma: 12345,
        about: 'HN moderator',
        submitted: [123, 456, 789],
      }

      mockInvoke.mockResolvedValueOnce(mockUser)

      const user = await fetchUser('dang')

      expect(mockInvoke).toHaveBeenCalledWith('fetch_user', { id: 'dang' })
      expect(user).toEqual(mockUser)
    })

    it('handles user with null fields', async () => {
      const mockUser = {
        id: 'newuser',
        created: 1600000000,
        karma: 1,
        about: null,
        submitted: null,
      }

      mockInvoke.mockResolvedValueOnce(mockUser)

      const user = await fetchUser('newuser')

      expect(user.about).toBeNull()
      expect(user.submitted).toBeNull()
    })

    it('throws on invoke error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('User not found: nonexistent'))

      await expect(fetchUser('nonexistent')).rejects.toThrow('User not found')
    })
  })

  describe('fetchItem', () => {
    it('fetches item data via Tauri command', async () => {
      const mockItem = {
        id: 123,
        type: 0, // Story
        by: 'user1',
        time: 1700000000,
        title: 'Test Story',
        score: 100,
        descendants: 50,
        kids: [456, 789],
        url: null,
        text: null,
        parent: null,
        dead: false,
        deleted: false,
      }

      mockInvoke.mockResolvedValueOnce(mockItem)

      const item = await fetchItem(123)

      expect(mockInvoke).toHaveBeenCalledWith('fetch_item', { id: 123 })
      expect(item.id).toBe(123)
      expect(item.title).toBe('Test Story')
      expect(item.by).toBe('user1')
    })
  })

  describe('fetchStoriesPaginated', () => {
    it('fetches paginated stories', async () => {
      const mockResponse = {
        stories: [
          { id: 1, title: 'Story 1', type: 0 },
          { id: 2, title: 'Story 2', type: 0 },
        ],
        hasMore: true,
        total: 500,
      }

      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await fetchStoriesPaginated('top', 0, 30)

      expect(mockInvoke).toHaveBeenCalledWith('fetch_stories', {
        feed: 'top',
        offset: 0,
        limit: 30,
      })
      expect(result.stories).toHaveLength(2)
      expect(result.hasMore).toBe(true)
      expect(result.total).toBe(500)
    })
  })

  describe('fetchStoryWithComments', () => {
    it('fetches story and its comments with depth', async () => {
      const mockResponse = {
        story: {
          id: 100,
          type: 0,
          by: 'author',
          time: 1700000000,
          title: 'Test Story',
          score: 50,
          descendants: 3,
          kids: [101, 102],
        },
        comments: [
          {
            id: 101,
            type: 1,
            by: 'commenter1',
            time: 1700000100,
            text: 'First comment',
            parent: 100,
            kids: [103],
            children: [
              {
                id: 103,
                type: 1,
                by: 'commenter3',
                time: 1700000300,
                text: 'Nested reply',
                parent: 101,
                children: [],
              },
            ],
          },
          {
            id: 102,
            type: 1,
            by: 'commenter2',
            time: 1700000200,
            text: 'Second comment',
            parent: 100,
            children: [],
          },
        ],
      }

      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await fetchStoryWithComments(100, 2)

      expect(mockInvoke).toHaveBeenCalledWith('fetch_story_with_comments', {
        id: 100,
        depth: 2,
      })
      expect(result.story.id).toBe(100)
      expect(result.story.title).toBe('Test Story')
      expect(result.comments).toHaveLength(2)
      expect(result.comments[0].id).toBe(101)
      expect(result.comments[0].children).toHaveLength(1)
      expect(result.comments[0].children?.[0].id).toBe(103)
      expect(result.comments[1].id).toBe(102)
    })

    it('returns empty comments for story with no kids', async () => {
      const mockResponse = {
        story: {
          id: 200,
          type: 0,
          by: 'author',
          time: 1700000000,
          title: 'Story without comments',
          score: 10,
          descendants: 0,
        },
        comments: [],
      }

      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await fetchStoryWithComments(200)

      expect(result.story.id).toBe(200)
      expect(result.comments).toHaveLength(0)
    })
  })

  describe('searchHN', () => {
    it('searches with default options', async () => {
      const mockResponse = {
        hits: [
          { id: 1, title: 'Result 1', type: 'story' },
          { id: 2, title: 'Result 2', type: 'story' },
        ],
        nbHits: 100,
        page: 0,
        nbPages: 5,
        hitsPerPage: 20,
        query: 'test',
      }

      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await searchHN('test')

      expect(mockInvoke).toHaveBeenCalledWith('search_hn', {
        query: 'test',
        page: 0,
        hitsPerPage: 20,
        sort: 'relevance',
        filter: 'all',
      })
      expect(result.hits).toHaveLength(2)
      expect(result.nbHits).toBe(100)
    })

    it('searches with custom options', async () => {
      const mockResponse = {
        hits: [],
        nbHits: 0,
        page: 2,
        nbPages: 3,
        hitsPerPage: 50,
        query: 'rust',
      }

      mockInvoke.mockResolvedValueOnce(mockResponse)

      await searchHN('rust', {
        page: 2,
        hitsPerPage: 50,
        sort: 'date',
        filter: 'story',
      })

      expect(mockInvoke).toHaveBeenCalledWith('search_hn', {
        query: 'rust',
        page: 2,
        hitsPerPage: 50,
        sort: 'date',
        filter: 'story',
      })
    })
  })

  describe('clearCache', () => {
    it('invokes clear_cache command', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)

      await clearCache()

      expect(mockInvoke).toHaveBeenCalledWith('clear_cache')
    })
  })

  describe('getCacheStats', () => {
    it('invokes get_cache_stats command and returns stats', async () => {
      const mockStats = {
        itemCount: 100,
        storyIdsCount: 5,
        userCount: 10,
        itemTtlSecs: 300,
        storyIdsTtlSecs: 120,
        userTtlSecs: 600,
      }

      mockInvoke.mockResolvedValueOnce(mockStats)

      const stats = await getCacheStats()

      expect(mockInvoke).toHaveBeenCalledWith('get_cache_stats')
      expect(stats).toEqual(mockStats)
      expect(stats.itemCount).toBe(100)
      expect(stats.storyIdsCount).toBe(5)
      expect(stats.userCount).toBe(10)
    })

    it('throws on invoke error', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Cache stats failed'))

      await expect(getCacheStats()).rejects.toThrow('Cache stats failed')
    })
  })

  describe('formatTimeAgo', () => {
    it('formats seconds ago', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(formatTimeAgo(now - 30)).toBe('30s ago')
    })

    it('formats minutes ago', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(formatTimeAgo(now - 120)).toBe('2m ago')
    })

    it('formats hours ago', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(formatTimeAgo(now - 7200)).toBe('2h ago')
    })

    it('formats days ago', () => {
      const now = Math.floor(Date.now() / 1000)
      expect(formatTimeAgo(now - 172800)).toBe('2d ago')
    })
  })

  describe('extractDomain', () => {
    it('extracts domain from URL', () => {
      expect(extractDomain('https://example.com/path')).toBe('example.com')
    })

    it('strips www prefix', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('example.com')
    })

    it('returns null for null input', () => {
      expect(extractDomain(null)).toBeNull()
    })

    it('returns null for invalid URL', () => {
      expect(extractDomain('not a url')).toBeNull()
    })
  })

  describe('request deduplication', () => {
    it('deduplicates concurrent identical fetchItem calls', async () => {
      const mockItem = {
        id: 123,
        type: 0,
        by: 'user1',
        time: 1700000000,
        title: 'Test Story',
      }

      // Create a promise that we can resolve manually
      let resolveInvoke: (value: unknown) => void
      mockInvoke.mockReturnValue(
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
      )

      // Fire three concurrent requests for the same item
      const promise1 = fetchItem(123)
      const promise2 = fetchItem(123)
      const promise3 = fetchItem(123)

      // Only one invoke call should be made
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(getInFlightRequestCount()).toBe(1)

      // Resolve the underlying promise
      resolveInvoke?.(mockItem)

      // All three promises should resolve to the same value
      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ])

      expect(result1).toEqual(mockItem)
      expect(result2).toEqual(mockItem)
      expect(result3).toEqual(mockItem)

      // In-flight request should be cleaned up
      expect(getInFlightRequestCount()).toBe(0)
    })

    it('makes new request after previous one completes', async () => {
      const mockItem1 = { id: 123, title: 'First' }
      const mockItem2 = { id: 123, title: 'Second' }

      mockInvoke
        .mockResolvedValueOnce(mockItem1)
        .mockResolvedValueOnce(mockItem2)

      // First request
      const result1 = await fetchItem(123)
      expect(result1).toEqual(mockItem1)
      expect(mockInvoke).toHaveBeenCalledTimes(1)

      // Second request (after first completed)
      const result2 = await fetchItem(123)
      expect(result2).toEqual(mockItem2)
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })

    it('does not deduplicate different item IDs', async () => {
      const mockItem1 = { id: 123, title: 'Story 1' }
      const mockItem2 = { id: 456, title: 'Story 2' }

      let resolveFirst: (value: unknown) => void
      let resolveSecond: (value: unknown) => void

      mockInvoke
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
        )
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveSecond = resolve
          }),
        )

      const promise1 = fetchItem(123)
      const promise2 = fetchItem(456)

      // Two different invoke calls should be made
      expect(mockInvoke).toHaveBeenCalledTimes(2)
      expect(getInFlightRequestCount()).toBe(2)

      resolveFirst?.(mockItem1)
      resolveSecond?.(mockItem2)

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1).toEqual(mockItem1)
      expect(result2).toEqual(mockItem2)
    })

    it('deduplicates fetchItems regardless of ID order', async () => {
      const mockItems = [
        { id: 1, title: 'Item 1' },
        { id: 2, title: 'Item 2' },
        { id: 3, title: 'Item 3' },
      ]

      let resolveInvoke: (value: unknown) => void
      mockInvoke.mockReturnValue(
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
      )

      // Fire concurrent requests with same IDs in different orders
      const promise1 = fetchItems([1, 2, 3])
      const promise2 = fetchItems([3, 2, 1])
      const promise3 = fetchItems([2, 1, 3])

      // Only one invoke call should be made (IDs are normalized by sorting)
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(getInFlightRequestCount()).toBe(1)

      resolveInvoke?.(mockItems)

      const [result1, result2, result3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ])

      expect(result1).toEqual(mockItems)
      expect(result2).toEqual(mockItems)
      expect(result3).toEqual(mockItems)
    })

    it('allows retry after failed request', async () => {
      const mockError = new Error('Network error')
      const mockItem = { id: 123, title: 'Success' }

      mockInvoke
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce(mockItem)

      // First request fails
      await expect(fetchItem(123)).rejects.toThrow('Network error')
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(getInFlightRequestCount()).toBe(0) // Cleaned up after failure

      // Retry should make a new request
      const result = await fetchItem(123)
      expect(result).toEqual(mockItem)
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })

    it('deduplicates concurrent fetchUser calls', async () => {
      const mockUser = {
        id: 'testuser',
        karma: 100,
        created: 1600000000,
      }

      let resolveInvoke: (value: unknown) => void
      mockInvoke.mockReturnValue(
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
      )

      const promise1 = fetchUser('testuser')
      const promise2 = fetchUser('testuser')

      expect(mockInvoke).toHaveBeenCalledTimes(1)

      resolveInvoke?.(mockUser)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(mockUser)
      expect(result2).toEqual(mockUser)
    })

    it('deduplicates concurrent searchHN calls with same params', async () => {
      const mockResponse = {
        hits: [],
        nbHits: 0,
        page: 0,
        nbPages: 0,
        hitsPerPage: 20,
        query: 'test',
      }

      let resolveInvoke: (value: unknown) => void
      mockInvoke.mockReturnValue(
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
      )

      const promise1 = searchHN('test', { page: 0 })
      const promise2 = searchHN('test', { page: 0 })

      expect(mockInvoke).toHaveBeenCalledTimes(1)

      resolveInvoke?.(mockResponse)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(mockResponse)
      expect(result2).toEqual(mockResponse)
    })

    it('does not deduplicate searchHN calls with different params', async () => {
      mockInvoke
        .mockResolvedValueOnce({ hits: [], query: 'test', page: 0 })
        .mockResolvedValueOnce({ hits: [], query: 'test', page: 1 })

      const promise1 = searchHN('test', { page: 0 })
      const promise2 = searchHN('test', { page: 1 })

      expect(mockInvoke).toHaveBeenCalledTimes(2)

      await Promise.all([promise1, promise2])
    })

    it('deduplicates concurrent fetchArticleContent calls', async () => {
      const mockArticle = {
        title: 'Test Article',
        content: '<p>Content</p>',
        textContent: 'Content',
      }

      let resolveInvoke: (value: unknown) => void
      mockInvoke.mockReturnValue(
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
      )

      const promise1 = fetchArticleContent('https://example.com/article')
      const promise2 = fetchArticleContent('https://example.com/article')

      expect(mockInvoke).toHaveBeenCalledTimes(1)

      resolveInvoke?.(mockArticle)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(mockArticle)
      expect(result2).toEqual(mockArticle)
    })

    it('deduplicates concurrent fetchUserSubmissions calls', async () => {
      const mockResponse = {
        items: [],
        hasMore: false,
        total: 0,
      }

      let resolveInvoke: (value: unknown) => void
      mockInvoke.mockReturnValue(
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
      )

      const promise1 = fetchUserSubmissions('testuser', 0, 30, 'all')
      const promise2 = fetchUserSubmissions('testuser', 0, 30, 'all')

      expect(mockInvoke).toHaveBeenCalledTimes(1)

      resolveInvoke?.(mockResponse)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(mockResponse)
      expect(result2).toEqual(mockResponse)
    })

    it('deduplicates fetchStoryWithComments with same id and depth', async () => {
      const mockResponse = {
        story: { id: 100, title: 'Test' },
        comments: [],
      }

      let resolveInvoke: (value: unknown) => void
      mockInvoke.mockReturnValue(
        new Promise((resolve) => {
          resolveInvoke = resolve
        }),
      )

      const promise1 = fetchStoryWithComments(100, 2)
      const promise2 = fetchStoryWithComments(100, 2)

      expect(mockInvoke).toHaveBeenCalledTimes(1)

      resolveInvoke?.(mockResponse)

      const [result1, result2] = await Promise.all([promise1, promise2])
      expect(result1).toEqual(mockResponse)
      expect(result2).toEqual(mockResponse)
    })

    it('does not deduplicate fetchStoryWithComments with different depths', async () => {
      mockInvoke
        .mockResolvedValueOnce({ story: { id: 100 }, comments: [] })
        .mockResolvedValueOnce({ story: { id: 100 }, comments: [] })

      const promise1 = fetchStoryWithComments(100, 1)
      const promise2 = fetchStoryWithComments(100, 3)

      expect(mockInvoke).toHaveBeenCalledTimes(2)

      await Promise.all([promise1, promise2])
    })
  })
})

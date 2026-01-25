import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCache,
  extractDomain,
  fetchItem,
  fetchStoryWithComments,
  fetchUser,
  formatTimeAgo,
} from './api'

describe('api', () => {
  beforeEach(() => {
    clearCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      } as Response)

      const user = await fetchUser('dang')

      expect(fetch).toHaveBeenCalledWith(
        'https://hacker-news.firebaseio.com/v0/user/dang.json',
      )
      expect(user).toEqual({
        id: 'dang',
        created: 1309740055,
        karma: 12345,
        about: 'HN moderator',
        submitted: [123, 456, 789],
      })
    })

    it('handles user with null fields', async () => {
      const mockUser = {
        id: 'newuser',
        created: 1600000000,
        karma: 1,
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      } as Response)

      const user = await fetchUser('newuser')

      expect(user.about).toBeNull()
      expect(user.submitted).toBeNull()
    })

    it('throws on fetch error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)

      await expect(fetchUser('nonexistent')).rejects.toThrow('Failed to fetch')
    })
  })

  describe('fetchItem', () => {
    it('fetches and caches item data', async () => {
      const mockItem = {
        id: 123,
        type: 'story',
        by: 'user1',
        time: 1700000000,
        title: 'Test Story',
        score: 100,
        descendants: 50,
        kids: [456, 789],
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockItem),
      } as Response)

      const item = await fetchItem(123)

      expect(item.id).toBe(123)
      expect(item.title).toBe('Test Story')
      expect(item.by).toBe('user1')

      // Second call should use cache, not fetch again
      const cachedItem = await fetchItem(123)
      expect(cachedItem.id).toBe(123)
      expect(fetch).toHaveBeenCalledTimes(1)
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

  describe('fetchStoryWithComments', () => {
    it('fetches story and its comments with depth', async () => {
      const mockStory = {
        id: 100,
        type: 'story',
        by: 'author',
        time: 1700000000,
        title: 'Test Story',
        score: 50,
        descendants: 3,
        kids: [101, 102],
      }
      const mockComment1 = {
        id: 101,
        type: 'comment',
        by: 'commenter1',
        time: 1700000100,
        text: 'First comment',
        parent: 100,
        kids: [103],
      }
      const mockComment2 = {
        id: 102,
        type: 'comment',
        by: 'commenter2',
        time: 1700000200,
        text: 'Second comment',
        parent: 100,
      }
      const mockNestedComment = {
        id: 103,
        type: 'comment',
        by: 'commenter3',
        time: 1700000300,
        text: 'Nested reply',
        parent: 101,
      }

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockStory),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockComment1),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockComment2),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockNestedComment),
        } as Response)

      const result = await fetchStoryWithComments(100, 2)

      expect(result.story.id).toBe(100)
      expect(result.story.title).toBe('Test Story')
      expect(result.comments).toHaveLength(2)
      expect(result.comments[0].id).toBe(101)
      expect(result.comments[0].children).toHaveLength(1)
      expect(result.comments[0].children?.[0].id).toBe(103)
      expect(result.comments[1].id).toBe(102)
    })

    it('returns empty comments for story with no kids', async () => {
      const mockStory = {
        id: 200,
        type: 'story',
        by: 'author',
        time: 1700000000,
        title: 'Story without comments',
        score: 10,
        descendants: 0,
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStory),
      } as Response)

      const result = await fetchStoryWithComments(200)

      expect(result.story.id).toBe(200)
      expect(result.comments).toHaveLength(0)
    })
  })
})

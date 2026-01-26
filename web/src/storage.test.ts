import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bookmarkStory,
  clearAllReadingData,
  clearBookmarks,
  clearCommentCounts,
  clearFeedScrollPosition,
  clearStoryScrollPosition,
  clearStoryScores,
  getBookmarkedStories,
  getBookmarkedStoryById,
  getBookmarkedStoryIds,
  getBookmarksCount,
  getBookmarksWithTimestamps,
  getCommentCountsMap,
  getFeedScrollPosition,
  getNewCommentsCount,
  getReadStoryIds,
  getScoreGain,
  getStoryCommentCount,
  getStoryScore,
  getStoryScoresMap,
  getStoryScrollPosition,
  getStoryTrendingLevel,
  isStoryBookmarked,
  isStoryRead,
  markStoryAsRead,
  removeBookmark,
  saveFeedScrollPosition,
  saveStoryCommentCount,
  saveStoryScore,
  saveStoryScrollPosition,
} from './storage'
import type { HNItem } from './types'

describe('storage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('feed scroll positions', () => {
    it('saves and retrieves feed scroll position', () => {
      saveFeedScrollPosition('top', 500)
      expect(getFeedScrollPosition('top')).toBe(500)
    })

    it('returns 0 for unsaved feed', () => {
      expect(getFeedScrollPosition('new')).toBe(0)
    })

    it('saves positions for multiple feeds independently', () => {
      saveFeedScrollPosition('top', 100)
      saveFeedScrollPosition('new', 200)
      saveFeedScrollPosition('best', 300)

      expect(getFeedScrollPosition('top')).toBe(100)
      expect(getFeedScrollPosition('new')).toBe(200)
      expect(getFeedScrollPosition('best')).toBe(300)
    })

    it('overwrites previous position for same feed', () => {
      saveFeedScrollPosition('top', 100)
      saveFeedScrollPosition('top', 500)

      expect(getFeedScrollPosition('top')).toBe(500)
    })

    it('clearFeedScrollPosition removes position for specific feed', () => {
      saveFeedScrollPosition('top', 100)
      saveFeedScrollPosition('new', 200)

      clearFeedScrollPosition('top')

      expect(getFeedScrollPosition('top')).toBe(0)
      expect(getFeedScrollPosition('new')).toBe(200)
    })

    it('handles localStorage errors gracefully on save', () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem')
      mockSetItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      // Should not throw
      expect(() => saveFeedScrollPosition('top', 100)).not.toThrow()
    })

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('pastel-hn-feed-scroll', 'invalid json {{{')

      // Should return default value, not throw
      expect(getFeedScrollPosition('top')).toBe(0)
    })
  })

  describe('story scroll positions', () => {
    it('saves and retrieves story scroll position', () => {
      saveStoryScrollPosition(12345, 750)
      expect(getStoryScrollPosition(12345)).toBe(750)
    })

    it('returns 0 for unsaved story', () => {
      expect(getStoryScrollPosition(99999)).toBe(0)
    })

    it('saves positions for multiple stories independently', () => {
      saveStoryScrollPosition(1, 100)
      saveStoryScrollPosition(2, 200)
      saveStoryScrollPosition(3, 300)

      expect(getStoryScrollPosition(1)).toBe(100)
      expect(getStoryScrollPosition(2)).toBe(200)
      expect(getStoryScrollPosition(3)).toBe(300)
    })

    it('clearStoryScrollPosition removes position for specific story', () => {
      saveStoryScrollPosition(1, 100)
      saveStoryScrollPosition(2, 200)

      clearStoryScrollPosition(1)

      expect(getStoryScrollPosition(1)).toBe(0)
      expect(getStoryScrollPosition(2)).toBe(200)
    })

    it('prunes old entries when exceeding max capacity', () => {
      // Save 101 positions (max is 100)
      for (let i = 0; i < 101; i++) {
        saveStoryScrollPosition(i, i * 10)
      }

      // Should keep most recent entries
      const data = JSON.parse(
        localStorage.getItem('pastel-hn-story-scroll') || '{}',
      )
      expect(Object.keys(data).length).toBeLessThanOrEqual(100)
    })

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('pastel-hn-story-scroll', 'not valid json')

      expect(getStoryScrollPosition(123)).toBe(0)
    })
  })

  describe('read stories tracking', () => {
    it('marks story as read', () => {
      markStoryAsRead(12345)
      expect(isStoryRead(12345)).toBe(true)
    })

    it('returns false for unread story', () => {
      expect(isStoryRead(99999)).toBe(false)
    })

    it('tracks multiple read stories', () => {
      markStoryAsRead(1)
      markStoryAsRead(2)
      markStoryAsRead(3)

      expect(isStoryRead(1)).toBe(true)
      expect(isStoryRead(2)).toBe(true)
      expect(isStoryRead(3)).toBe(true)
      expect(isStoryRead(4)).toBe(false)
    })

    it('does not duplicate when marking same story twice', () => {
      markStoryAsRead(12345)
      markStoryAsRead(12345)

      const data = JSON.parse(
        localStorage.getItem('pastel-hn-read-stories') || '[]',
      )
      const count = data.filter((s: { id: number }) => s.id === 12345).length
      expect(count).toBe(1)
    })

    it('getReadStoryIds returns Set of all read story IDs', () => {
      markStoryAsRead(1)
      markStoryAsRead(2)
      markStoryAsRead(3)

      const readIds = getReadStoryIds()

      expect(readIds).toBeInstanceOf(Set)
      expect(readIds.has(1)).toBe(true)
      expect(readIds.has(2)).toBe(true)
      expect(readIds.has(3)).toBe(true)
      expect(readIds.has(4)).toBe(false)
    })

    it('prunes old entries when exceeding max capacity', () => {
      // Mark 501 stories as read (max is 500)
      for (let i = 0; i < 501; i++) {
        markStoryAsRead(i)
      }

      const data = JSON.parse(
        localStorage.getItem('pastel-hn-read-stories') || '[]',
      )
      expect(data.length).toBeLessThanOrEqual(500)
    })

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('pastel-hn-read-stories', '{invalid}')

      expect(isStoryRead(123)).toBe(false)
      expect(getReadStoryIds()).toEqual(new Set())
    })
  })

  describe('clearAllReadingData', () => {
    it('clears all storage keys', () => {
      saveFeedScrollPosition('top', 100)
      saveStoryScrollPosition(1, 200)
      markStoryAsRead(1)

      clearAllReadingData()

      expect(getFeedScrollPosition('top')).toBe(0)
      expect(getStoryScrollPosition(1)).toBe(0)
      expect(isStoryRead(1)).toBe(false)
    })

    it('does not affect other localStorage keys', () => {
      localStorage.setItem('other-key', 'other-value')
      saveFeedScrollPosition('top', 100)

      clearAllReadingData()

      expect(localStorage.getItem('other-key')).toBe('other-value')
    })
  })

  describe('comment count tracking', () => {
    it('saves and retrieves story comment count', () => {
      saveStoryCommentCount(12345, 50)
      expect(getStoryCommentCount(12345)).toBe(50)
    })

    it('returns null for story never viewed', () => {
      expect(getStoryCommentCount(99999)).toBeNull()
    })

    it('saves counts for multiple stories independently', () => {
      saveStoryCommentCount(1, 10)
      saveStoryCommentCount(2, 20)
      saveStoryCommentCount(3, 30)

      expect(getStoryCommentCount(1)).toBe(10)
      expect(getStoryCommentCount(2)).toBe(20)
      expect(getStoryCommentCount(3)).toBe(30)
    })

    it('overwrites previous count for same story', () => {
      saveStoryCommentCount(12345, 10)
      saveStoryCommentCount(12345, 50)

      expect(getStoryCommentCount(12345)).toBe(50)
    })

    it('getNewCommentsCount returns 0 for never-viewed story', () => {
      expect(getNewCommentsCount(99999, 100)).toBe(0)
    })

    it('getNewCommentsCount returns difference for viewed story', () => {
      saveStoryCommentCount(12345, 50)

      expect(getNewCommentsCount(12345, 75)).toBe(25)
    })

    it('getNewCommentsCount returns 0 when current count equals last seen', () => {
      saveStoryCommentCount(12345, 50)

      expect(getNewCommentsCount(12345, 50)).toBe(0)
    })

    it('getNewCommentsCount returns 0 when current count is less (deleted comments)', () => {
      saveStoryCommentCount(12345, 50)

      expect(getNewCommentsCount(12345, 40)).toBe(0)
    })

    it('getCommentCountsMap returns all tracked counts as Map', () => {
      saveStoryCommentCount(1, 10)
      saveStoryCommentCount(2, 20)
      saveStoryCommentCount(3, 30)

      const map = getCommentCountsMap()

      expect(map).toBeInstanceOf(Map)
      expect(map.get(1)).toBe(10)
      expect(map.get(2)).toBe(20)
      expect(map.get(3)).toBe(30)
      expect(map.get(4)).toBeUndefined()
    })

    it('clearCommentCounts removes all comment count data', () => {
      saveStoryCommentCount(1, 10)
      saveStoryCommentCount(2, 20)

      clearCommentCounts()

      expect(getStoryCommentCount(1)).toBeNull()
      expect(getStoryCommentCount(2)).toBeNull()
      expect(getCommentCountsMap().size).toBe(0)
    })

    it('prunes old entries when exceeding max capacity', () => {
      // Save 501 counts (max is 500)
      for (let i = 0; i < 501; i++) {
        saveStoryCommentCount(i, i * 10)
      }

      const data = JSON.parse(
        localStorage.getItem('pastel-hn-comment-counts') || '{}',
      )
      expect(Object.keys(data).length).toBeLessThanOrEqual(500)
    })

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('pastel-hn-comment-counts', 'not valid json')

      expect(getStoryCommentCount(123)).toBeNull()
      expect(getCommentCountsMap()).toEqual(new Map())
    })

    it('handles localStorage errors gracefully on save', () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem')
      mockSetItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      // Should not throw
      expect(() => saveStoryCommentCount(12345, 50)).not.toThrow()
    })
  })

  describe('story score tracking', () => {
    it('saves and retrieves story score', () => {
      saveStoryScore(12345, 100)
      const entry = getStoryScore(12345)

      expect(entry).not.toBeNull()
      expect(entry?.score).toBe(100)
      expect(entry?.timestamp).toBeCloseTo(Date.now(), -2)
    })

    it('returns null for story never tracked', () => {
      expect(getStoryScore(99999)).toBeNull()
    })

    it('saves scores for multiple stories independently', () => {
      saveStoryScore(1, 10)
      saveStoryScore(2, 20)
      saveStoryScore(3, 30)

      expect(getStoryScore(1)?.score).toBe(10)
      expect(getStoryScore(2)?.score).toBe(20)
      expect(getStoryScore(3)?.score).toBe(30)
    })

    it('does not overwrite recent entry (within 1 hour)', () => {
      saveStoryScore(12345, 100)
      saveStoryScore(12345, 200) // Should be ignored

      expect(getStoryScore(12345)?.score).toBe(100)
    })

    it('overwrites old entry (older than 1 hour)', () => {
      // Manually set an old entry
      const oldTimestamp = Date.now() - 2 * 60 * 60 * 1000 // 2 hours ago
      localStorage.setItem(
        'pastel-hn-story-scores',
        JSON.stringify({ 12345: { score: 100, timestamp: oldTimestamp } }),
      )

      saveStoryScore(12345, 200)

      expect(getStoryScore(12345)?.score).toBe(200)
    })

    it('getScoreGain returns 0 for untracked story', () => {
      expect(getScoreGain(99999, 100)).toBe(0)
    })

    it('getScoreGain returns difference for tracked story', () => {
      saveStoryScore(12345, 50)

      expect(getScoreGain(12345, 150)).toBe(100)
    })

    it('getScoreGain returns 0 when current score is lower', () => {
      saveStoryScore(12345, 100)

      expect(getScoreGain(12345, 50)).toBe(0)
    })

    it('getStoryTrendingLevel returns none for untracked story', () => {
      expect(getStoryTrendingLevel(99999, 100)).toBe('none')
    })

    it('getStoryTrendingLevel returns none for insufficient points gain', () => {
      saveStoryScore(12345, 100)

      // Only 5 points gained, below MIN_TRENDING_POINTS (10)
      expect(getStoryTrendingLevel(12345, 105)).toBe('none')
    })

    it('getStoryTrendingLevel returns rising for moderate growth', () => {
      // Set score from 1 hour ago
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      localStorage.setItem(
        'pastel-hn-story-scores',
        JSON.stringify({ 12345: { score: 100, timestamp: oneHourAgo } }),
      )

      // 40 points in 1 hour = 40 points/hour (rising threshold is 30)
      expect(getStoryTrendingLevel(12345, 140)).toBe('rising')
    })

    it('getStoryTrendingLevel returns hot for rapid growth', () => {
      // Set score from 1 hour ago
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      localStorage.setItem(
        'pastel-hn-story-scores',
        JSON.stringify({ 12345: { score: 100, timestamp: oneHourAgo } }),
      )

      // 80 points in 1 hour = 80 points/hour (hot threshold is 60)
      expect(getStoryTrendingLevel(12345, 180)).toBe('hot')
    })

    it('getStoryTrendingLevel handles very recent entries correctly', () => {
      // Just saved, time is effectively 0
      saveStoryScore(12345, 100)

      // Even with big gain, uses minimum time of 0.1 hours
      // 50 points / 0.1 hours = 500 points/hour (hot)
      expect(getStoryTrendingLevel(12345, 150)).toBe('hot')
    })

    it('getStoryScoresMap returns all tracked scores as Map', () => {
      saveStoryScore(1, 10)
      saveStoryScore(2, 20)
      saveStoryScore(3, 30)

      const map = getStoryScoresMap()

      expect(map).toBeInstanceOf(Map)
      expect(map.get(1)?.score).toBe(10)
      expect(map.get(2)?.score).toBe(20)
      expect(map.get(3)?.score).toBe(30)
      expect(map.get(4)).toBeUndefined()
    })

    it('clearStoryScores removes all score data', () => {
      saveStoryScore(1, 10)
      saveStoryScore(2, 20)

      clearStoryScores()

      expect(getStoryScore(1)).toBeNull()
      expect(getStoryScore(2)).toBeNull()
      expect(getStoryScoresMap().size).toBe(0)
    })

    it('prunes old entries when exceeding max capacity', () => {
      // Need to set old timestamps so new entries can overwrite
      const oldTimestamp = Date.now() - 2 * 60 * 60 * 1000
      const oldData: Record<number, { score: number; timestamp: number }> = {}
      for (let i = 0; i < 501; i++) {
        oldData[i] = { score: i * 10, timestamp: oldTimestamp + i }
      }
      localStorage.setItem('pastel-hn-story-scores', JSON.stringify(oldData))

      // Save a new one to trigger pruning
      saveStoryScore(9999, 100)

      const data = JSON.parse(
        localStorage.getItem('pastel-hn-story-scores') || '{}',
      )
      expect(Object.keys(data).length).toBeLessThanOrEqual(500)
    })

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('pastel-hn-story-scores', 'not valid json')

      expect(getStoryScore(123)).toBeNull()
      expect(getStoryScoresMap()).toEqual(new Map())
      expect(getStoryTrendingLevel(123, 100)).toBe('none')
    })

    it('handles localStorage errors gracefully on save', () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem')
      mockSetItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      // Should not throw
      expect(() => saveStoryScore(12345, 100)).not.toThrow()
    })
  })

  describe('bookmarks', () => {
    const createTestStory = (id: number, overrides?: Partial<HNItem>): HNItem => ({
      id,
      type: 0, // ItemType.Story
      by: 'testuser',
      time: Math.floor(Date.now() / 1000),
      title: `Test Story ${id}`,
      url: `https://example.com/${id}`,
      score: 100,
      descendants: 50,
      text: null,
      kids: null,
      parent: null,
      dead: false,
      deleted: false,
      ...overrides,
    })

    it('bookmarks a story and retrieves it', () => {
      const story = createTestStory(12345)

      bookmarkStory(story)

      expect(isStoryBookmarked(12345)).toBe(true)
      const bookmarked = getBookmarkedStories()
      expect(bookmarked).toHaveLength(1)
      expect(bookmarked[0].id).toBe(12345)
      expect(bookmarked[0].title).toBe('Test Story 12345')
    })

    it('returns false for non-bookmarked story', () => {
      expect(isStoryBookmarked(99999)).toBe(false)
    })

    it('removes a bookmark', () => {
      const story = createTestStory(12345)
      bookmarkStory(story)
      expect(isStoryBookmarked(12345)).toBe(true)

      removeBookmark(12345)

      expect(isStoryBookmarked(12345)).toBe(false)
      expect(getBookmarkedStories()).toHaveLength(0)
    })

    it('removes only the specified bookmark', () => {
      bookmarkStory(createTestStory(1))
      bookmarkStory(createTestStory(2))
      bookmarkStory(createTestStory(3))

      removeBookmark(2)

      expect(isStoryBookmarked(1)).toBe(true)
      expect(isStoryBookmarked(2)).toBe(false)
      expect(isStoryBookmarked(3)).toBe(true)
      expect(getBookmarkedStories()).toHaveLength(2)
    })

    it('does not duplicate when bookmarking same story twice', () => {
      const story = createTestStory(12345)

      bookmarkStory(story)
      bookmarkStory(story)

      expect(getBookmarkedStories()).toHaveLength(1)
    })

    it('stores newest bookmarks first', () => {
      bookmarkStory(createTestStory(1))
      bookmarkStory(createTestStory(2))
      bookmarkStory(createTestStory(3))

      const bookmarks = getBookmarkedStories()

      expect(bookmarks[0].id).toBe(3)
      expect(bookmarks[1].id).toBe(2)
      expect(bookmarks[2].id).toBe(1)
    })

    it('getBookmarksWithTimestamps returns stories with metadata', () => {
      const story = createTestStory(12345)
      bookmarkStory(story)

      const bookmarksWithMeta = getBookmarksWithTimestamps()

      expect(bookmarksWithMeta).toHaveLength(1)
      expect(bookmarksWithMeta[0].story.id).toBe(12345)
      expect(bookmarksWithMeta[0].bookmarkedAt).toBeCloseTo(Date.now(), -2)
    })

    it('getBookmarksCount returns correct count', () => {
      expect(getBookmarksCount()).toBe(0)

      bookmarkStory(createTestStory(1))
      expect(getBookmarksCount()).toBe(1)

      bookmarkStory(createTestStory(2))
      expect(getBookmarksCount()).toBe(2)

      removeBookmark(1)
      expect(getBookmarksCount()).toBe(1)
    })

    it('getBookmarkedStoryIds returns Set of IDs', () => {
      bookmarkStory(createTestStory(1))
      bookmarkStory(createTestStory(2))
      bookmarkStory(createTestStory(3))

      const ids = getBookmarkedStoryIds()

      expect(ids).toBeInstanceOf(Set)
      expect(ids.has(1)).toBe(true)
      expect(ids.has(2)).toBe(true)
      expect(ids.has(3)).toBe(true)
      expect(ids.has(4)).toBe(false)
    })

    it('clearBookmarks removes all bookmarks', () => {
      bookmarkStory(createTestStory(1))
      bookmarkStory(createTestStory(2))
      bookmarkStory(createTestStory(3))

      clearBookmarks()

      expect(getBookmarksCount()).toBe(0)
      expect(getBookmarkedStories()).toHaveLength(0)
      expect(isStoryBookmarked(1)).toBe(false)
    })

    it('prunes oldest bookmarks when exceeding max capacity', () => {
      // Add 201 bookmarks (max is 200)
      for (let i = 0; i < 201; i++) {
        bookmarkStory(createTestStory(i))
      }

      const bookmarks = getBookmarkedStories()

      expect(bookmarks.length).toBeLessThanOrEqual(200)
      // Oldest bookmark (id=0) should be removed, newest (id=200) should remain
      expect(isStoryBookmarked(200)).toBe(true)
      expect(isStoryBookmarked(0)).toBe(false)
    })

    it('handles corrupted localStorage data gracefully', () => {
      localStorage.setItem('pastel-hn-bookmarks', 'not valid json {{{')

      expect(isStoryBookmarked(123)).toBe(false)
      expect(getBookmarkedStories()).toEqual([])
      expect(getBookmarksCount()).toBe(0)
      expect(getBookmarkedStoryIds()).toEqual(new Set())
    })

    it('handles localStorage errors gracefully on save', () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem')
      mockSetItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      // Should not throw
      expect(() => bookmarkStory(createTestStory(12345))).not.toThrow()
    })

    it('handles localStorage errors gracefully on remove', () => {
      // First, add a bookmark with working storage
      bookmarkStory(createTestStory(12345))

      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem')
      mockSetItem.mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      // Should not throw
      expect(() => removeBookmark(12345)).not.toThrow()
    })

    it('preserves full story data for offline viewing', () => {
      const story = createTestStory(12345, {
        title: 'Important Story',
        url: 'https://example.com/important',
        by: 'specialuser',
        score: 500,
        descendants: 200,
        text: 'Some text content',
      })

      bookmarkStory(story)

      const bookmarks = getBookmarkedStories()
      expect(bookmarks[0]).toEqual(story)
    })

    describe('getBookmarkedStoryById', () => {
      it('returns the story when bookmarked', () => {
        const story = createTestStory(12345, {
          title: 'Test Story for Lookup',
          url: 'https://example.com/lookup',
        })
        bookmarkStory(story)

        const result = getBookmarkedStoryById(12345)

        expect(result).not.toBeNull()
        expect(result?.id).toBe(12345)
        expect(result?.title).toBe('Test Story for Lookup')
      })

      it('returns null when story is not bookmarked', () => {
        const result = getBookmarkedStoryById(99999)

        expect(result).toBeNull()
      })

      it('returns null when bookmarks are empty', () => {
        clearBookmarks()

        const result = getBookmarkedStoryById(12345)

        expect(result).toBeNull()
      })

      it('returns correct story from multiple bookmarks', () => {
        bookmarkStory(createTestStory(1, { title: 'Story 1' }))
        bookmarkStory(createTestStory(2, { title: 'Story 2' }))
        bookmarkStory(createTestStory(3, { title: 'Story 3' }))

        const result = getBookmarkedStoryById(2)

        expect(result).not.toBeNull()
        expect(result?.id).toBe(2)
        expect(result?.title).toBe('Story 2')
      })

      it('returns full story data including text for Ask HN stories', () => {
        const askStory = createTestStory(12345, {
          title: 'Ask HN: How do you handle errors?',
          text: '<p>I am curious about error handling strategies...</p>',
          url: undefined,
        })
        bookmarkStory(askStory)

        const result = getBookmarkedStoryById(12345)

        expect(result).not.toBeNull()
        expect(result?.text).toBe('<p>I am curious about error handling strategies...</p>')
      })

      it('handles corrupted localStorage gracefully', () => {
        localStorage.setItem('pastel-hn-bookmarks', 'invalid json {{{')

        const result = getBookmarkedStoryById(12345)

        expect(result).toBeNull()
      })
    })
  })
})

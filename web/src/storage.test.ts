import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllReadingData,
  clearCommentCounts,
  clearFeedScrollPosition,
  clearStoryScrollPosition,
  getCommentCountsMap,
  getFeedScrollPosition,
  getNewCommentsCount,
  getReadStoryIds,
  getStoryCommentCount,
  getStoryScrollPosition,
  isStoryRead,
  markStoryAsRead,
  saveFeedScrollPosition,
  saveStoryCommentCount,
  saveStoryScrollPosition,
} from './storage'

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
})

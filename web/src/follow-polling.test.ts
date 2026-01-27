import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HNItem } from './types'

// Mock the dependencies
vi.mock('./api', () => ({
  fetchItem: vi.fn(),
}))

vi.mock('./notifications', () => ({
  areNotificationsAvailable: vi.fn(),
  notifyNewComments: vi.fn(),
}))

vi.mock('./storage', () => ({
  getFollowedStories: vi.fn(),
  updateFollowedStoryCommentCount: vi.fn(),
}))

import { fetchItem } from './api'
import {
  checkFollowedStories,
  checkSingleStory,
  isPollingActive,
  startFollowedStoriesPolling,
  stopFollowedStoriesPolling,
} from './follow-polling'
import { areNotificationsAvailable, notifyNewComments } from './notifications'
import { getFollowedStories, updateFollowedStoryCommentCount } from './storage'

const createTestStory = (id: number, descendants: number): HNItem => ({
  id,
  type: 0,
  by: 'testuser',
  time: Math.floor(Date.now() / 1000),
  title: `Test Story ${id}`,
  url: `https://example.com/${id}`,
  score: 100,
  descendants,
  text: null,
  kids: null,
  parent: null,
  dead: false,
  deleted: false,
})

describe('follow-polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset module state
    stopFollowedStoriesPolling()
  })

  afterEach(() => {
    vi.useRealTimers()
    stopFollowedStoriesPolling()
  })

  describe('startFollowedStoriesPolling', () => {
    it('does not start polling if notifications are unavailable', () => {
      vi.mocked(areNotificationsAvailable).mockReturnValue(false)

      startFollowedStoriesPolling()

      expect(isPollingActive()).toBe(false)
    })

    it('starts polling when notifications are available', () => {
      vi.mocked(areNotificationsAvailable).mockReturnValue(true)
      vi.mocked(getFollowedStories).mockReturnValue([])

      startFollowedStoriesPolling()

      expect(isPollingActive()).toBe(true)
    })

    it('does not start multiple polling intervals', () => {
      vi.mocked(areNotificationsAvailable).mockReturnValue(true)
      vi.mocked(getFollowedStories).mockReturnValue([])

      startFollowedStoriesPolling()
      startFollowedStoriesPolling()
      startFollowedStoriesPolling()

      // Should still have only one interval
      expect(isPollingActive()).toBe(true)
    })

    it('performs initial check after 10 seconds', async () => {
      vi.mocked(areNotificationsAvailable).mockReturnValue(true)
      vi.mocked(getFollowedStories).mockReturnValue([])

      startFollowedStoriesPolling()

      // Advance timers by 10 seconds
      await vi.advanceTimersByTimeAsync(10000)

      expect(getFollowedStories).toHaveBeenCalled()
    })
  })

  describe('stopFollowedStoriesPolling', () => {
    it('stops active polling', () => {
      vi.mocked(areNotificationsAvailable).mockReturnValue(true)
      vi.mocked(getFollowedStories).mockReturnValue([])

      startFollowedStoriesPolling()
      expect(isPollingActive()).toBe(true)

      stopFollowedStoriesPolling()
      expect(isPollingActive()).toBe(false)
    })

    it('is safe to call when not polling', () => {
      expect(() => stopFollowedStoriesPolling()).not.toThrow()
      expect(isPollingActive()).toBe(false)
    })
  })

  describe('checkFollowedStories', () => {
    it('does nothing when no stories are followed', async () => {
      vi.mocked(getFollowedStories).mockReturnValue([])

      await checkFollowedStories()

      expect(fetchItem).not.toHaveBeenCalled()
    })

    it('fetches item data for followed stories', async () => {
      const story = createTestStory(123, 50)
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 50,
        },
      ])
      vi.mocked(fetchItem).mockResolvedValue(createTestStory(123, 55))
      vi.mocked(updateFollowedStoryCommentCount).mockReturnValue(5)

      await checkFollowedStories()

      expect(fetchItem).toHaveBeenCalledWith(123)
    })

    it('sends notification when new comments are found', async () => {
      const story = createTestStory(123, 50)
      const updatedStory = createTestStory(123, 55)
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 50,
        },
      ])
      vi.mocked(fetchItem).mockResolvedValue(updatedStory)
      vi.mocked(updateFollowedStoryCommentCount).mockReturnValue(5)

      await checkFollowedStories()

      expect(notifyNewComments).toHaveBeenCalledWith(updatedStory, 5)
    })

    it('does not send notification when no new comments', async () => {
      const story = createTestStory(123, 50)
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 50,
        },
      ])
      vi.mocked(fetchItem).mockResolvedValue(createTestStory(123, 50))
      vi.mocked(updateFollowedStoryCommentCount).mockReturnValue(0)

      await checkFollowedStories()

      expect(notifyNewComments).not.toHaveBeenCalled()
    })

    it('skips recently checked stories', async () => {
      const story = createTestStory(123, 50)
      const now = Date.now()
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story,
          followedAt: now,
          // Checked 1 minute ago (less than MIN_CHECK_INTERVAL of 2 minutes)
          lastCheckedAt: now - 60 * 1000,
          lastCommentCount: 50,
        },
      ])

      await checkFollowedStories()

      expect(fetchItem).not.toHaveBeenCalled()
    })

    it('handles fetch errors gracefully', async () => {
      const story = createTestStory(123, 50)
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 50,
        },
      ])
      vi.mocked(fetchItem).mockRejectedValue(new Error('Network error'))

      // Should not throw
      await expect(checkFollowedStories()).resolves.toBeUndefined()
    })

    it('handles null story response gracefully', async () => {
      const story = createTestStory(123, 50)
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 50,
        },
      ])
      vi.mocked(fetchItem).mockResolvedValue(null)

      await checkFollowedStories()

      expect(updateFollowedStoryCommentCount).not.toHaveBeenCalled()
    })

    it('processes multiple followed stories', async () => {
      const story1 = createTestStory(1, 10)
      const story2 = createTestStory(2, 20)
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story: story1,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 10,
        },
        {
          story: story2,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 20,
        },
      ])
      vi.mocked(fetchItem)
        .mockResolvedValueOnce(createTestStory(1, 15))
        .mockResolvedValueOnce(createTestStory(2, 25))
      vi.mocked(updateFollowedStoryCommentCount)
        .mockReturnValueOnce(5)
        .mockReturnValueOnce(5)

      await checkFollowedStories()

      expect(fetchItem).toHaveBeenCalledTimes(2)
      expect(notifyNewComments).toHaveBeenCalledTimes(2)
    })

    it('handles story with undefined descendants', async () => {
      const story = createTestStory(123, 50)
      const storyWithNoDescendants = {
        ...createTestStory(123, 0),
        descendants: undefined,
      }
      vi.mocked(getFollowedStories).mockReturnValue([
        {
          story,
          followedAt: Date.now(),
          lastCheckedAt: 0,
          lastCommentCount: 50,
        },
      ])
      vi.mocked(fetchItem).mockResolvedValue(storyWithNoDescendants as HNItem)
      vi.mocked(updateFollowedStoryCommentCount).mockReturnValue(0)

      await checkFollowedStories()

      // Should use 0 as default for undefined descendants
      expect(updateFollowedStoryCommentCount).toHaveBeenCalledWith(123, 0)
    })
  })

  describe('checkSingleStory', () => {
    it('returns new comment count for valid story', async () => {
      vi.mocked(fetchItem).mockResolvedValue(createTestStory(123, 60))
      vi.mocked(updateFollowedStoryCommentCount).mockReturnValue(10)

      const newComments = await checkSingleStory(123)

      expect(newComments).toBe(10)
      expect(fetchItem).toHaveBeenCalledWith(123)
      expect(updateFollowedStoryCommentCount).toHaveBeenCalledWith(123, 60)
    })

    it('returns 0 when story not found', async () => {
      vi.mocked(fetchItem).mockResolvedValue(null)

      const newComments = await checkSingleStory(999)

      expect(newComments).toBe(0)
    })

    it('returns 0 on fetch error', async () => {
      vi.mocked(fetchItem).mockRejectedValue(new Error('Network error'))

      const newComments = await checkSingleStory(123)

      expect(newComments).toBe(0)
    })

    it('handles undefined descendants', async () => {
      const storyWithNoDescendants = {
        ...createTestStory(123, 0),
        descendants: undefined,
      }
      vi.mocked(fetchItem).mockResolvedValue(storyWithNoDescendants as HNItem)
      vi.mocked(updateFollowedStoryCommentCount).mockReturnValue(0)

      await checkSingleStory(123)

      expect(updateFollowedStoryCommentCount).toHaveBeenCalledWith(123, 0)
    })
  })

  describe('isPollingActive', () => {
    it('returns false when not polling', () => {
      expect(isPollingActive()).toBe(false)
    })

    it('returns true when polling is active', () => {
      vi.mocked(areNotificationsAvailable).mockReturnValue(true)
      vi.mocked(getFollowedStories).mockReturnValue([])

      startFollowedStoriesPolling()

      expect(isPollingActive()).toBe(true)
    })
  })

  describe('polling interval', () => {
    it('checks stories at 5-minute intervals', async () => {
      vi.mocked(areNotificationsAvailable).mockReturnValue(true)
      vi.mocked(getFollowedStories).mockReturnValue([])

      startFollowedStoriesPolling()

      // Initial check happens after 10 seconds
      await vi.advanceTimersByTimeAsync(10000)
      expect(getFollowedStories).toHaveBeenCalledTimes(1)

      // After 5 minutes, should check again
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(getFollowedStories).toHaveBeenCalledTimes(2)

      // After another 5 minutes, should check again
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(getFollowedStories).toHaveBeenCalledTimes(3)
    })
  })
})

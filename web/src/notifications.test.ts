/**
 * Tests for notifications.ts module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HNItem } from './types'

// Mock notification plugin
const mockIsPermissionGranted = vi.fn()
const mockRequestPermission = vi.fn()
const mockSendNotification = vi.fn()

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: () => mockIsPermissionGranted(),
  requestPermission: () => mockRequestPermission(),
  sendNotification: (opts: unknown) => mockSendNotification(opts),
}))

// Import after mocks are set up
import {
  areNotificationsAvailable,
  initNotifications,
  notifyNewComments,
  notifyStoryUpdate,
  resetNotifications,
  showNotification,
} from './notifications'

describe('notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNotifications()
    // Reset module state by clearing window.__TAURI__
    delete (window as unknown as Record<string, unknown>).__TAURI__
  })

  afterEach(() => {
    resetNotifications()
    delete (window as unknown as Record<string, unknown>).__TAURI__
  })

  describe('initNotifications', () => {
    it('should return false if not in Tauri environment', async () => {
      const result = await initNotifications()
      expect(result).toBe(false)
      expect(mockIsPermissionGranted).not.toHaveBeenCalled()
    })

    it('should return true if permission already granted', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)

      const result = await initNotifications()
      expect(result).toBe(true)
      expect(mockIsPermissionGranted).toHaveBeenCalled()
      expect(mockRequestPermission).not.toHaveBeenCalled()
    })

    it('should request permission if not granted', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(false)
      mockRequestPermission.mockResolvedValue('granted')

      const result = await initNotifications()
      expect(result).toBe(true)
      expect(mockRequestPermission).toHaveBeenCalled()
    })

    it('should return false if permission denied', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(false)
      mockRequestPermission.mockResolvedValue('denied')

      const result = await initNotifications()
      expect(result).toBe(false)
    })

    it('should handle errors gracefully', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockRejectedValue(new Error('API error'))

      const result = await initNotifications()
      expect(result).toBe(false)
    })
  })

  describe('areNotificationsAvailable', () => {
    it('should return false before initialization', () => {
      expect(areNotificationsAvailable()).toBe(false)
    })

    it('should return true after successful initialization', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)

      await initNotifications()
      expect(areNotificationsAvailable()).toBe(true)
    })
  })

  describe('showNotification', () => {
    it('should return false if notifications not available', async () => {
      const result = await showNotification('Test', 'Body')
      expect(result).toBe(false)
      expect(mockSendNotification).not.toHaveBeenCalled()
    })

    it('should send notification when available', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)
      await initNotifications()

      const result = await showNotification('Test Title', 'Test Body')
      expect(result).toBe(true)
      expect(mockSendNotification).toHaveBeenCalledWith({
        title: 'Test Title',
        body: 'Test Body',
      })
    })

    it('should handle send errors gracefully', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)
      await initNotifications()

      mockSendNotification.mockImplementation(() => {
        throw new Error('Send failed')
      })

      const result = await showNotification('Test', 'Body')
      expect(result).toBe(false)
    })
  })

  describe('notifyNewComments', () => {
    const mockStory: HNItem = {
      id: 123,
      type: 'story',
      title: 'Test Story with a Very Long Title That Should Be Truncated',
      by: 'testuser',
      time: 1234567890,
      score: 100,
      descendants: 50,
    }

    it('should format notification for single comment', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)
      await initNotifications()

      await notifyNewComments(mockStory, 1)

      expect(mockSendNotification).toHaveBeenCalledWith({
        title: expect.stringContaining('New comments on'),
        body: '1 new comment',
      })
    })

    it('should format notification for multiple comments', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)
      await initNotifications()

      await notifyNewComments(mockStory, 5)

      expect(mockSendNotification).toHaveBeenCalledWith({
        title: expect.stringContaining('New comments on'),
        body: '5 new comments',
      })
    })

    it('should truncate long titles', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)
      await initNotifications()

      await notifyNewComments(mockStory, 1)

      const call = mockSendNotification.mock.calls[0][0]
      expect(call.title).toContain('...')
      expect(call.title.length).toBeLessThan(100)
    })
  })

  describe('notifyStoryUpdate', () => {
    const mockStory: HNItem = {
      id: 123,
      type: 'story',
      title: 'Test Story',
      by: 'testuser',
      time: 1234567890,
      score: 100,
    }

    it('should send notification with story title and message', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)
      await initNotifications()

      await notifyStoryUpdate(mockStory, 'Story reached 100 points!')

      expect(mockSendNotification).toHaveBeenCalledWith({
        title: 'Test Story',
        body: 'Story reached 100 points!',
      })
    })

    it('should handle missing title', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockIsPermissionGranted.mockResolvedValue(true)
      await initNotifications()

      const storyNoTitle: HNItem = {
        id: 123,
        type: 'story',
        by: 'testuser',
        time: 1234567890,
      }

      await notifyStoryUpdate(storyNoTitle, 'Update message')

      expect(mockSendNotification).toHaveBeenCalledWith({
        title: 'Story Update',
        body: 'Update message',
      })
    })
  })
})

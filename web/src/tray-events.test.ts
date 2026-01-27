/**
 * Tests for tray-events.ts module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupTrayEvents,
  configureTrayEvents,
  initTrayEvents,
} from './tray-events'

// Mock @tauri-apps/api/event module
const mockListen = vi.fn()
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}))

describe('tray-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanupTrayEvents()
  })

  afterEach(() => {
    cleanupTrayEvents()
  })

  describe('initTrayEvents', () => {
    it('should not initialize if not in Tauri environment', async () => {
      // Default test environment has no __TAURI__
      await initTrayEvents()
      expect(mockListen).not.toHaveBeenCalled()
    })

    it('should set up listeners in Tauri environment', async () => {
      // Simulate Tauri environment
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}

      const mockUnlisten = vi.fn()
      mockListen.mockResolvedValue(mockUnlisten)

      await initTrayEvents()

      // Should set up 3 listeners: feed-change, refresh, search
      expect(mockListen).toHaveBeenCalledTimes(3)
      expect(mockListen).toHaveBeenCalledWith(
        'tray-feed-change',
        expect.any(Function),
      )
      expect(mockListen).toHaveBeenCalledWith(
        'tray-refresh',
        expect.any(Function),
      )
      expect(mockListen).toHaveBeenCalledWith(
        'tray-search',
        expect.any(Function),
      )

      // Cleanup
      delete (window as unknown as Record<string, unknown>).__TAURI__
    })

    it('should handle listen errors gracefully', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
      mockListen.mockRejectedValue(new Error('Listen failed'))

      // Should not throw
      await expect(initTrayEvents()).resolves.not.toThrow()

      delete (window as unknown as Record<string, unknown>).__TAURI__
    })
  })

  describe('cleanupTrayEvents', () => {
    it('should call unlisten functions when cleaning up', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}

      const mockUnlisten = vi.fn()
      mockListen.mockResolvedValue(mockUnlisten)

      await initTrayEvents()
      cleanupTrayEvents()

      // Should call all 3 unlisten functions
      expect(mockUnlisten).toHaveBeenCalledTimes(3)

      delete (window as unknown as Record<string, unknown>).__TAURI__
    })
  })

  describe('configureTrayEvents', () => {
    it('should call onFeedChange callback with valid feed', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}

      const onFeedChange = vi.fn()
      configureTrayEvents({
        onFeedChange,
        onRefresh: vi.fn(),
        onSearch: vi.fn(),
      })

      // Capture the listener function
      let feedChangeListener: (event: { payload: string }) => void = () => {}
      mockListen.mockImplementation(
        async (
          eventName: string,
          callback: (event: { payload: string }) => void,
        ) => {
          if (eventName === 'tray-feed-change') {
            feedChangeListener = callback
          }
          return vi.fn()
        },
      )

      await initTrayEvents()

      // Simulate feed change event
      feedChangeListener({ payload: 'top' })
      expect(onFeedChange).toHaveBeenCalledWith('top')

      feedChangeListener({ payload: 'new' })
      expect(onFeedChange).toHaveBeenCalledWith('new')

      delete (window as unknown as Record<string, unknown>).__TAURI__
    })

    it('should not call onFeedChange for invalid feed', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}

      const onFeedChange = vi.fn()
      configureTrayEvents({
        onFeedChange,
        onRefresh: vi.fn(),
        onSearch: vi.fn(),
      })

      let feedChangeListener: (event: { payload: string }) => void = () => {}
      mockListen.mockImplementation(
        async (
          eventName: string,
          callback: (event: { payload: string }) => void,
        ) => {
          if (eventName === 'tray-feed-change') {
            feedChangeListener = callback
          }
          return vi.fn()
        },
      )

      await initTrayEvents()

      // Simulate invalid feed event
      feedChangeListener({ payload: 'invalid_feed' })
      expect(onFeedChange).not.toHaveBeenCalled()

      delete (window as unknown as Record<string, unknown>).__TAURI__
    })

    it('should call onRefresh callback', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}

      const onRefresh = vi.fn()
      configureTrayEvents({
        onFeedChange: vi.fn(),
        onRefresh,
        onSearch: vi.fn(),
      })

      let refreshListener: () => void = () => {}
      mockListen.mockImplementation(
        async (eventName: string, callback: () => void) => {
          if (eventName === 'tray-refresh') {
            refreshListener = callback
          }
          return vi.fn()
        },
      )

      await initTrayEvents()

      refreshListener()
      expect(onRefresh).toHaveBeenCalled()

      delete (window as unknown as Record<string, unknown>).__TAURI__
    })

    it('should call onSearch callback', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}

      const onSearch = vi.fn()
      configureTrayEvents({
        onFeedChange: vi.fn(),
        onRefresh: vi.fn(),
        onSearch,
      })

      let searchListener: () => void = () => {}
      mockListen.mockImplementation(
        async (eventName: string, callback: () => void) => {
          if (eventName === 'tray-search') {
            searchListener = callback
          }
          return vi.fn()
        },
      )

      await initTrayEvents()

      searchListener()
      expect(onSearch).toHaveBeenCalled()

      delete (window as unknown as Record<string, unknown>).__TAURI__
    })
  })

  describe('feed validation', () => {
    it('should accept all valid feed types', async () => {
      ;(window as unknown as Record<string, unknown>).__TAURI__ = {}

      const onFeedChange = vi.fn()
      configureTrayEvents({
        onFeedChange,
        onRefresh: vi.fn(),
        onSearch: vi.fn(),
      })

      let feedChangeListener: (event: { payload: string }) => void = () => {}
      mockListen.mockImplementation(
        async (
          eventName: string,
          callback: (event: { payload: string }) => void,
        ) => {
          if (eventName === 'tray-feed-change') {
            feedChangeListener = callback
          }
          return vi.fn()
        },
      )

      await initTrayEvents()

      const validFeeds = ['top', 'new', 'best', 'ask', 'show', 'jobs', 'saved']
      for (const feed of validFeeds) {
        feedChangeListener({ payload: feed })
      }

      expect(onFeedChange).toHaveBeenCalledTimes(validFeeds.length)

      delete (window as unknown as Record<string, unknown>).__TAURI__
    })
  })
})

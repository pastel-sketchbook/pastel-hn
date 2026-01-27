/**
 * Tests for global-shortcuts.ts module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isRegistered } from '@tauri-apps/plugin-global-shortcut'
import {
  configureGlobalShortcuts,
  DEFAULT_GLOBAL_SHORTCUTS,
  getGlobalShortcutCallbacks,
  isShortcutRegistered,
} from './global-shortcuts'

vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  isRegistered: vi.fn().mockResolvedValue(false),
}))

const mockIsRegistered = vi.mocked(isRegistered)

describe('global-shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('DEFAULT_GLOBAL_SHORTCUTS', () => {
    it('should define showWindow shortcut', () => {
      expect(DEFAULT_GLOBAL_SHORTCUTS.showWindow).toBe(
        'CommandOrControl+Shift+H'
      )
    })

    it('should define refresh shortcut', () => {
      expect(DEFAULT_GLOBAL_SHORTCUTS.refresh).toBe('CommandOrControl+Shift+R')
    })
  })

  describe('configureGlobalShortcuts', () => {
    it('should accept callback configuration', () => {
      const callbacks = {
        onShowWindow: vi.fn(),
        onRefresh: vi.fn(),
      }

      expect(() => configureGlobalShortcuts(callbacks)).not.toThrow()
    })

    it('should accept empty callbacks', () => {
      expect(() => configureGlobalShortcuts({})).not.toThrow()
    })

    it('should store callbacks for retrieval', () => {
      const onShowWindow = vi.fn()
      const onRefresh = vi.fn()

      configureGlobalShortcuts({ onShowWindow, onRefresh })

      const stored = getGlobalShortcutCallbacks()
      expect(stored.onShowWindow).toBe(onShowWindow)
      expect(stored.onRefresh).toBe(onRefresh)
    })
  })

  describe('isShortcutRegistered', () => {
    it('should return false when not registered', async () => {
      mockIsRegistered.mockResolvedValue(false)

      const result = await isShortcutRegistered('CommandOrControl+Shift+H')
      expect(result).toBe(false)
    })

    it('should return true when registered', async () => {
      mockIsRegistered.mockResolvedValue(true)

      const result = await isShortcutRegistered('CommandOrControl+Shift+H')
      expect(result).toBe(true)
    })

    it('should return false on error', async () => {
      mockIsRegistered.mockRejectedValue(new Error('Not available'))

      const result = await isShortcutRegistered('CommandOrControl+Shift+H')
      expect(result).toBe(false)
    })
  })
})

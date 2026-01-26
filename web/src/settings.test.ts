import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeSettingsModal,
  getSettings,
  initSettings,
  isSettingsModalOpen,
  loadSettings,
  type Settings,
  saveSettings,
  showSettingsModal,
} from './settings'
import { bookmarkStory } from './storage'
import type { CacheStats, HNItem } from './types'

// Mock theme module
vi.mock('./theme', () => ({
  setTheme: vi.fn(),
}))

// Mock API module
vi.mock('./api', () => ({
  getCacheStats: vi.fn(),
  clearCache: vi.fn(),
}))

import { setTheme } from './theme'
import { clearCache, getCacheStats } from './api'

const mockSetTheme = vi.mocked(setTheme)
const mockGetCacheStats = vi.mocked(getCacheStats)
const mockClearCache = vi.mocked(clearCache)

describe('settings', () => {
  const mockCacheStats: CacheStats = {
    itemCount: 10,
    storyIdsCount: 5,
    userCount: 3,
    itemTtlSecs: 300,
    storyIdsTtlSecs: 60,
    userTtlSecs: 600,
  }

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-font-size')
    document.documentElement.removeAttribute('data-density')
    vi.clearAllMocks()
    // Default mock returns
    mockGetCacheStats.mockResolvedValue(mockCacheStats)
    mockClearCache.mockResolvedValue(undefined)
  })

  afterEach(() => {
    closeSettingsModal()
    vi.restoreAllMocks()
  })

  describe('loadSettings', () => {
    it('returns default settings when nothing stored', () => {
      const settings = loadSettings()

      expect(settings).toEqual({
        theme: 'system',
        fontSize: 'normal',
        density: 'normal',
        defaultFeed: 'top',
      })
    })

    it('loads stored settings from localStorage', () => {
      const stored: Settings = {
        theme: 'dark',
        fontSize: 'compact',
        density: 'comfortable',
        defaultFeed: 'new',
      }
      localStorage.setItem('hn-settings', JSON.stringify(stored))

      const settings = loadSettings()

      expect(settings).toEqual(stored)
    })

    it('merges partial stored settings with defaults', () => {
      localStorage.setItem('hn-settings', JSON.stringify({ theme: 'light' }))

      const settings = loadSettings()

      expect(settings.theme).toBe('light')
      expect(settings.fontSize).toBe('normal') // default
      expect(settings.density).toBe('normal') // default
      expect(settings.defaultFeed).toBe('top') // default
    })

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('hn-settings', 'invalid json {{{')

      const settings = loadSettings()

      expect(settings).toEqual({
        theme: 'system',
        fontSize: 'normal',
        density: 'normal',
        defaultFeed: 'top',
      })
    })
  })

  describe('saveSettings', () => {
    it('saves settings to localStorage', () => {
      loadSettings() // Initialize
      saveSettings({ theme: 'dark' })

      const stored = JSON.parse(localStorage.getItem('hn-settings') || '{}')
      expect(stored.theme).toBe('dark')
    })

    it('merges with existing settings', () => {
      loadSettings()
      saveSettings({ theme: 'dark' })
      saveSettings({ fontSize: 'compact' })

      const settings = getSettings()
      expect(settings.theme).toBe('dark')
      expect(settings.fontSize).toBe('compact')
    })

    it('applies settings after saving', () => {
      loadSettings()
      saveSettings({ theme: 'light' })

      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })
  })

  describe('getSettings', () => {
    it('returns current settings', () => {
      loadSettings()
      saveSettings({ theme: 'dark', fontSize: 'comfortable' })

      const settings = getSettings()

      expect(settings.theme).toBe('dark')
      expect(settings.fontSize).toBe('comfortable')
    })

    it('returns a copy, not the original object', () => {
      loadSettings()
      const settings1 = getSettings()
      const settings2 = getSettings()

      expect(settings1).not.toBe(settings2)
      expect(settings1).toEqual(settings2)
    })
  })

  describe('applySettings', () => {
    it('applies system theme based on prefers-color-scheme', () => {
      // Mock matchMedia for dark preference
      const mockMatchMedia = vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
      })
      vi.stubGlobal('matchMedia', mockMatchMedia)

      loadSettings()
      saveSettings({ theme: 'system' })

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('applies light theme directly when selected', () => {
      loadSettings()
      saveSettings({ theme: 'light' })

      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })

    it('applies dark theme directly when selected', () => {
      loadSettings()
      saveSettings({ theme: 'dark' })

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('sets data-font-size attribute on html element', () => {
      loadSettings()
      saveSettings({ fontSize: 'compact' })

      expect(document.documentElement.getAttribute('data-font-size')).toBe(
        'compact',
      )
    })

    it('sets data-density attribute on html element', () => {
      loadSettings()
      saveSettings({ density: 'comfortable' })

      expect(document.documentElement.getAttribute('data-density')).toBe(
        'comfortable',
      )
    })
  })

  describe('initSettings', () => {
    it('loads and applies settings on init', () => {
      localStorage.setItem(
        'hn-settings',
        JSON.stringify({ theme: 'dark', fontSize: 'compact' }),
      )

      // Mock matchMedia
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: false,
          addEventListener: vi.fn(),
        }),
      )

      initSettings()

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
      expect(document.documentElement.getAttribute('data-font-size')).toBe(
        'compact',
      )
    })

    it('listens for system theme changes when using system theme', () => {
      const mockAddEventListener = vi.fn()
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: false,
          addEventListener: mockAddEventListener,
        }),
      )

      initSettings()

      expect(mockAddEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      )
    })
  })

  describe('settings modal', () => {
    beforeEach(() => {
      loadSettings()
    })

    it('showSettingsModal creates modal element', async () => {
      await showSettingsModal()

      const modal = document.querySelector('.settings-modal-overlay')
      expect(modal).not.toBeNull()
    })

    it('isSettingsModalOpen returns correct state', async () => {
      expect(isSettingsModalOpen()).toBe(false)

      await showSettingsModal()
      expect(isSettingsModalOpen()).toBe(true)

      closeSettingsModal()
      expect(isSettingsModalOpen()).toBe(false)
    })

    it('does not open multiple modals', async () => {
      await showSettingsModal()
      await showSettingsModal()
      await showSettingsModal()

      const modals = document.querySelectorAll('.settings-modal-overlay')
      expect(modals.length).toBe(1)
    })

    it('closeSettingsModal removes modal element', async () => {
      await showSettingsModal()
      closeSettingsModal()

      const modal = document.querySelector('.settings-modal-overlay')
      expect(modal).toBeNull()
    })

    it('modal contains theme options', async () => {
      await showSettingsModal()

      const lightBtn = document.querySelector(
        '[data-setting="theme"][data-value="light"]',
      )
      const darkBtn = document.querySelector(
        '[data-setting="theme"][data-value="dark"]',
      )
      const systemBtn = document.querySelector(
        '[data-setting="theme"][data-value="system"]',
      )

      expect(lightBtn).not.toBeNull()
      expect(darkBtn).not.toBeNull()
      expect(systemBtn).not.toBeNull()
    })

    it('modal contains font size options', async () => {
      await showSettingsModal()

      const compact = document.querySelector(
        '[data-setting="fontSize"][data-value="compact"]',
      )
      const normal = document.querySelector(
        '[data-setting="fontSize"][data-value="normal"]',
      )
      const comfortable = document.querySelector(
        '[data-setting="fontSize"][data-value="comfortable"]',
      )

      expect(compact).not.toBeNull()
      expect(normal).not.toBeNull()
      expect(comfortable).not.toBeNull()
    })

    it('modal contains density options', async () => {
      await showSettingsModal()

      const compact = document.querySelector(
        '[data-setting="density"][data-value="compact"]',
      )
      const normal = document.querySelector(
        '[data-setting="density"][data-value="normal"]',
      )
      const comfortable = document.querySelector(
        '[data-setting="density"][data-value="comfortable"]',
      )

      expect(compact).not.toBeNull()
      expect(normal).not.toBeNull()
      expect(comfortable).not.toBeNull()
    })

    it('modal contains default feed options', async () => {
      await showSettingsModal()

      const feeds = ['top', 'new', 'best', 'ask', 'show', 'jobs']
      for (const feed of feeds) {
        const btn = document.querySelector(
          `[data-setting="defaultFeed"][data-value="${feed}"]`,
        )
        expect(btn).not.toBeNull()
      }
    })

    it('clicking setting option updates settings', async () => {
      await showSettingsModal()

      const darkBtn = document.querySelector(
        '[data-setting="theme"][data-value="dark"]',
      ) as HTMLElement
      darkBtn.click()

      expect(getSettings().theme).toBe('dark')
    })

    it('clicking close button closes modal', async () => {
      await showSettingsModal()

      const closeBtn = document.querySelector(
        '[data-action="close-settings"]',
      ) as HTMLElement
      closeBtn.click()

      expect(isSettingsModalOpen()).toBe(false)
    })

    it('clicking backdrop closes modal', async () => {
      await showSettingsModal()

      const overlay = document.querySelector(
        '.settings-modal-overlay',
      ) as HTMLElement
      overlay.click()

      expect(isSettingsModalOpen()).toBe(false)
    })

    it('pressing Escape closes modal', async () => {
      await showSettingsModal()

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(isSettingsModalOpen()).toBe(false)
    })

    it('removes keydown listener when modal is closed via close button', async () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

      await showSettingsModal()

      const closeBtn = document.querySelector(
        '[data-action="close-settings"]',
      ) as HTMLElement
      closeBtn.click()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
      )
    })

    it('removes keydown listener when modal is closed via backdrop click', async () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

      await showSettingsModal()

      const overlay = document.querySelector(
        '.settings-modal-overlay',
      ) as HTMLElement
      overlay.click()

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
      )
    })

    it('resets settingsModalOpen even if modal element is missing', async () => {
      await showSettingsModal()
      expect(isSettingsModalOpen()).toBe(true)

      // Manually remove the modal element (simulating edge case)
      const modal = document.querySelector('.settings-modal-overlay')
      modal?.remove()

      // closeSettingsModal should still reset the state
      closeSettingsModal()
      expect(isSettingsModalOpen()).toBe(false)
    })

    it('marks current setting as active', async () => {
      saveSettings({ theme: 'dark' })
      await showSettingsModal()

      const darkBtn = document.querySelector(
        '[data-setting="theme"][data-value="dark"]',
      )
      expect(darkBtn?.classList.contains('active')).toBe(true)

      const lightBtn = document.querySelector(
        '[data-setting="theme"][data-value="light"]',
      )
      expect(lightBtn?.classList.contains('active')).toBe(false)
    })

    it('modal contains bookmarks export section', async () => {
      await showSettingsModal()

      const exportBtn = document.querySelector(
        '[data-action="export-bookmarks"]',
      )
      expect(exportBtn).not.toBeNull()
    })

    it('displays correct bookmarks count', async () => {
      // Add some bookmarks
      const story: HNItem = {
        id: 12345,
        type: 0,
        by: 'testuser',
        time: Math.floor(Date.now() / 1000),
        title: 'Test Story',
        url: 'https://example.com',
        score: 100,
        descendants: 50,
        text: null,
        kids: null,
        parent: null,
        dead: false,
        deleted: false,
      }
      bookmarkStory(story)

      await showSettingsModal()

      const countEl = document.querySelector('.bookmarks-count')
      expect(countEl?.textContent).toBe('1 stories saved')
    })

    it('clicking export button triggers download', async () => {
      // Mock URL.createObjectURL and URL.revokeObjectURL
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      })

      // Track created anchor elements
      let capturedLink: HTMLAnchorElement | null = null
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation(
        (tagName: string) => {
          const element = originalCreateElement(tagName)
          if (tagName === 'a') {
            capturedLink = element as HTMLAnchorElement
            // Mock click to prevent actual navigation
            vi.spyOn(capturedLink, 'click').mockImplementation(() => {})
          }
          return element
        },
      )

      await showSettingsModal()

      const exportBtn = document.querySelector(
        '[data-action="export-bookmarks"]',
      ) as HTMLElement
      exportBtn.click()

      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(capturedLink).not.toBeNull()
      expect(capturedLink?.click).toHaveBeenCalled()
      expect(capturedLink?.download).toMatch(
        /^pastel-hn-bookmarks-\d{4}-\d{2}-\d{2}\.json$/,
      )
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })
  })

  describe('cache management', () => {
    beforeEach(() => {
      loadSettings()
    })

    it('displays cache stats in settings modal', async () => {
      await showSettingsModal()

      const statsEl = document.querySelector('.cache-stats')
      expect(statsEl).not.toBeNull()
      // 10 items + 5 story IDs + 3 users = 18 total
      expect(statsEl?.textContent).toBe('18 items cached')
    })

    it('displays fallback when cache stats fails to load', async () => {
      mockGetCacheStats.mockRejectedValue(new Error('Failed to fetch'))

      await showSettingsModal()

      const statsEl = document.querySelector('.cache-stats')
      expect(statsEl?.textContent).toBe('Unable to load cache stats')
    })

    it('guards against NaN values in cache stats', async () => {
      mockGetCacheStats.mockResolvedValue({
        itemCount: Number.NaN,
        storyIdsCount: 5,
        userCount: Number.POSITIVE_INFINITY,
        itemTtlSecs: 300,
        storyIdsTtlSecs: 60,
        userTtlSecs: 600,
      })

      await showSettingsModal()

      const statsEl = document.querySelector('.cache-stats')
      // NaN and Infinity should be treated as 0, so only storyIdsCount (5) is counted
      expect(statsEl?.textContent).toBe('5 items cached')
    })

    it('modal contains clear cache button', async () => {
      await showSettingsModal()

      const clearBtn = document.querySelector('[data-action="clear-cache"]')
      expect(clearBtn).not.toBeNull()
    })

    it('clicking clear cache button calls clearCache API', async () => {
      await showSettingsModal()

      const clearBtn = document.querySelector(
        '[data-action="clear-cache"]',
      ) as HTMLButtonElement
      clearBtn.click()

      // Allow promise to resolve
      await vi.waitFor(() => {
        expect(mockClearCache).toHaveBeenCalled()
      })
    })

    it('clear cache button shows loading state', async () => {
      // Make clearCache hang so we can check the intermediate state
      let resolveClearCache: () => void
      mockClearCache.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveClearCache = resolve
          }),
      )

      await showSettingsModal()

      const clearBtn = document.querySelector(
        '[data-action="clear-cache"]',
      ) as HTMLButtonElement
      clearBtn.click()

      // Check loading state
      await vi.waitFor(() => {
        expect(clearBtn.disabled).toBe(true)
        expect(clearBtn.querySelector('span')?.textContent).toBe('Clearing...')
      })

      // Resolve and check final state
      resolveClearCache?.()
      await vi.waitFor(() => {
        expect(clearBtn.querySelector('span')?.textContent).toBe('Cleared!')
      })
    })

    it('updates cache stats display after clearing', async () => {
      await showSettingsModal()

      const clearBtn = document.querySelector(
        '[data-action="clear-cache"]',
      ) as HTMLButtonElement
      clearBtn.click()

      await vi.waitFor(() => {
        const statsEl = document.querySelector('.cache-stats')
        expect(statsEl?.textContent).toBe('0 items cached')
      })
    })

    it('shows error state when clear cache fails', async () => {
      mockClearCache.mockRejectedValue(new Error('Clear failed'))

      await showSettingsModal()

      const clearBtn = document.querySelector(
        '[data-action="clear-cache"]',
      ) as HTMLButtonElement
      clearBtn.click()

      await vi.waitFor(() => {
        expect(clearBtn.querySelector('span')?.textContent).toBe('Error')
      })
    })

    it('resets button text after successful clear', async () => {
      vi.useFakeTimers()

      await showSettingsModal()

      const clearBtn = document.querySelector(
        '[data-action="clear-cache"]',
      ) as HTMLButtonElement
      clearBtn.click()

      // Flush microtasks to let clearCache resolve
      await vi.advanceTimersByTimeAsync(0)

      // Should show "Cleared!" initially
      expect(clearBtn.querySelector('span')?.textContent).toBe('Cleared!')

      // Advance timer to reset (1500ms)
      await vi.advanceTimersByTimeAsync(1500)

      expect(clearBtn.querySelector('span')?.textContent).toBe('Clear Cache')
      expect(clearBtn.disabled).toBe(false)

      vi.useRealTimers()
    })

    it('resets button text after error', async () => {
      vi.useFakeTimers()
      mockClearCache.mockRejectedValue(new Error('Clear failed'))

      await showSettingsModal()

      const clearBtn = document.querySelector(
        '[data-action="clear-cache"]',
      ) as HTMLButtonElement
      clearBtn.click()

      // Flush microtasks to let clearCache reject
      await vi.advanceTimersByTimeAsync(0)

      // Should show "Error" initially
      expect(clearBtn.querySelector('span')?.textContent).toBe('Error')

      // Advance timer to reset (1500ms)
      await vi.advanceTimersByTimeAsync(1500)

      expect(clearBtn.querySelector('span')?.textContent).toBe('Clear Cache')
      expect(clearBtn.disabled).toBe(false)

      vi.useRealTimers()
    })
  })
})

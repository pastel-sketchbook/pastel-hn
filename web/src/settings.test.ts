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
import type { HNItem } from './types'

// Mock theme module
vi.mock('./theme', () => ({
  setTheme: vi.fn(),
}))

import { setTheme } from './theme'

const mockSetTheme = vi.mocked(setTheme)

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    document.documentElement.removeAttribute('data-font-size')
    document.documentElement.removeAttribute('data-density')
    vi.clearAllMocks()
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

    it('showSettingsModal creates modal element', () => {
      showSettingsModal()

      const modal = document.querySelector('.settings-modal-overlay')
      expect(modal).not.toBeNull()
    })

    it('isSettingsModalOpen returns correct state', () => {
      expect(isSettingsModalOpen()).toBe(false)

      showSettingsModal()
      expect(isSettingsModalOpen()).toBe(true)

      closeSettingsModal()
      expect(isSettingsModalOpen()).toBe(false)
    })

    it('does not open multiple modals', () => {
      showSettingsModal()
      showSettingsModal()
      showSettingsModal()

      const modals = document.querySelectorAll('.settings-modal-overlay')
      expect(modals.length).toBe(1)
    })

    it('closeSettingsModal removes modal element', () => {
      showSettingsModal()
      closeSettingsModal()

      const modal = document.querySelector('.settings-modal-overlay')
      expect(modal).toBeNull()
    })

    it('modal contains theme options', () => {
      showSettingsModal()

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

    it('modal contains font size options', () => {
      showSettingsModal()

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

    it('modal contains density options', () => {
      showSettingsModal()

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

    it('modal contains default feed options', () => {
      showSettingsModal()

      const feeds = ['top', 'new', 'best', 'ask', 'show', 'jobs']
      for (const feed of feeds) {
        const btn = document.querySelector(
          `[data-setting="defaultFeed"][data-value="${feed}"]`,
        )
        expect(btn).not.toBeNull()
      }
    })

    it('clicking setting option updates settings', () => {
      showSettingsModal()

      const darkBtn = document.querySelector(
        '[data-setting="theme"][data-value="dark"]',
      ) as HTMLElement
      darkBtn.click()

      expect(getSettings().theme).toBe('dark')
    })

    it('clicking close button closes modal', () => {
      showSettingsModal()

      const closeBtn = document.querySelector(
        '[data-action="close-settings"]',
      ) as HTMLElement
      closeBtn.click()

      expect(isSettingsModalOpen()).toBe(false)
    })

    it('clicking backdrop closes modal', () => {
      showSettingsModal()

      const overlay = document.querySelector(
        '.settings-modal-overlay',
      ) as HTMLElement
      overlay.click()

      expect(isSettingsModalOpen()).toBe(false)
    })

    it('pressing Escape closes modal', () => {
      showSettingsModal()

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(isSettingsModalOpen()).toBe(false)
    })

    it('marks current setting as active', () => {
      saveSettings({ theme: 'dark' })
      showSettingsModal()

      const darkBtn = document.querySelector(
        '[data-setting="theme"][data-value="dark"]',
      )
      expect(darkBtn?.classList.contains('active')).toBe(true)

      const lightBtn = document.querySelector(
        '[data-setting="theme"][data-value="light"]',
      )
      expect(lightBtn?.classList.contains('active')).toBe(false)
    })

    it('modal contains bookmarks export section', () => {
      showSettingsModal()

      const exportBtn = document.querySelector(
        '[data-action="export-bookmarks"]',
      )
      expect(exportBtn).not.toBeNull()
    })

    it('displays correct bookmarks count', () => {
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

      showSettingsModal()

      const countEl = document.querySelector('.bookmarks-count')
      expect(countEl?.textContent).toBe('1 stories saved')
    })

    it('clicking export button triggers download', () => {
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

      showSettingsModal()

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
})

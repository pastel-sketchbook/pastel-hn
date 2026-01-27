import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHighContrast,
  getTheme,
  HIGH_CONTRAST_STORAGE_KEY,
  initTheme,
  setHighContrast,
  setTheme,
  THEME_STORAGE_KEY,
  toggleHighContrast,
  toggleTheme,
} from './theme'

describe('theme', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    // Reset document attribute
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-high-contrast')
    // Reset matchMedia mock
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
      }),
    )
  })

  describe('getTheme', () => {
    it('returns dark when no preference is stored and system prefers dark', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
        }),
      )
      expect(getTheme()).toBe('dark')
    })

    it('returns light when no preference is stored and system prefers light', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: false,
          addEventListener: vi.fn(),
        }),
      )
      expect(getTheme()).toBe('light')
    })

    it('returns stored preference from localStorage', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light')
      expect(getTheme()).toBe('light')

      localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      expect(getTheme()).toBe('dark')
    })

    it('ignores invalid localStorage values and falls back to system preference', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
        }),
      )
      expect(getTheme()).toBe('dark')
    })
  })

  describe('setTheme', () => {
    it('sets data-theme attribute on document element', () => {
      setTheme('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

      setTheme('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('persists theme to localStorage', () => {
      setTheme('light')
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

      setTheme('dark')
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    })
  })

  describe('toggleTheme', () => {
    it('toggles from dark to light', () => {
      setTheme('dark')
      const newTheme = toggleTheme()
      expect(newTheme).toBe('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('toggles from light to dark', () => {
      setTheme('light')
      const newTheme = toggleTheme()
      expect(newTheme).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })
  })

  describe('initTheme', () => {
    it('initializes theme based on stored preference', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light')
      initTheme()
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('initializes theme based on system preference when no stored value', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
        }),
      )
      initTheme()
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('listens for system theme changes', () => {
      const addEventListenerMock = vi.fn()
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: false,
          addEventListener: addEventListenerMock,
        }),
      )
      initTheme()
      expect(addEventListenerMock).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      )
    })

    it('initializes high contrast mode', () => {
      localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, 'true')
      initTheme()
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe(
        'true',
      )
    })

    it('listens for system contrast preference changes', () => {
      const addEventListenerMock = vi.fn()
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: false,
          addEventListener: addEventListenerMock,
        }),
      )
      initTheme()
      // Should be called twice: once for color-scheme, once for contrast
      expect(addEventListenerMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('getHighContrast', () => {
    it('returns true when stored preference is "true"', () => {
      localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, 'true')
      expect(getHighContrast()).toBe(true)
    })

    it('returns false when stored preference is "false"', () => {
      localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, 'false')
      expect(getHighContrast()).toBe(false)
    })

    it('returns false when no preference and system does not prefer contrast', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: false,
          addEventListener: vi.fn(),
        }),
      )
      expect(getHighContrast()).toBe(false)
    })

    it('returns true when no preference and system prefers more contrast', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
        }),
      )
      expect(getHighContrast()).toBe(true)
    })
  })

  describe('setHighContrast', () => {
    it('sets data-high-contrast attribute when enabled', () => {
      setHighContrast(true)
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe(
        'true',
      )
    })

    it('removes data-high-contrast attribute when disabled', () => {
      document.documentElement.setAttribute('data-high-contrast', 'true')
      setHighContrast(false)
      expect(
        document.documentElement.getAttribute('data-high-contrast'),
      ).toBeNull()
    })

    it('persists enabled state to localStorage', () => {
      setHighContrast(true)
      expect(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)).toBe('true')
    })

    it('persists disabled state to localStorage', () => {
      setHighContrast(false)
      expect(localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)).toBe('false')
    })
  })

  describe('toggleHighContrast', () => {
    it('toggles from false to true', () => {
      setHighContrast(false)
      const newState = toggleHighContrast()
      expect(newState).toBe(true)
      expect(document.documentElement.getAttribute('data-high-contrast')).toBe(
        'true',
      )
    })

    it('toggles from true to false', () => {
      setHighContrast(true)
      const newState = toggleHighContrast()
      expect(newState).toBe(false)
      expect(
        document.documentElement.getAttribute('data-high-contrast'),
      ).toBeNull()
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getTheme,
  initTheme,
  setTheme,
  THEME_STORAGE_KEY,
  toggleTheme,
} from './theme'

describe('theme', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    // Reset document attribute
    document.documentElement.removeAttribute('data-theme')
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
  })
})

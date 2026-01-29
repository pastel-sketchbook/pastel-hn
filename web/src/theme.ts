/**
 * Theme management module for dark/light mode toggle
 * Maintains Cyberpunk aesthetic in both themes
 * Includes high contrast mode for accessibility (WCAG AAA)
 */

export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'pastel-hn-theme'
export const HIGH_CONTRAST_STORAGE_KEY = 'pastel-hn-high-contrast'

// Callback for external state updates
type ThemeChangeCallback = () => void
type HighContrastChangeCallback = (isHighContrast: boolean) => void
let onThemeChangeCallback: ThemeChangeCallback | null = null
let onHighContrastChangeCallback: HighContrastChangeCallback | null = null

/**
 * Get the current theme based on:
 * 1. Stored preference in localStorage (if valid)
 * 2. System preference via prefers-color-scheme
 */
export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') {
    return stored
  }
  // Fall back to system preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Set the theme and persist to localStorage
 */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  // Notify callback of theme change
  onThemeChangeCallback?.()
}

/**
 * Set a callback to be called when theme changes
 * This allows external code to react to theme state changes (e.g., refresh virtual scroll)
 */
export function setThemeChangeCallback(
  callback: ThemeChangeCallback | null,
): void {
  onThemeChangeCallback = callback
}

/**
 * Set a callback to be called when high contrast changes
 * This allows external code to react to high contrast state changes
 */
export function setHighContrastChangeCallback(
  callback: HighContrastChangeCallback | null,
): void {
  onHighContrastChangeCallback = callback
}

/**
 * Toggle between dark and light themes
 * Returns the new theme
 */
export function toggleTheme(): Theme {
  const current = document.documentElement.getAttribute('data-theme') as Theme
  const newTheme: Theme = current === 'dark' ? 'light' : 'dark'
  setTheme(newTheme)
  return newTheme
}

/**
 * Initialize theme on page load
 * Sets up system preference listener
 */
export function initTheme(): void {
  const theme = getTheme()
  setTheme(theme)

  // Initialize high contrast mode
  const highContrast = getHighContrast()
  setHighContrast(highContrast)

  // Listen for system theme changes (only affects if no stored preference)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', (e) => {
    // Only update if user hasn't set a preference
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (!stored || (stored !== 'dark' && stored !== 'light')) {
      setTheme(e.matches ? 'dark' : 'light')
    }
  })

  // Listen for system high contrast preference
  const contrastQuery = window.matchMedia('(prefers-contrast: more)')
  contrastQuery.addEventListener('change', (e) => {
    // Only update if user hasn't set a preference
    const stored = localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)
    if (stored === null) {
      setHighContrast(e.matches)
    }
  })
}

/**
 * Get the current high contrast mode based on:
 * 1. Stored preference in localStorage
 * 2. System preference via prefers-contrast: more
 */
export function getHighContrast(): boolean {
  const stored = localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY)
  if (stored === 'true') {
    return true
  }
  if (stored === 'false') {
    return false
  }
  // Fall back to system preference
  return window.matchMedia('(prefers-contrast: more)').matches
}

/**
 * Set high contrast mode and persist to localStorage
 */
export function setHighContrast(enabled: boolean): void {
  if (enabled) {
    document.documentElement.setAttribute('data-high-contrast', 'true')
  } else {
    document.documentElement.removeAttribute('data-high-contrast')
  }
  localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(enabled))
  // Notify callback of high contrast change
  onHighContrastChangeCallback?.(enabled)
}

/**
 * Toggle high contrast mode
 * Returns the new state
 */
export function toggleHighContrast(): boolean {
  const current =
    document.documentElement.getAttribute('data-high-contrast') === 'true'
  const newState = !current
  setHighContrast(newState)
  return newState
}

/**
 * Theme management module for dark/light mode toggle
 * Maintains Cyberpunk aesthetic in both themes
 */

export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'wasm-hn-theme'

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
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Set the theme and persist to localStorage
 */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(THEME_STORAGE_KEY, theme)
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

  // Listen for system theme changes (only affects if no stored preference)
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', (e) => {
    // Only update if user hasn't set a preference
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (!stored || (stored !== 'dark' && stored !== 'light')) {
      setTheme(e.matches ? 'dark' : 'light')
    }
  })
}

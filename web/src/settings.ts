/**
 * Settings panel for user preferences
 */

import { clearCache, getCacheStats } from './api'
import { createFocusTrap, type FocusTrapInstance } from './focus-trap'
import { KEYBOARD_SHORTCUTS } from './keyboard'
import {
  clearReadingHistory,
  exportBookmarksAsJson,
  getBookmarksCount,
  getReadStoriesCount,
} from './storage'
import { setTheme, type Theme } from './theme'
import type { CacheStats } from './types'

export type FontSize = 'compact' | 'normal' | 'comfortable'
export type Density = 'compact' | 'normal' | 'comfortable'
export type DefaultFeed = 'top' | 'new' | 'best' | 'ask' | 'show' | 'jobs'

export interface Settings {
  theme: Theme | 'system'
  fontSize: FontSize
  density: Density
  defaultFeed: DefaultFeed
}

const STORAGE_KEY = 'hn-settings'

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 'normal',
  density: 'normal',
  defaultFeed: 'top',
}

let currentSettings: Settings = { ...DEFAULT_SETTINGS }
let settingsModalOpen = false
let focusTrap: FocusTrapInstance | null = null

// SVG icons for settings
const settingsIcons = {
  settings: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  close: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  moon: `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  monitor: `<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
  type: `<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
  layout: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
  home: `<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  keyboard: `<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="10" y2="8"/><line x1="14" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="6" y2="12"/><line x1="10" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="14" y2="12"/><line x1="18" y1="12" x2="18" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/></svg>`,
  history: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  database: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
}

/**
 * Load settings from localStorage
 */
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch {
    currentSettings = { ...DEFAULT_SETTINGS }
  }
  return currentSettings
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: Partial<Settings>): void {
  currentSettings = { ...currentSettings, ...settings }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings))
  applySettings()
}

/**
 * Get current settings
 */
export function getSettings(): Settings {
  return { ...currentSettings }
}

/**
 * Apply settings to the DOM
 */
export function applySettings(): void {
  const html = document.documentElement

  // Apply theme
  if (currentSettings.theme === 'system') {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    setTheme(prefersDark ? 'dark' : 'light')
  } else {
    setTheme(currentSettings.theme)
  }

  // Apply font size
  html.setAttribute('data-font-size', currentSettings.fontSize)

  // Apply density
  html.setAttribute('data-density', currentSettings.density)
}

/**
 * Initialize settings system
 */
export function initSettings(): void {
  loadSettings()
  applySettings()

  // Listen for system theme changes when using 'system' theme
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (currentSettings.theme === 'system') {
        applySettings()
      }
    })
}

/**
 * Show the settings modal
 */
export async function showSettingsModal(): Promise<void> {
  if (settingsModalOpen) return
  settingsModalOpen = true

  // Fetch cache stats in parallel while building the modal
  let cacheStats: CacheStats | null = null
  try {
    cacheStats = await getCacheStats()
  } catch {
    // Ignore errors - we'll show a fallback UI
  }

  const modal = document.createElement('div')
  modal.className = 'settings-modal-overlay'
  modal.innerHTML = `
    <div class="settings-modal cyber-frame">
      <span class="corner-tr"></span>
      <span class="corner-bl"></span>
      
      <div class="settings-header">
        <h2 class="settings-title">${settingsIcons.settings}Settings</h2>
        <button class="settings-close-btn" data-action="close-settings" aria-label="Close settings">
          ${settingsIcons.close}
        </button>
      </div>
      
      <div class="settings-content">
        <!-- Theme -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.sun}Theme</h3>
          <div class="settings-options theme-options">
            <button class="settings-option ${currentSettings.theme === 'light' ? 'active' : ''}" data-setting="theme" data-value="light">
              ${settingsIcons.sun}
              <span>Light</span>
            </button>
            <button class="settings-option ${currentSettings.theme === 'dark' ? 'active' : ''}" data-setting="theme" data-value="dark">
              ${settingsIcons.moon}
              <span>Dark</span>
            </button>
            <button class="settings-option ${currentSettings.theme === 'system' ? 'active' : ''}" data-setting="theme" data-value="system">
              ${settingsIcons.monitor}
              <span>System</span>
            </button>
          </div>
        </div>
        
        <!-- Font Size -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.type}Font Size</h3>
          <div class="settings-options">
            <button class="settings-option ${currentSettings.fontSize === 'compact' ? 'active' : ''}" data-setting="fontSize" data-value="compact">
              <span>Compact</span>
            </button>
            <button class="settings-option ${currentSettings.fontSize === 'normal' ? 'active' : ''}" data-setting="fontSize" data-value="normal">
              <span>Normal</span>
            </button>
            <button class="settings-option ${currentSettings.fontSize === 'comfortable' ? 'active' : ''}" data-setting="fontSize" data-value="comfortable">
              <span>Comfortable</span>
            </button>
          </div>
        </div>
        
        <!-- Density -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.layout}Density</h3>
          <div class="settings-options">
            <button class="settings-option ${currentSettings.density === 'compact' ? 'active' : ''}" data-setting="density" data-value="compact">
              <span>Compact</span>
            </button>
            <button class="settings-option ${currentSettings.density === 'normal' ? 'active' : ''}" data-setting="density" data-value="normal">
              <span>Normal</span>
            </button>
            <button class="settings-option ${currentSettings.density === 'comfortable' ? 'active' : ''}" data-setting="density" data-value="comfortable">
              <span>Comfortable</span>
            </button>
          </div>
        </div>
        
        <!-- Default Feed -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.home}Default Feed</h3>
          <div class="settings-options feed-options">
            <button class="settings-option ${currentSettings.defaultFeed === 'top' ? 'active' : ''}" data-setting="defaultFeed" data-value="top">
              <span>Top</span>
            </button>
            <button class="settings-option ${currentSettings.defaultFeed === 'new' ? 'active' : ''}" data-setting="defaultFeed" data-value="new">
              <span>New</span>
            </button>
            <button class="settings-option ${currentSettings.defaultFeed === 'best' ? 'active' : ''}" data-setting="defaultFeed" data-value="best">
              <span>Best</span>
            </button>
            <button class="settings-option ${currentSettings.defaultFeed === 'ask' ? 'active' : ''}" data-setting="defaultFeed" data-value="ask">
              <span>Ask</span>
            </button>
            <button class="settings-option ${currentSettings.defaultFeed === 'show' ? 'active' : ''}" data-setting="defaultFeed" data-value="show">
              <span>Show</span>
            </button>
            <button class="settings-option ${currentSettings.defaultFeed === 'jobs' ? 'active' : ''}" data-setting="defaultFeed" data-value="jobs">
              <span>Jobs</span>
            </button>
          </div>
        </div>
        
        <!-- Reading History -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.history}Reading History</h3>
          <div class="settings-history">
            <span class="history-count">${getReadStoriesCount()} stories read</span>
            <button class="settings-clear-btn" data-action="clear-history">
              ${settingsIcons.trash}
              <span>Clear History</span>
            </button>
          </div>
        </div>
        
        <!-- Bookmarks Export -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.bookmark}Bookmarks</h3>
          <div class="settings-bookmarks">
            <span class="bookmarks-count">${getBookmarksCount()} stories saved</span>
            <button class="settings-export-btn" data-action="export-bookmarks">
              ${settingsIcons.download}
              <span>Export JSON</span>
            </button>
          </div>
        </div>
        
        <!-- Cache Management -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.database}Cache</h3>
          <div class="settings-cache">
            ${renderCacheStats(cacheStats)}
            <button class="settings-clear-cache-btn" data-action="clear-cache">
              ${settingsIcons.trash}
              <span>Clear Cache</span>
            </button>
          </div>
        </div>
        
        <!-- Keyboard Shortcuts -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.keyboard}Keyboard Shortcuts</h3>
          <div class="settings-shortcuts">
            ${KEYBOARD_SHORTCUTS.map(
              (s) => `
              <div class="settings-shortcut">
                <kbd>${s.key}</kbd>
                <span>${s.description}</span>
              </div>
            `,
            ).join('')}
          </div>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)

  // Set up focus trap
  const modalContent = modal.querySelector('.settings-modal') as HTMLElement
  if (modalContent) {
    focusTrap = createFocusTrap(modalContent)
    focusTrap.activate()
  }

  // Handle clicks
  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // Close on backdrop click
    if (target === modal) {
      closeSettingsModal()
      return
    }

    // Close button
    if (target.closest('[data-action="close-settings"]')) {
      closeSettingsModal()
      return
    }

    // Setting option click
    const optionBtn = target.closest('[data-setting]') as HTMLElement
    if (optionBtn) {
      const setting = optionBtn.dataset.setting as keyof Settings
      const value = optionBtn.dataset.value

      if (setting && value) {
        // Update active state
        const section = optionBtn.closest('.settings-options')
        if (section) {
          section.querySelectorAll('.settings-option').forEach((btn) => {
            btn.classList.remove('active')
          })
          optionBtn.classList.add('active')
        }

        // Save setting
        saveSettings({ [setting]: value })
      }
    }

    // Clear history button click
    if (target.closest('[data-action="clear-history"]')) {
      clearReadingHistory()
      // Update the count display
      const countEl = modal.querySelector('.history-count')
      if (countEl) {
        countEl.textContent = '0 stories read'
      }
      // Dispatch event so main.ts can update its readStoryIds cache
      window.dispatchEvent(new CustomEvent('reading-history-cleared'))
    }

    // Export bookmarks button click
    if (target.closest('[data-action="export-bookmarks"]')) {
      downloadBookmarksExport()
    }

    // Clear cache button click
    if (target.closest('[data-action="clear-cache"]')) {
      handleClearCache(modal)
    }
  })

  // Handle escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeSettingsModal()
      document.removeEventListener('keydown', handleEscape)
    }
  }
  document.addEventListener('keydown', handleEscape)
}

/**
 * Close the settings modal
 */
export function closeSettingsModal(): void {
  // Deactivate focus trap first
  if (focusTrap) {
    focusTrap.deactivate()
    focusTrap = null
  }

  const modal = document.querySelector('.settings-modal-overlay')
  if (modal) {
    modal.remove()
    settingsModalOpen = false
  }
}

/**
 * Check if settings modal is open
 */
export function isSettingsModalOpen(): boolean {
  return settingsModalOpen
}

/**
 * Trigger a file download with the given content
 */
function downloadBookmarksExport(): void {
  const json = exportBookmarksAsJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `pastel-hn-bookmarks-${formatExportDate()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Format current date for export filename (YYYY-MM-DD)
 */
function formatExportDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Render cache statistics HTML
 */
function renderCacheStats(stats: CacheStats | null): string {
  if (!stats) {
    return `<span class="cache-stats">Unable to load cache stats</span>`
  }

  const totalItems = stats.itemCount + stats.storyIdsCount + stats.userCount
  return `<span class="cache-stats">${totalItems} items cached</span>`
}

/**
 * Handle clear cache button click
 */
async function handleClearCache(modal: HTMLElement): Promise<void> {
  const btn = modal.querySelector(
    '[data-action="clear-cache"]',
  ) as HTMLButtonElement | null
  const statsEl = modal.querySelector('.cache-stats')

  if (btn) {
    btn.disabled = true
    const spanEl = btn.querySelector('span')
    const originalText = spanEl?.textContent

    if (spanEl) {
      spanEl.textContent = 'Clearing...'
    }

    try {
      await clearCache()
      if (statsEl) {
        statsEl.textContent = '0 items cached'
      }
      if (spanEl) {
        spanEl.textContent = 'Cleared!'
      }
      // Reset button text after a delay
      setTimeout(() => {
        if (spanEl) {
          spanEl.textContent = originalText ?? 'Clear Cache'
        }
        btn.disabled = false
      }, 1500)
    } catch {
      if (spanEl) {
        spanEl.textContent = 'Error'
      }
      setTimeout(() => {
        if (spanEl) {
          spanEl.textContent = originalText ?? 'Clear Cache'
        }
        btn.disabled = false
      }, 1500)
    }
  }
}

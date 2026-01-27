/**
 * Settings panel for user preferences
 *
 * This module provides:
 * - Settings management (load, save, apply)
 * - Settings modal UI with theme, font size, density, and feed options
 * - Reading history and bookmarks management
 * - Cache management
 * - Settings import/export functionality
 *
 * @module settings
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
import { escapeHtml } from './utils'

/**
 * Font size preference options
 * - `compact`: Smaller text for information density
 * - `normal`: Default balanced size
 * - `comfortable`: Larger text for easier reading
 */
type FontSize = 'compact' | 'normal' | 'comfortable'

/**
 * UI density preference options
 * Controls spacing between elements
 * - `compact`: Minimal spacing, more content visible
 * - `normal`: Balanced spacing
 * - `comfortable`: More spacing for relaxed browsing
 */
type Density = 'compact' | 'normal' | 'comfortable'

/**
 * Default feed to show on app launch
 */
type DefaultFeed = 'top' | 'new' | 'best' | 'ask' | 'show' | 'jobs'

/**
 * User settings configuration
 * Persisted to localStorage under 'hn-settings' key
 */
export interface Settings {
  /** Color theme preference (light, dark, or follow system) */
  theme: Theme | 'system'
  /** Font size preference */
  fontSize: FontSize
  /** UI density preference */
  density: Density
  /** Default feed shown on app launch */
  defaultFeed: DefaultFeed
}

/** localStorage key for persisting settings */
const STORAGE_KEY = 'hn-settings'

/** Default settings applied on first run or when storage is unavailable */
const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 'normal',
  density: 'normal',
  defaultFeed: 'top',
}

/** Current in-memory settings state */
let currentSettings: Settings = { ...DEFAULT_SETTINGS }

/** Whether the settings modal is currently open */
let settingsModalOpen = false

/** Active focus trap instance for modal accessibility */
let focusTrap: FocusTrapInstance | null = null

/** Keyboard handler for Escape key to close modal */
let escapeHandler: ((e: KeyboardEvent) => void) | null = null

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
  upload: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  database: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
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
 * Update a single setting with type safety
 */
function updateSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): void {
  saveSettings({ [key]: value } as Pick<Settings, K>)
}

/**
 * Type guard to check if a string is a valid Settings key
 */
function isValidSettingKey(key: string): key is keyof Settings {
  return ['theme', 'fontSize', 'density', 'defaultFeed'].includes(key)
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

  // Fetch cache stats before rendering the modal
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
        
        <!-- Settings Backup -->
        <div class="settings-section">
          <h3 class="settings-section-title">${settingsIcons.sliders}Settings Backup</h3>
          <div class="settings-backup">
            <button class="settings-backup-btn" data-action="export-settings">
              ${settingsIcons.download}
              <span>Export</span>
            </button>
            <button class="settings-backup-btn" data-action="import-settings">
              ${settingsIcons.upload}
              <span>Import</span>
            </button>
            <input type="file" id="settings-import-input" accept=".json" style="display: none" />
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
      const setting = optionBtn.dataset.setting
      const value = optionBtn.dataset.value

      if (setting && value && isValidSettingKey(setting)) {
        // Update active state
        const section = optionBtn.closest('.settings-options')
        if (section) {
          section.querySelectorAll('.settings-option').forEach((btn) => {
            btn.classList.remove('active')
          })
          optionBtn.classList.add('active')
        }

        // Save setting with type-safe helper
        updateSetting(setting, value as Settings[typeof setting])
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

    // Export settings button click
    if (target.closest('[data-action="export-settings"]')) {
      downloadSettingsExport()
    }

    // Import settings button click
    if (target.closest('[data-action="import-settings"]')) {
      const fileInput = modal.querySelector(
        '#settings-import-input',
      ) as HTMLInputElement
      fileInput?.click()
    }
  })

  // Handle file input change for import
  const fileInput = modal.querySelector(
    '#settings-import-input',
  ) as HTMLInputElement
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement
      const file = input.files?.[0]
      if (file) {
        handleSettingsImport(file, modal)
        // Reset the input so the same file can be selected again
        input.value = ''
      }
    })
  }

  // Handle escape key
  escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeSettingsModal()
    }
  }
  document.addEventListener('keydown', escapeHandler)
}

/**
 * Close the settings modal
 */
export function closeSettingsModal(): void {
  // Remove escape key listener
  if (escapeHandler) {
    document.removeEventListener('keydown', escapeHandler)
    escapeHandler = null
  }

  // Deactivate focus trap
  if (focusTrap) {
    focusTrap.deactivate()
    focusTrap = null
  }

  // Remove modal from DOM
  const modal = document.querySelector('.settings-modal-overlay')
  if (modal) {
    modal.remove()
  }

  // Always reset state
  settingsModalOpen = false
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
  const filename = `pastel-hn-bookmarks-${formatExportDate()}.json`

  void triggerDownloadWithFallback(json, filename, 'Bookmarks')
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

  // Guard against invalid values (NaN, negative, non-finite)
  const itemCount = Number.isFinite(stats.itemCount) ? stats.itemCount : 0
  const storyIdsCount = Number.isFinite(stats.storyIdsCount)
    ? stats.storyIdsCount
    : 0
  const userCount = Number.isFinite(stats.userCount) ? stats.userCount : 0

  const totalItems = itemCount + storyIdsCount + userCount
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

/**
 * Export settings as JSON file download
 */
function downloadSettingsExport(): void {
  const settings = getSettings()
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
  }
  const json = JSON.stringify(exportData, null, 2)
  const filename = `pastel-hn-settings-${formatExportDate()}.json`

  void triggerDownloadWithFallback(json, filename, 'Settings')
}

/**
 * Result of attempting to save via Tauri dialog
 * - `success`: File was saved successfully
 * - `cancelled`: User cancelled the save dialog
 * - `unavailable`: Tauri APIs not available (web browser context)
 */
type SaveResult = 'success' | 'cancelled' | 'unavailable'

/**
 * Attempt to save a file using Tauri's native dialog, with web fallback
 */
async function triggerDownloadWithFallback(
  content: string,
  filename: string,
  title: string,
): Promise<void> {
  // Try Tauri native save dialog first
  const result = await saveWithTauriDialog(content, filename)

  if (result === 'success') {
    return // Native save worked
  }

  if (result === 'cancelled') {
    return // User cancelled - do nothing, don't fallback
  }

  // Tauri unavailable - use web download with fallback dialog
  triggerWebDownload(content, filename, title)
}

/**
 * Save file using Tauri's native file dialog and fs APIs
 */
async function saveWithTauriDialog(
  content: string,
  filename: string,
): Promise<SaveResult> {
  try {
    // Dynamically import Tauri plugins (only available in Tauri context)
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')

    const filePath = await save({
      title: 'Export File',
      defaultPath: filename,
      filters: [
        {
          name: 'JSON',
          extensions: ['json'],
        },
      ],
    })

    if (filePath) {
      await writeTextFile(filePath, content)
      return 'success'
    }

    // User cancelled the dialog
    return 'cancelled'
  } catch {
    // Tauri not available (running in browser) or other error
    return 'unavailable'
  }
}

/**
 * Trigger a web-based file download with fallback dialog
 * Shows the copy dialog as a fallback since we can't detect download failures
 */
function triggerWebDownload(
  content: string,
  filename: string,
  title: string,
): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Delay revoking URL to allow download to start (1s for slower systems)
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  // In non-Tauri environments (web), we intentionally always show the copy dialog
  // because web downloads can silently fail and there's no way to detect failure.
  // This only runs when Tauri native dialog is unavailable (see triggerDownloadWithFallback).
  showExportDialog(content, filename, title)
}

// Track the current export dialog's keydown handler for cleanup
let exportDialogKeydownHandler: ((e: KeyboardEvent) => void) | null = null

/**
 * Show export dialog with JSON content for manual copy
 * This dialog appears as a fallback when automatic download fails
 * or in web browser context where Tauri APIs are unavailable.
 *
 * @param content - JSON string content to display
 * @param filename - Suggested filename for manual save
 * @param title - Display title for the dialog (e.g., "Bookmarks", "Settings")
 */
export function showExportDialog(
  content: string,
  filename: string,
  title: string,
): void {
  // Clean up any existing dialog first
  closeExportDialog()

  const dialog = document.createElement('div')
  dialog.className = 'export-dialog-overlay'
  dialog.innerHTML = `
    <div class="export-dialog cyber-frame">
      <div class="export-dialog-header">
        <h2 class="export-dialog-title">
          ${settingsIcons.download}
          Export ${title}
        </h2>
        <button class="export-dialog-close" data-action="close-export-dialog">
          ${settingsIcons.close}
        </button>
      </div>
      <div class="export-dialog-content">
        <p class="export-dialog-info">
          If the download didn't start automatically, copy the content below and save it as <code>${filename}</code>
        </p>
        <div class="export-dialog-actions">
          <button class="export-dialog-copy-btn" data-action="copy-export">
            ${settingsIcons.copy}
            <span>Copy to Clipboard</span>
          </button>
        </div>
        <textarea class="export-dialog-textarea" readonly>${escapeHtml(content)}</textarea>
      </div>
    </div>
  `

  document.body.appendChild(dialog)

  // Handle click events
  dialog.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // Close on backdrop click
    if (target === dialog) {
      closeExportDialog()
      return
    }

    // Close button
    if (target.closest('[data-action="close-export-dialog"]')) {
      closeExportDialog()
      return
    }

    // Copy button
    if (target.closest('[data-action="copy-export"]')) {
      const btn = target.closest(
        '[data-action="copy-export"]',
      ) as HTMLButtonElement
      const textarea = dialog.querySelector(
        '.export-dialog-textarea',
      ) as HTMLTextAreaElement

      navigator.clipboard
        .writeText(textarea.value)
        .then(() => {
          const spanEl = btn.querySelector('span')
          if (spanEl) {
            spanEl.textContent = 'Copied!'
            btn.innerHTML = `${settingsIcons.check}<span>Copied!</span>`
          }
          setTimeout(() => {
            btn.innerHTML = `${settingsIcons.copy}<span>Copy to Clipboard</span>`
          }, 2000)
        })
        .catch(() => {
          // Fallback: select the text
          textarea.select()
          textarea.setSelectionRange(0, textarea.value.length)
        })
      return
    }
  })

  // Handle Escape key - store handler for cleanup
  exportDialogKeydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeExportDialog()
    }
  }
  document.addEventListener('keydown', exportDialogKeydownHandler)
}

/**
 * Close the export dialog and clean up event listeners
 */
function closeExportDialog(): void {
  // Remove keydown listener if it exists
  if (exportDialogKeydownHandler) {
    document.removeEventListener('keydown', exportDialogKeydownHandler)
    exportDialogKeydownHandler = null
  }

  // Remove dialog from DOM
  const dialog = document.querySelector('.export-dialog-overlay')
  dialog?.remove()
}

/**
 * Validate imported settings object
 * Ensures all required fields are present and have valid values.
 *
 * @param data - Unknown data to validate (typically parsed JSON)
 * @returns Validated Settings object if valid, null otherwise
 */
export function validateSettings(data: unknown): Settings | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const obj = data as Record<string, unknown>

  // Check if it's a wrapped export format
  const settingsObj =
    'settings' in obj && typeof obj.settings === 'object'
      ? (obj.settings as Record<string, unknown>)
      : obj

  // Validate theme
  const validThemes = ['light', 'dark', 'system']
  const theme = settingsObj.theme
  if (typeof theme !== 'string' || !validThemes.includes(theme)) {
    return null
  }

  // Validate fontSize
  const validFontSizes = ['compact', 'normal', 'comfortable']
  const fontSize = settingsObj.fontSize
  if (typeof fontSize !== 'string' || !validFontSizes.includes(fontSize)) {
    return null
  }

  // Validate density
  const validDensities = ['compact', 'normal', 'comfortable']
  const density = settingsObj.density
  if (typeof density !== 'string' || !validDensities.includes(density)) {
    return null
  }

  // Validate defaultFeed
  const validFeeds = ['top', 'new', 'best', 'ask', 'show', 'jobs']
  const defaultFeed = settingsObj.defaultFeed
  if (typeof defaultFeed !== 'string' || !validFeeds.includes(defaultFeed)) {
    return null
  }

  return {
    theme: theme as Settings['theme'],
    fontSize: fontSize as Settings['fontSize'],
    density: density as Settings['density'],
    defaultFeed: defaultFeed as Settings['defaultFeed'],
  }
}

/**
 * Handle settings file import
 */
async function handleSettingsImport(
  file: File,
  modal: HTMLElement,
): Promise<void> {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const validatedSettings = validateSettings(data)

    if (!validatedSettings) {
      showImportResult(modal, false, 'Invalid settings file format')
      return
    }

    // Apply all settings
    saveSettings(validatedSettings)

    // Update the active states in the modal
    updateModalActiveStates(modal, validatedSettings)

    showImportResult(modal, true, 'Settings imported successfully')
  } catch {
    showImportResult(modal, false, 'Failed to parse settings file')
  }
}

/**
 * Update active states in modal after import
 */
function updateModalActiveStates(modal: HTMLElement, settings: Settings): void {
  // Update each setting group
  for (const [key, value] of Object.entries(settings)) {
    const buttons = modal.querySelectorAll(`[data-setting="${key}"]`)
    for (const btn of buttons) {
      if (btn instanceof HTMLElement) {
        if (btn.dataset.value === value) {
          btn.classList.add('active')
        } else {
          btn.classList.remove('active')
        }
      }
    }
  }
}

/**
 * Show import result feedback
 */
function showImportResult(
  modal: HTMLElement,
  success: boolean,
  message: string,
): void {
  const backupSection = modal.querySelector(
    '.settings-backup',
  ) as HTMLElement | null
  if (!backupSection) return

  // Remove any existing feedback
  const existingFeedback = backupSection.querySelector('.import-feedback')
  existingFeedback?.remove()

  // Create feedback element
  const feedback = document.createElement('span')
  feedback.className = `import-feedback ${success ? 'success' : 'error'}`
  feedback.textContent = message
  backupSection.appendChild(feedback)

  // Remove feedback after delay
  setTimeout(() => {
    feedback.remove()
  }, 3000)
}

/**
 * Keyboard navigation module for pastel-hn
 *
 * Provides keyboard shortcuts for:
 * - j/k: Navigate up/down in lists
 * - Enter/o: Open/select items
 * - Escape: Go back/close modals
 * - 1-7: Switch between feeds
 * - ?: Show help modal
 * - /: Open search
 * - r: Refresh current view
 * - t: Scroll to top
 * - d: Toggle dark/light theme
 * - z: Toggle zen mode
 * - c: Focus comments section
 * - Cmd/Ctrl+Q: Quit app
 */

import type { StoryFeed } from './types'

// Keyboard navigation state
let selectedIndex = -1
let isEnabled = true

/**
 * Callback functions for keyboard actions
 * Set via setKeyboardCallbacks()
 */
type KeyboardCallback = {
  /** Called when navigating to a new index */
  onNavigate?: (index: number) => void
  /** Called when selecting/opening an item */
  onSelect?: (index: number) => void
  /** Called when pressing Escape */
  onBack?: () => void
  /** Called to navigate back to list view */
  onBackToList?: () => void
  /** Called when pressing 'r' to refresh */
  onRefresh?: () => void
  /** Called when pressing 'o' to open external link */
  onOpenExternal?: (index: number) => void
  /** Called when pressing 1-7 to change feed */
  onFeedChange?: (feed: StoryFeed) => void
  /** Called when pressing '?' to show help */
  onHelp?: () => void
  /** Called when pressing 't' to scroll to top */
  onScrollToTop?: () => void
  /** Called when pressing '/' to open search */
  onSearch?: () => void
  /** Called when pressing 'c' to focus comments */
  onFocusComments?: () => void
  /** Called when pressing 'z' to toggle zen mode */
  onZenMode?: () => void
  /** Called when pressing 'd' to toggle theme */
  onToggleTheme?: () => void
  /** Called when pressing Cmd/Ctrl+Q to quit */
  onQuit?: () => void
}

let callbacks: KeyboardCallback = {}

/** Map of number keys to feed names */
const FEED_KEYS: Record<string, StoryFeed> = {
  '1': 'top',
  '2': 'new',
  '3': 'best',
  '4': 'ask',
  '5': 'show',
  '6': 'jobs',
  '7': 'saved',
}

/**
 * Set keyboard callback functions
 * @param cb - Object containing callback functions for keyboard events
 */
export function setKeyboardCallbacks(cb: KeyboardCallback): void {
  callbacks = cb
}

/**
 * Get the currently selected item index
 * @returns Current selection index (-1 if nothing selected)
 */
export function getSelectedIndex(): number {
  return selectedIndex
}

/**
 * Set the selected item index and update visual selection
 * @param index - New selection index
 */
export function setSelectedIndex(index: number): void {
  selectedIndex = index
  updateSelection()
}

/**
 * Reset selection to initial state (nothing selected)
 */
export function resetSelection(): void {
  selectedIndex = -1
  clearSelection()
}

function getSelectableItems(): NodeListOf<Element> {
  // In list view, select stories; in detail view, select comments
  const stories = document.querySelectorAll('.story')
  if (stories.length > 0) return stories

  const comments = document.querySelectorAll('.comment[data-depth="0"]')
  return comments
}

function clearSelection(): void {
  document.querySelectorAll('.keyboard-selected').forEach((el) => {
    el.classList.remove('keyboard-selected')
  })
}

function updateSelection(): void {
  clearSelection()
  const items = getSelectableItems()
  if (selectedIndex >= 0 && selectedIndex < items.length) {
    const item = items[selectedIndex]
    item.classList.add('keyboard-selected')
    // Scroll into view if needed
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }
}

function navigateUp(): void {
  const items = getSelectableItems()
  if (items.length === 0) return

  if (selectedIndex <= 0) {
    selectedIndex = 0
  } else {
    selectedIndex--
  }
  updateSelection()
  callbacks.onNavigate?.(selectedIndex)
}

function navigateDown(): void {
  const items = getSelectableItems()
  if (items.length === 0) return

  if (selectedIndex < 0) {
    selectedIndex = 0
  } else if (selectedIndex < items.length - 1) {
    selectedIndex++
  }
  updateSelection()
  callbacks.onNavigate?.(selectedIndex)
}

function selectCurrent(): void {
  const items = getSelectableItems()
  if (selectedIndex >= 0 && selectedIndex < items.length) {
    callbacks.onSelect?.(selectedIndex)
  }
}

function openExternalLink(): void {
  const items = getSelectableItems()
  if (selectedIndex >= 0 && selectedIndex < items.length) {
    callbacks.onOpenExternal?.(selectedIndex)
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (!isEnabled) return

  // Don't capture keys when typing in inputs
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  ) {
    return
  }

  const key = e.key.toLowerCase()

  // Handle Cmd+Q (macOS) or Ctrl+Q (Windows/Linux) to quit
  if (key === 'q' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    callbacks.onQuit?.()
    return
  }

  switch (key) {
    case 'j':
    case 'arrowdown':
      e.preventDefault()
      navigateDown()
      break

    case 'k':
    case 'arrowup':
      e.preventDefault()
      navigateUp()
      break

    case 'enter':
      e.preventDefault()
      selectCurrent()
      break

    case 'o':
      e.preventDefault()
      openExternalLink()
      break

    case 'escape':
      e.preventDefault()
      callbacks.onBack?.()
      break

    case 'r':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        callbacks.onRefresh?.()
      }
      break

    case '?':
      e.preventDefault()
      callbacks.onHelp?.()
      break

    case 't':
      e.preventDefault()
      callbacks.onScrollToTop?.()
      break

    case '/':
      e.preventDefault()
      callbacks.onSearch?.()
      break

    case 'c':
      e.preventDefault()
      callbacks.onFocusComments?.()
      break

    case 'z':
      e.preventDefault()
      callbacks.onZenMode?.()
      break

    case 'b':
      e.preventDefault()
      callbacks.onBackToList?.()
      break

    case 'd':
      e.preventDefault()
      callbacks.onToggleTheme?.()
      break

    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const feed = FEED_KEYS[key]
        if (feed) {
          callbacks.onFeedChange?.(feed)
        }
      }
      break
  }
}

export function initKeyboard(): void {
  document.addEventListener('keydown', handleKeydown)
}

export function enableKeyboard(): void {
  isEnabled = true
}

export function disableKeyboard(): void {
  isEnabled = false
}

// Keyboard shortcut help text
export const KEYBOARD_SHORTCUTS = [
  { key: 'j / ↓', description: 'Next item' },
  { key: 'k / ↑', description: 'Previous item' },
  { key: 'Enter', description: 'Open story / expand' },
  { key: 'o', description: 'Open link in browser' },
  { key: 'c', description: 'Focus comments' },
  { key: 'b', description: 'Back to list' },
  { key: 'z', description: 'Toggle Zen mode' },
  { key: 'd', description: 'Toggle dark/light' },
  { key: 'Escape', description: 'Go back / exit Zen' },
  { key: 'r', description: 'Refresh feed' },
  { key: 't', description: 'Scroll to top' },
  { key: '/', description: 'Search' },
  { key: '1-7', description: 'Switch feeds (7=Saved)' },
  { key: '?', description: 'Show shortcuts' },
  { key: '⌘Q', description: 'Quit app' },
]

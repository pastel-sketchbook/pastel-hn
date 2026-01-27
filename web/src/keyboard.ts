/**
 * Keyboard navigation module for pastel-hn
 *
 * Provides keyboard shortcuts for:
 * - j/k: Navigate up/down in lists, scroll in detail view
 * - h/l: Scroll left/right
 * - G/gg: Jump to last/first item, or scroll to end/start in detail view
 * - Space/Shift+Space: Page down/up in detail view
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
 * - yy: Copy link (HN link in list, article URL option in detail)
 * - Cmd/Ctrl+Q: Quit app
 */

import type { StoryFeed } from './types'

// Keyboard navigation state
let selectedIndex = -1
let isEnabled = true

// Vim-style command state
let pendingKey: string | null = null
let numericPrefix = ''
let pendingTimeout: ReturnType<typeof setTimeout> | null = null
const PENDING_TIMEOUT_MS = 1000

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
  /** Called when pressing yy to copy */
  onCopy?: () => void
  /** Called when pressing j/k in detail view for vertical scrolling */
  onScrollVertical?: (direction: 'up' | 'down') => void
  /** Called when pressing Space/Shift+Space for page scrolling */
  onPageScroll?: (direction: 'up' | 'down') => void
  /** Called when pressing G/gg in detail view for scroll to end/start */
  onScrollToEnd?: () => void
  /** Called when pressing gg in detail view for scroll to start */
  onScrollToStart?: () => void
  /** Returns true if currently in detail/article view */
  isDetailView?: () => boolean
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

function navigateToFirst(): void {
  const items = getSelectableItems()
  if (items.length === 0) return
  selectedIndex = 0
  updateSelection()
  callbacks.onNavigate?.(selectedIndex)
}

function navigateToLast(): void {
  const items = getSelectableItems()
  if (items.length === 0) return
  selectedIndex = items.length - 1
  updateSelection()
  callbacks.onNavigate?.(selectedIndex)
}

function navigateToIndex(n: number): void {
  const items = getSelectableItems()
  if (items.length === 0) return
  // n is 1-indexed, clamp to valid range
  selectedIndex = Math.min(Math.max(0, n - 1), items.length - 1)
  updateSelection()
  callbacks.onNavigate?.(selectedIndex)
}

function scrollHorizontal(direction: 'left' | 'right'): void {
  const container =
    document.getElementById('stories') ||
    document.getElementById('story-detail') ||
    document.documentElement
  const scrollAmount = 100
  if (direction === 'left') {
    container.scrollLeft -= scrollAmount
  } else {
    container.scrollLeft += scrollAmount
  }
}

function clearPendingState(): void {
  pendingKey = null
  numericPrefix = ''
  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    pendingTimeout = null
  }
}

function resetPendingTimeout(): void {
  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
  }
  pendingTimeout = setTimeout(clearPendingState, PENDING_TIMEOUT_MS)
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

  const key = e.key

  // Handle Cmd+Q (macOS) or Ctrl+Q (Windows/Linux) to quit
  if (key.toLowerCase() === 'q' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    callbacks.onQuit?.()
    return
  }

  // Handle vim-style commands with pending state (gg, yy, g<n>g)
  if (pendingKey === 'g') {
    // Accumulate digits after 'g' for g<n>g command
    if (/^[0-9]$/.test(key)) {
      e.preventDefault()
      numericPrefix += key
      resetPendingTimeout()
      return
    }
    if (key === 'g') {
      e.preventDefault()
      if (numericPrefix) {
        navigateToIndex(Number.parseInt(numericPrefix, 10))
      } else if (callbacks.isDetailView?.()) {
        // In detail view, scroll to start
        callbacks.onScrollToStart?.()
      } else {
        navigateToFirst()
      }
      clearPendingState()
      return
    }
    clearPendingState()
  }

  if (pendingKey === 'y') {
    if (key === 'y') {
      e.preventDefault()
      callbacks.onCopy?.()
      clearPendingState()
      return
    }
    clearPendingState()
  }

  // Handle number keys for feed switching (1-7, includes Saved)
  if (
    /^[1-7]$/.test(key) &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    FEED_KEYS[key]
  ) {
    e.preventDefault()
    callbacks.onFeedChange?.(FEED_KEYS[key])
    return
  }

  // Handle 'g' key - start pending state for gg or ng
  if (key === 'g') {
    e.preventDefault()
    pendingKey = 'g'
    resetPendingTimeout()
    return
  }

  // Handle 'G' (shift+g) - jump to last item or scroll to end in detail view
  if (key === 'G') {
    e.preventDefault()
    if (callbacks.isDetailView?.()) {
      callbacks.onScrollToEnd?.()
    } else {
      navigateToLast()
    }
    clearPendingState()
    return
  }

  // Handle 'y' key - start pending state for yy
  if (key === 'y') {
    e.preventDefault()
    pendingKey = 'y'
    resetPendingTimeout()
    return
  }

  // Clear pending state for any other key
  clearPendingState()

  switch (key.toLowerCase()) {
    case 'j':
    case 'arrowdown':
      e.preventDefault()
      if (callbacks.isDetailView?.()) {
        callbacks.onScrollVertical?.('down')
      } else {
        navigateDown()
      }
      break

    case 'k':
    case 'arrowup':
      e.preventDefault()
      if (callbacks.isDetailView?.()) {
        callbacks.onScrollVertical?.('up')
      } else {
        navigateUp()
      }
      break

    case 'h':
    case 'arrowleft':
      e.preventDefault()
      scrollHorizontal('left')
      break

    case 'l':
    case 'arrowright':
      e.preventDefault()
      scrollHorizontal('right')
      break

    case ' ':
      e.preventDefault()
      if (e.shiftKey) {
        callbacks.onPageScroll?.('up')
      } else {
        callbacks.onPageScroll?.('down')
      }
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
  { key: 'j / ↓', description: 'Next item / scroll down' },
  { key: 'k / ↑', description: 'Previous item / scroll up' },
  { key: 'h / l', description: 'Scroll left / right' },
  { key: 'Space', description: 'Page down' },
  { key: 'Shift+Space', description: 'Page up' },
  { key: 'G', description: 'Last item / end of article' },
  { key: 'gg', description: 'First item / top of article' },
  { key: 'g<n>g', description: 'Jump to nth item (e.g., g5g)' },
  { key: 'Enter', description: 'Open story / expand' },
  { key: 'o', description: 'Open link in browser' },
  { key: 'yy', description: 'Copy link' },
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

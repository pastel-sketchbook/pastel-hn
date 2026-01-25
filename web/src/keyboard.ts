import type { StoryFeed } from './types'

// Keyboard navigation state
let selectedIndex = -1
let isEnabled = true

type KeyboardCallback = {
  onNavigate?: (index: number) => void
  onSelect?: (index: number) => void
  onBack?: () => void
  onRefresh?: () => void
  onOpenExternal?: (index: number) => void
  onFeedChange?: (feed: StoryFeed) => void
  onHelp?: () => void
  onScrollToTop?: () => void
  onSearch?: () => void
  onFocusComments?: () => void
  onZenMode?: () => void
  onToggleTheme?: () => void
}

let callbacks: KeyboardCallback = {}

const FEED_KEYS: Record<string, StoryFeed> = {
  '1': 'top',
  '2': 'new',
  '3': 'best',
  '4': 'ask',
  '5': 'show',
  '6': 'jobs',
}

export function setKeyboardCallbacks(cb: KeyboardCallback): void {
  callbacks = cb
}

export function getSelectedIndex(): number {
  return selectedIndex
}

export function setSelectedIndex(index: number): void {
  selectedIndex = index
  updateSelection()
}

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
  { key: 'z', description: 'Toggle Zen mode' },
  { key: 'd', description: 'Toggle dark/light' },
  { key: 'Escape', description: 'Go back / exit Zen' },
  { key: 'r', description: 'Refresh feed' },
  { key: 't', description: 'Scroll to top' },
  { key: '/', description: 'Search' },
  { key: '1-6', description: 'Switch feeds' },
  { key: '?', description: 'Show shortcuts' },
]

/**
 * System tray event handlers.
 * Listens for events emitted from the Rust tray menu.
 */

import type { StoryFeed } from './types'

export interface TrayEventCallbacks {
  onFeedChange: (feed: StoryFeed) => void
  onRefresh: () => void
  onSearch: () => void
}

let callbacks: TrayEventCallbacks | null = null
let unlisteners: Array<() => void> = []

/**
 * Configure tray event callbacks.
 */
export function configureTrayEvents(cb: TrayEventCallbacks): void {
  callbacks = cb
}

/**
 * Initialize tray event listeners.
 * Call this after Tauri is available.
 */
export async function initTrayEvents(): Promise<void> {
  // Only run in Tauri environment
  if (typeof window === 'undefined' || !('__TAURI__' in window)) {
    return
  }

  try {
    const { listen } = await import('@tauri-apps/api/event')

    // Listen for feed change events from tray
    const unlistenFeed = await listen<string>('tray-feed-change', (event) => {
      const feed = event.payload as StoryFeed
      if (callbacks?.onFeedChange && isValidFeed(feed)) {
        callbacks.onFeedChange(feed)
      }
    })
    unlisteners.push(unlistenFeed)

    // Listen for refresh events from tray
    const unlistenRefresh = await listen('tray-refresh', () => {
      if (callbacks?.onRefresh) {
        callbacks.onRefresh()
      }
    })
    unlisteners.push(unlistenRefresh)

    // Listen for search events from tray
    const unlistenSearch = await listen('tray-search', () => {
      if (callbacks?.onSearch) {
        callbacks.onSearch()
      }
    })
    unlisteners.push(unlistenSearch)
  } catch (error) {
    // Not in Tauri environment or event API not available
    console.debug('Tray events not available:', error)
  }
}

/**
 * Clean up tray event listeners.
 */
export function cleanupTrayEvents(): void {
  for (const unlisten of unlisteners) {
    unlisten()
  }
  unlisteners = []
}

/**
 * Check if a string is a valid feed type.
 */
function isValidFeed(feed: string): feed is StoryFeed {
  return ['top', 'new', 'best', 'ask', 'show', 'jobs', 'saved'].includes(feed)
}

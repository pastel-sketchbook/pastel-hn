/**
 * Deep link handler module.
 *
 * Handles URLs like:
 * - pastelhn://item/12345 - Open story with ID 12345
 * - pastelhn://user/dang - Open user profile for "dang"
 * - pastelhn://feed/best - Switch to "best" feed
 * - pastelhn://search?q=rust - Search for "rust"
 */

import { listen } from '@tauri-apps/api/event'
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'

/** Valid feed names */
const VALID_FEEDS = ['top', 'new', 'best', 'ask', 'show', 'jobs', 'saved']

/** Deep link route types */
export type DeepLinkRoute =
  | { type: 'item'; id: number }
  | { type: 'user'; username: string }
  | { type: 'feed'; feed: string }
  | { type: 'search'; query: string }
  | { type: 'unknown'; url: string }

/** Callbacks for handling deep link routes */
export interface DeepLinkCallbacks {
  onItem?: (id: number) => void
  onUser?: (username: string) => void
  onFeed?: (feed: string) => void
  onSearch?: (query: string) => void
}

let callbacks: DeepLinkCallbacks = {}

/**
 * Parse a deep link URL into a route object.
 */
export function parseDeepLink(urlString: string): DeepLinkRoute {
  try {
    const url = new URL(urlString)

    // Handle pastelhn:// scheme
    // URL parsing: pastelhn://item/12345 -> protocol=pastelhn:, host=item, pathname=/12345
    if (url.protocol === 'pastelhn:') {
      const routeType = url.hostname?.toLowerCase() || url.host?.toLowerCase()
      const routeValue = url.pathname.replace(/^\/+/, '')

      switch (routeType) {
        case 'item':
        case 'story': {
          const id = parseInt(routeValue, 10)
          if (!Number.isNaN(id) && id > 0) {
            return { type: 'item', id }
          }
          break
        }
        case 'user': {
          if (routeValue) {
            return { type: 'user', username: routeValue }
          }
          break
        }
        case 'feed': {
          if (routeValue && VALID_FEEDS.includes(routeValue.toLowerCase())) {
            return { type: 'feed', feed: routeValue.toLowerCase() }
          }
          break
        }
        case 'search': {
          const query = url.searchParams.get('q') || routeValue
          if (query) {
            return { type: 'search', query }
          }
          break
        }
      }
    }

    return { type: 'unknown', url: urlString }
  } catch {
    return { type: 'unknown', url: urlString }
  }
}

/**
 * Configure deep link callbacks.
 */
export function configureDeepLinks(cb: DeepLinkCallbacks): void {
  callbacks = cb
}

/**
 * Handle a deep link URL by invoking the appropriate callback.
 */
export function handleDeepLink(urlString: string): void {
  const route = parseDeepLink(urlString)

  console.log('Deep link route:', route)

  switch (route.type) {
    case 'item':
      callbacks.onItem?.(route.id)
      break
    case 'user':
      callbacks.onUser?.(route.username)
      break
    case 'feed':
      callbacks.onFeed?.(route.feed)
      break
    case 'search':
      callbacks.onSearch?.(route.query)
      break
    case 'unknown':
      console.warn('Unknown deep link:', route.url)
      break
  }
}

/**
 * Initialize deep link listeners.
 */
export async function initDeepLinks(): Promise<void> {
  // Check if running in Tauri environment
  if (typeof window === 'undefined' || !('__TAURI__' in window)) {
    console.log('Deep links: Not in Tauri environment, skipping')
    return
  }

  try {
    // Listen for deep links while app is running (from Rust event)
    await listen<string>('deep-link', (event) => {
      handleDeepLink(event.payload)
    })

    // Also use the plugin's onOpenUrl for runtime deep links
    await onOpenUrl((urls) => {
      for (const url of urls) {
        handleDeepLink(url)
      }
    })

    // Check if app was opened via deep link
    const currentUrls = await getCurrent()
    if (currentUrls && currentUrls.length > 0) {
      for (const url of currentUrls) {
        handleDeepLink(url)
      }
    }

    console.log('Deep link handler initialized')
  } catch (error) {
    console.error('Failed to initialize deep links:', error)
  }
}

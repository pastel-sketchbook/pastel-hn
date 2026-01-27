/**
 * Intelligent prefetching module for improved perceived performance
 *
 * Strategies:
 * 1. Prefetch next page of stories when user scrolls near bottom
 * 2. Prefetch story details (comments) on hover with delay
 * 3. Prefetch visible story details in idle time
 *
 * Note: Request deduplication is handled at the API layer (deduplicatedInvoke),
 * so concurrent calls for the same resource are automatically coalesced.
 */

import type { StoriesResponse } from './api'
import { fetchStoriesPaginated, fetchStoryWithComments } from './api'
import type { StoryFeed, StoryWithComments } from './types'

// Cache for prefetched story details
const storyDetailCache = new Map<number, StoryWithComments>()

// Track stories that have been prefetched
const prefetchedStories = new Set<number>()

// Hover prefetch delay (ms) - wait before prefetching to avoid wasted requests
const HOVER_PREFETCH_DELAY = 150

// Active hover timeouts
const hoverTimeouts = new Map<number, number>()

/**
 * Get cached story details if available
 */
export function getCachedStoryDetail(id: number): StoryWithComments | null {
  return storyDetailCache.get(id) ?? null
}

/**
 * Check if story details are cached
 */
export function isStoryCached(id: number): boolean {
  return storyDetailCache.has(id)
}

/**
 * Prefetch story details (comments) for a story ID
 * Silent failure - prefetching errors shouldn't affect the user
 *
 * Note: Concurrent calls for the same story ID are deduplicated at the API layer.
 */
export async function prefetchStoryDetail(id: number): Promise<void> {
  // Skip if already cached locally
  if (storyDetailCache.has(id)) {
    return
  }

  try {
    // Use depth=1 for lazy loading - only prefetch top-level comments
    const result = await fetchStoryWithComments(id, 1)
    storyDetailCache.set(id, result)
    prefetchedStories.add(id)
  } catch {
    // Silent failure - prefetching is best-effort
  }
}

/**
 * Handle mouse enter on a story card - start delayed prefetch
 */
export function onStoryHoverStart(storyId: number): void {
  // Clear any existing timeout
  const existingTimeout = hoverTimeouts.get(storyId)
  if (existingTimeout) {
    window.clearTimeout(existingTimeout)
  }

  // Skip if already cached
  if (storyDetailCache.has(storyId)) {
    return
  }

  // Start delayed prefetch
  const timeout = window.setTimeout(() => {
    prefetchStoryDetail(storyId)
    hoverTimeouts.delete(storyId)
  }, HOVER_PREFETCH_DELAY)

  hoverTimeouts.set(storyId, timeout)
}

/**
 * Handle mouse leave on a story card - cancel pending prefetch
 */
export function onStoryHoverEnd(storyId: number): void {
  const timeout = hoverTimeouts.get(storyId)
  if (timeout) {
    window.clearTimeout(timeout)
    hoverTimeouts.delete(storyId)
  }
}

// Next page prefetch cache
const nextPageCache = new Map<string, StoriesResponse>()

/**
 * Get cache key for feed pagination
 */
function getFeedCacheKey(feed: StoryFeed, offset: number): string {
  return `${feed}:${offset}`
}

/**
 * Get cached next page if available
 */
export function getCachedNextPage(
  feed: StoryFeed,
  offset: number,
): StoriesResponse | null {
  return nextPageCache.get(getFeedCacheKey(feed, offset)) ?? null
}

/**
 * Prefetch next page of stories
 *
 * Note: Concurrent calls for the same page are deduplicated at the API layer.
 */
export async function prefetchNextPage(
  feed: StoryFeed,
  currentOffset: number,
  pageSize: number,
): Promise<void> {
  const nextOffset = currentOffset + pageSize
  const cacheKey = getFeedCacheKey(feed, nextOffset)

  // Skip if already cached locally
  if (nextPageCache.has(cacheKey)) {
    return
  }

  try {
    const result = await fetchStoriesPaginated(feed, nextOffset, pageSize)
    nextPageCache.set(cacheKey, result)
  } catch {
    // Silent failure
  }
}

/**
 * Prefetch visible stories' details during idle time
 */
export function prefetchVisibleStories(storyIds: number[]): void {
  // Use requestIdleCallback if available, otherwise use setTimeout
  const scheduleIdle =
    'requestIdleCallback' in window
      ? (window as Window & { requestIdleCallback: (cb: () => void) => void })
          .requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 50)

  // Limit to first 5 visible stories to avoid excessive prefetching
  const toPrefetch = storyIds.slice(0, 5).filter((id) => !isStoryCached(id))

  if (toPrefetch.length === 0) return

  scheduleIdle(() => {
    // Prefetch one at a time with small delays to avoid overwhelming the backend
    toPrefetch.forEach((id, index) => {
      setTimeout(() => prefetchStoryDetail(id), index * 100)
    })
  })
}

/**
 * Clear all prefetch caches (e.g., when refreshing)
 */
export function clearPrefetchCache(): void {
  storyDetailCache.clear()
  nextPageCache.clear()
  prefetchedStories.clear()
}

/**
 * Clear prefetch cache for a specific feed
 */
export function clearFeedPrefetchCache(feed: StoryFeed): void {
  // Clear next page cache for this feed
  for (const key of nextPageCache.keys()) {
    if (key.startsWith(`${feed}:`)) {
      nextPageCache.delete(key)
    }
  }
}

/**
 * Get prefetch statistics for debugging
 */
export function getPrefetchStats(): {
  cachedStories: number
  cachedPages: number
} {
  return {
    cachedStories: storyDetailCache.size,
    cachedPages: nextPageCache.size,
  }
}

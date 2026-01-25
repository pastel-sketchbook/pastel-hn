/**
 * Storage module for persisting user state
 * - Feed scroll positions
 * - Story reading positions
 * - Read stories tracking
 */

import type { StoryFeed } from './types'

const STORAGE_PREFIX = 'pastel-hn'
const FEED_SCROLL_KEY = `${STORAGE_PREFIX}-feed-scroll`
const STORY_SCROLL_KEY = `${STORAGE_PREFIX}-story-scroll`
const READ_STORIES_KEY = `${STORAGE_PREFIX}-read-stories`

// Max number of read stories to track (prevents localStorage bloat)
const MAX_READ_STORIES = 500
// Max number of story scroll positions to track
const MAX_STORY_POSITIONS = 100

/**
 * Save scroll position for a feed
 */
export function saveFeedScrollPosition(
  feed: StoryFeed,
  position: number,
): void {
  try {
    const data = getFeedScrollData()
    data[feed] = position
    localStorage.setItem(FEED_SCROLL_KEY, JSON.stringify(data))
  } catch {
    // localStorage might be full or disabled
  }
}

/**
 * Get scroll position for a feed
 */
export function getFeedScrollPosition(feed: StoryFeed): number {
  const data = getFeedScrollData()
  return data[feed] ?? 0
}

/**
 * Clear scroll position for a feed (on refresh)
 */
export function clearFeedScrollPosition(feed: StoryFeed): void {
  try {
    const data = getFeedScrollData()
    delete data[feed]
    localStorage.setItem(FEED_SCROLL_KEY, JSON.stringify(data))
  } catch {
    // Ignore
  }
}

function getFeedScrollData(): Record<string, number> {
  try {
    const stored = localStorage.getItem(FEED_SCROLL_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

/**
 * Save scroll position for a story's comments
 */
export function saveStoryScrollPosition(
  storyId: number,
  position: number,
): void {
  try {
    const data = getStoryScrollData()

    // Add/update position with timestamp
    data[storyId] = { position, timestamp: Date.now() }

    // Prune old entries if we have too many
    const entries = Object.entries(data)
    if (entries.length > MAX_STORY_POSITIONS) {
      // Sort by timestamp, keep newest
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp)
      const pruned = Object.fromEntries(entries.slice(0, MAX_STORY_POSITIONS))
      localStorage.setItem(STORY_SCROLL_KEY, JSON.stringify(pruned))
    } else {
      localStorage.setItem(STORY_SCROLL_KEY, JSON.stringify(data))
    }
  } catch {
    // Ignore
  }
}

/**
 * Get scroll position for a story's comments
 */
export function getStoryScrollPosition(storyId: number): number {
  const data = getStoryScrollData()
  return data[storyId]?.position ?? 0
}

/**
 * Clear scroll position for a story
 */
export function clearStoryScrollPosition(storyId: number): void {
  try {
    const data = getStoryScrollData()
    delete data[storyId]
    localStorage.setItem(STORY_SCROLL_KEY, JSON.stringify(data))
  } catch {
    // Ignore
  }
}

function getStoryScrollData(): Record<
  number,
  { position: number; timestamp: number }
> {
  try {
    const stored = localStorage.getItem(STORY_SCROLL_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

/**
 * Mark a story as read
 */
export function markStoryAsRead(storyId: number): void {
  try {
    const readStories = getReadStories()

    // If already read, just update timestamp
    const existing = readStories.findIndex((s) => s.id === storyId)
    if (existing !== -1) {
      readStories[existing].timestamp = Date.now()
    } else {
      readStories.push({ id: storyId, timestamp: Date.now() })
    }

    // Prune old entries
    if (readStories.length > MAX_READ_STORIES) {
      readStories.sort((a, b) => b.timestamp - a.timestamp)
      readStories.length = MAX_READ_STORIES
    }

    localStorage.setItem(READ_STORIES_KEY, JSON.stringify(readStories))
  } catch {
    // Ignore
  }
}

/**
 * Check if a story has been read
 */
export function isStoryRead(storyId: number): boolean {
  const readStories = getReadStories()
  return readStories.some((s) => s.id === storyId)
}

/**
 * Get set of read story IDs for efficient lookup
 */
export function getReadStoryIds(): Set<number> {
  const readStories = getReadStories()
  return new Set(readStories.map((s) => s.id))
}

function getReadStories(): Array<{ id: number; timestamp: number }> {
  try {
    const stored = localStorage.getItem(READ_STORIES_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

/**
 * Clear all reading position data
 */
export function clearAllReadingData(): void {
  try {
    localStorage.removeItem(FEED_SCROLL_KEY)
    localStorage.removeItem(STORY_SCROLL_KEY)
    localStorage.removeItem(READ_STORIES_KEY)
  } catch {
    // Ignore
  }
}

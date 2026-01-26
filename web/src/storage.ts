/**
 * Storage module for persisting user state
 * - Feed scroll positions
 * - Story reading positions
 * - Read stories tracking
 * - Bookmarked stories
 */

import type { HNItem, StoryFeed } from './types'

const STORAGE_PREFIX = 'pastel-hn'
const FEED_SCROLL_KEY = `${STORAGE_PREFIX}-feed-scroll`
const STORY_SCROLL_KEY = `${STORAGE_PREFIX}-story-scroll`
const READ_STORIES_KEY = `${STORAGE_PREFIX}-read-stories`
const COMMENT_COUNTS_KEY = `${STORAGE_PREFIX}-comment-counts`
const STORY_SCORES_KEY = `${STORAGE_PREFIX}-story-scores`
const BOOKMARKS_KEY = `${STORAGE_PREFIX}-bookmarks`

// Max number of read stories to track (prevents localStorage bloat)
const MAX_READ_STORIES = 500
// Max number of story scroll positions to track
const MAX_STORY_POSITIONS = 100
// Max number of comment counts to track
const MAX_COMMENT_COUNTS = 500
// Max number of story scores to track
const MAX_STORY_SCORES = 500
// Threshold for "trending" - points gained per hour
const TRENDING_POINTS_PER_HOUR = 30
// Minimum points gained to show any trending indicator
const MIN_TRENDING_POINTS = 10

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

/**
 * Clear only reading history (read stories), keeping scroll positions
 */
export function clearReadingHistory(): void {
  try {
    localStorage.removeItem(READ_STORIES_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Get the count of read stories
 */
export function getReadStoriesCount(): number {
  return getReadStories().length
}

// ============================================================================
// Comment Count Tracking (for "new comments" indicator)
// ============================================================================

interface CommentCountEntry {
  count: number
  timestamp: number
}

/**
 * Save the comment count for a story when the user views it
 */
export function saveStoryCommentCount(
  storyId: number,
  commentCount: number,
): void {
  try {
    const data = getCommentCountsData()

    data[storyId] = { count: commentCount, timestamp: Date.now() }

    // Prune old entries if we have too many
    const entries = Object.entries(data)
    if (entries.length > MAX_COMMENT_COUNTS) {
      // Sort by timestamp, keep newest
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp)
      const pruned = Object.fromEntries(entries.slice(0, MAX_COMMENT_COUNTS))
      localStorage.setItem(COMMENT_COUNTS_KEY, JSON.stringify(pruned))
    } else {
      localStorage.setItem(COMMENT_COUNTS_KEY, JSON.stringify(data))
    }
  } catch {
    // Ignore
  }
}

/**
 * Get the last seen comment count for a story
 * Returns null if the story has never been viewed
 */
export function getStoryCommentCount(storyId: number): number | null {
  const data = getCommentCountsData()
  return data[storyId]?.count ?? null
}

/**
 * Calculate new comments since last visit
 * Returns 0 if story hasn't been viewed before or no new comments
 */
export function getNewCommentsCount(
  storyId: number,
  currentCount: number,
): number {
  const lastSeenCount = getStoryCommentCount(storyId)
  if (lastSeenCount === null) {
    return 0 // Story hasn't been viewed before
  }
  return Math.max(0, currentCount - lastSeenCount)
}

/**
 * Get all tracked comment counts as a map for efficient lookup
 */
export function getCommentCountsMap(): Map<number, number> {
  const data = getCommentCountsData()
  const map = new Map<number, number>()
  for (const [id, entry] of Object.entries(data)) {
    map.set(Number(id), entry.count)
  }
  return map
}

function getCommentCountsData(): Record<number, CommentCountEntry> {
  try {
    const stored = localStorage.getItem(COMMENT_COUNTS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

/**
 * Clear all comment count data
 */
export function clearCommentCounts(): void {
  try {
    localStorage.removeItem(COMMENT_COUNTS_KEY)
  } catch {
    // Ignore
  }
}

// ============================================================================
// Story Score Tracking (for "trending" indicator)
// ============================================================================

interface StoryScoreEntry {
  score: number
  timestamp: number
}

export type TrendingLevel = 'none' | 'rising' | 'hot'

/**
 * Save the score for a story when first seen in the feed
 * Only saves if we don't already have a recent entry for this story
 */
export function saveStoryScore(storyId: number, score: number): void {
  try {
    const data = getStoryScoresData()

    // Only save if we don't have an entry or entry is old (>1 hour)
    const existing = data[storyId]
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    if (!existing || existing.timestamp < oneHourAgo) {
      data[storyId] = { score, timestamp: Date.now() }

      // Prune old entries if we have too many
      const entries = Object.entries(data)
      if (entries.length > MAX_STORY_SCORES) {
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp)
        const pruned = Object.fromEntries(entries.slice(0, MAX_STORY_SCORES))
        localStorage.setItem(STORY_SCORES_KEY, JSON.stringify(pruned))
      } else {
        localStorage.setItem(STORY_SCORES_KEY, JSON.stringify(data))
      }
    }
  } catch {
    // Ignore
  }
}

/**
 * Get the last recorded score for a story
 * Returns null if the story has never been tracked
 */
export function getStoryScore(storyId: number): StoryScoreEntry | null {
  const data = getStoryScoresData()
  return data[storyId] ?? null
}

/**
 * Determine if a story is trending based on score change over time
 * Returns 'hot' for rapidly rising stories, 'rising' for moderately trending
 */
export function getStoryTrendingLevel(
  storyId: number,
  currentScore: number,
): TrendingLevel {
  const entry = getStoryScore(storyId)
  if (!entry) {
    return 'none'
  }

  const pointsGained = currentScore - entry.score
  if (pointsGained < MIN_TRENDING_POINTS) {
    return 'none'
  }

  // Calculate hours elapsed (minimum 0.1 to avoid division issues)
  const hoursElapsed = Math.max(
    0.1,
    (Date.now() - entry.timestamp) / (60 * 60 * 1000),
  )
  const pointsPerHour = pointsGained / hoursElapsed

  if (pointsPerHour >= TRENDING_POINTS_PER_HOUR * 2) {
    return 'hot' // Very rapid growth (60+ points/hour)
  } else if (pointsPerHour >= TRENDING_POINTS_PER_HOUR) {
    return 'rising' // Moderate growth (30+ points/hour)
  }

  return 'none'
}

/**
 * Get points gained since last seen for a story
 * Returns 0 if story hasn't been tracked or no gain
 */
export function getScoreGain(storyId: number, currentScore: number): number {
  const entry = getStoryScore(storyId)
  if (!entry) {
    return 0
  }
  return Math.max(0, currentScore - entry.score)
}

/**
 * Get all tracked story scores as a map for efficient lookup
 */
export function getStoryScoresMap(): Map<number, StoryScoreEntry> {
  const data = getStoryScoresData()
  const map = new Map<number, StoryScoreEntry>()
  for (const [id, entry] of Object.entries(data)) {
    map.set(Number(id), entry)
  }
  return map
}

function getStoryScoresData(): Record<number, StoryScoreEntry> {
  try {
    const stored = localStorage.getItem(STORY_SCORES_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

/**
 * Clear all story score data
 */
export function clearStoryScores(): void {
  try {
    localStorage.removeItem(STORY_SCORES_KEY)
  } catch {
    // Ignore
  }
}

// ============================================================================
// Bookmarks (for saving favorite stories)
// ============================================================================

interface BookmarkEntry {
  story: HNItem
  bookmarkedAt: number
}

// Max bookmarks to store (prevent localStorage bloat)
const MAX_BOOKMARKS = 200

/**
 * Bookmark a story (saves full story data for offline viewing)
 */
export function bookmarkStory(story: HNItem): void {
  try {
    const bookmarks = getBookmarksData()

    // Check if already bookmarked
    if (bookmarks.some((b) => b.story.id === story.id)) {
      return
    }

    // Add new bookmark at the beginning
    bookmarks.unshift({ story, bookmarkedAt: Date.now() })

    // Prune if over limit (remove oldest)
    if (bookmarks.length > MAX_BOOKMARKS) {
      bookmarks.length = MAX_BOOKMARKS
    }

    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks))
  } catch {
    // Ignore
  }
}

/**
 * Remove a bookmark
 */
export function removeBookmark(storyId: number): void {
  try {
    const bookmarks = getBookmarksData()
    const filtered = bookmarks.filter((b) => b.story.id !== storyId)
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(filtered))
  } catch {
    // Ignore
  }
}

/**
 * Check if a story is bookmarked
 */
export function isStoryBookmarked(storyId: number): boolean {
  const bookmarks = getBookmarksData()
  return bookmarks.some((b) => b.story.id === storyId)
}

/**
 * Get all bookmarked stories (newest first)
 */
export function getBookmarkedStories(): HNItem[] {
  const bookmarks = getBookmarksData()
  return bookmarks.map((b) => b.story)
}

/**
 * Get bookmarks with metadata (for displaying "bookmarked X ago")
 */
export function getBookmarksWithTimestamps(): Array<{
  story: HNItem
  bookmarkedAt: number
}> {
  return getBookmarksData()
}

/**
 * Get count of bookmarked stories
 */
export function getBookmarksCount(): number {
  return getBookmarksData().length
}

/**
 * Get set of bookmarked story IDs for efficient lookup
 */
export function getBookmarkedStoryIds(): Set<number> {
  const bookmarks = getBookmarksData()
  return new Set(bookmarks.map((b) => b.story.id))
}

/**
 * Get a bookmarked story by ID (for offline fallback)
 * Returns null if not bookmarked
 */
export function getBookmarkedStoryById(storyId: number): HNItem | null {
  const bookmarks = getBookmarksData()
  const entry = bookmarks.find((b) => b.story.id === storyId)
  return entry?.story ?? null
}

function getBookmarksData(): BookmarkEntry[] {
  try {
    const stored = localStorage.getItem(BOOKMARKS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return []
}

/**
 * Clear all bookmarks
 */
export function clearBookmarks(): void {
  try {
    localStorage.removeItem(BOOKMARKS_KEY)
  } catch {
    // Ignore
  }
}

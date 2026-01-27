/**
 * HN API client - Thin wrapper around Tauri commands
 *
 * All API calls are handled by the Rust backend for better performance,
 * caching, and error handling. See docs/rationale/0002_rust_api_layer.md
 *
 * Request deduplication: Concurrent calls for the same resource share a single
 * in-flight request, preventing redundant network traffic.
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  CacheStats,
  CommentWithChildren,
  HNItem,
  HNUser,
  StoryFeed,
  StoryWithComments,
} from './types'

// ===== Request Deduplication =====

/** In-flight request cache for deduplication */
const inFlightRequests = new Map<string, Promise<unknown>>()

/** Safety timeout to prevent stuck entries (30 seconds) */
const IN_FLIGHT_TIMEOUT_MS = 30_000

/**
 * Invoke a Tauri command with request deduplication.
 * Concurrent calls with the same cache key share a single in-flight request.
 *
 * @param cacheKey - Unique key identifying this request
 * @param cmd - Tauri command name
 * @param args - Command arguments
 * @returns Promise resolving to the command result
 */
function deduplicatedInvoke<T>(
  cacheKey: string,
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const existing = inFlightRequests.get(cacheKey)
  if (existing) {
    return existing as Promise<T>
  }

  const promise = invoke<T>(cmd, args).finally(() => {
    inFlightRequests.delete(cacheKey)
  })

  // Safety timeout to prevent memory leaks from hung requests
  setTimeout(() => inFlightRequests.delete(cacheKey), IN_FLIGHT_TIMEOUT_MS)

  inFlightRequests.set(cacheKey, promise)
  return promise
}

/**
 * Get the number of in-flight requests (for testing/debugging)
 */
export function getInFlightRequestCount(): number {
  return inFlightRequests.size
}

/**
 * Clear all in-flight requests (for testing)
 */
export function clearInFlightRequests(): void {
  inFlightRequests.clear()
}

// ===== HN Firebase API =====

export interface StoriesResponse {
  stories: HNItem[]
  hasMore: boolean
  total: number
}

export interface SubmissionsResponse {
  items: HNItem[]
  hasMore: boolean
  total: number
}

export type SubmissionFilter = 'all' | 'stories' | 'comments'

/**
 * Fetch paginated stories for a feed
 */
export async function fetchStoriesPaginated(
  feed: StoryFeed,
  offset: number,
  limit: number,
): Promise<StoriesResponse> {
  return deduplicatedInvoke<StoriesResponse>(
    `stories:${feed}:${offset}:${limit}`,
    'fetch_stories',
    { feed, offset, limit },
  )
}

/**
 * Fetch stories (convenience wrapper for backward compatibility)
 */
export async function fetchStories(
  feed: StoryFeed,
  limit = 30,
): Promise<HNItem[]> {
  const response = await fetchStoriesPaginated(feed, 0, limit)
  return response.stories
}

/**
 * Fetch a single item by ID
 */
export async function fetchItem(id: number): Promise<HNItem> {
  return deduplicatedInvoke<HNItem>(`item:${id}`, 'fetch_item', { id })
}

/**
 * Fetch multiple items by IDs
 * Note: IDs are sorted to normalize cache keys - [1,2,3] and [3,2,1] share same request
 */
export async function fetchItems(ids: number[]): Promise<HNItem[]> {
  const sortedIds = [...ids].sort((a, b) => a - b)
  const cacheKey = `items:${sortedIds.join(',')}`
  return deduplicatedInvoke<HNItem[]>(cacheKey, 'fetch_items', { ids })
}

/**
 * Fetch a story with its comments
 */
export async function fetchStoryWithComments(
  id: number,
  depth = 2,
): Promise<StoryWithComments> {
  return deduplicatedInvoke<StoryWithComments>(
    `story:${id}:${depth}`,
    'fetch_story_with_comments',
    { id, depth },
  )
}

/**
 * Fetch children of a specific comment (for "load more")
 */
export async function fetchCommentChildren(
  id: number,
  depth = 2,
): Promise<CommentWithChildren[]> {
  return deduplicatedInvoke<CommentWithChildren[]>(
    `comments:${id}:${depth}`,
    'fetch_comment_children',
    { id, depth },
  )
}

/**
 * Fetch a user by ID
 */
export async function fetchUser(id: string): Promise<HNUser> {
  return deduplicatedInvoke<HNUser>(`user:${id}`, 'fetch_user', { id })
}

/**
 * Fetch user submissions with pagination and filtering
 */
export async function fetchUserSubmissions(
  userId: string,
  offset: number,
  limit: number,
  filter: SubmissionFilter = 'all',
): Promise<SubmissionsResponse> {
  return deduplicatedInvoke<SubmissionsResponse>(
    `submissions:${userId}:${offset}:${limit}:${filter}`,
    'fetch_user_submissions',
    { userId, offset, limit, filter },
  )
}

// ===== Search API (Algolia) =====

export interface SearchResult {
  id: number
  title: string | null
  url: string | null
  author: string | null
  points: number
  numComments: number
  createdAt: number
  type: 'story' | 'comment'
  storyId?: number
  storyTitle?: string
  text?: string
}

export interface SearchResponse {
  hits: SearchResult[]
  nbHits: number
  page: number
  nbPages: number
  hitsPerPage: number
  query: string
}

export type SearchSort = 'relevance' | 'date'
export type SearchFilter = 'all' | 'story' | 'comment'

/**
 * Search HN using Algolia
 */
export async function searchHN(
  query: string,
  options: {
    page?: number
    hitsPerPage?: number
    sort?: SearchSort
    filter?: SearchFilter
  } = {},
): Promise<SearchResponse> {
  const {
    page = 0,
    hitsPerPage = 20,
    sort = 'relevance',
    filter = 'all',
  } = options

  const cacheKey = `search:${query}:${page}:${hitsPerPage}:${sort}:${filter}`
  return deduplicatedInvoke<SearchResponse>(cacheKey, 'search_hn', {
    query,
    page,
    hitsPerPage,
    sort,
    filter,
  })
}

// ===== Article Content Extraction =====

import type { ArticleContent } from './types'

/**
 * Fetch and extract article content from an external URL
 */
export async function fetchArticleContent(
  url: string,
): Promise<ArticleContent> {
  return deduplicatedInvoke<ArticleContent>(
    `article:${url}`,
    'fetch_article_content',
    { url },
  )
}

// ===== Cache Management =====

/**
 * Clear all caches
 */
export async function clearCache(): Promise<void> {
  return invoke('clear_cache')
}

/**
 * Clear story IDs cache for a specific feed or all feeds
 */
export async function clearStoryIdsCache(feed?: StoryFeed): Promise<void> {
  return invoke('clear_story_ids_cache', { feed: feed ?? null })
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  return invoke('get_cache_stats')
}

// ===== Utility Functions (kept in TypeScript as they're UI-related) =====

/**
 * Format a Unix timestamp as relative time (e.g., "5m ago", "2h ago")
 */
export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)

  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/**
 * Extract domain from a URL for display
 */
export function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ===== Legacy Compatibility =====

/**
 * Initialize the API (no-op, kept for backward compatibility)
 */
export async function init(): Promise<void> {
  // No initialization needed - Rust client is initialized by Tauri
}

/**
 * Fetch story IDs for a feed (used internally, prefer fetchStoriesPaginated)
 */
export async function fetchStoryIds(
  feed: StoryFeed,
  limit?: number,
): Promise<number[]> {
  // Fetch via paginated endpoint and extract IDs
  const response = await fetchStoriesPaginated(feed, 0, limit ?? 500)
  return response.stories.map((s) => s.id)
}

/**
 * Fetch comments for an item (deprecated, use fetchStoryWithComments)
 */
export async function fetchComments(
  item: HNItem,
  depth = 2,
): Promise<CommentWithChildren[]> {
  if (!item.kids || item.kids.length === 0) {
    return []
  }
  // Use the story with comments endpoint for the parent item
  const result = await fetchStoryWithComments(item.id, depth)
  return result.comments
}

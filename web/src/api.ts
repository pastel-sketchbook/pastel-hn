/**
 * HN API client - Thin wrapper around Tauri commands
 *
 * All API calls are handled by the Rust backend for better performance,
 * caching, and error handling. See docs/rationale/0002_rust_api_layer.md
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  CommentWithChildren,
  HNItem,
  HNUser,
  StoryFeed,
  StoryWithComments,
} from './types'

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
  return invoke('fetch_stories', { feed, offset, limit })
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
  return invoke('fetch_item', { id })
}

/**
 * Fetch multiple items by IDs
 */
export async function fetchItems(ids: number[]): Promise<HNItem[]> {
  return invoke('fetch_items', { ids })
}

/**
 * Fetch a story with its comments
 */
export async function fetchStoryWithComments(
  id: number,
  depth = 2,
): Promise<StoryWithComments> {
  return invoke('fetch_story_with_comments', { id, depth })
}

/**
 * Fetch children of a specific comment (for "load more")
 */
export async function fetchCommentChildren(
  id: number,
  depth = 2,
): Promise<CommentWithChildren[]> {
  return invoke('fetch_comment_children', { id, depth })
}

/**
 * Fetch a user by ID
 */
export async function fetchUser(id: string): Promise<HNUser> {
  return invoke('fetch_user', { id })
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
  return invoke('fetch_user_submissions', { userId, offset, limit, filter })
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

  return invoke('search_hn', {
    query,
    page,
    hitsPerPage,
    sort,
    filter,
  })
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

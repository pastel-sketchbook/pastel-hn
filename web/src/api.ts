import type {
  CommentWithChildren,
  HNItem,
  HNUser,
  ItemType,
  StoryFeed,
  StoryWithComments,
} from './types'

const BASE_URL = 'https://hacker-news.firebaseio.com/v0'

const itemCache = new Map<number, { item: HNItem; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.json()
}

function getCachedItem(id: number): HNItem | null {
  const cached = itemCache.get(id)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    itemCache.delete(id)
    return null
  }
  return cached.item
}

function cacheItem(item: HNItem): void {
  itemCache.set(item.id, { item, timestamp: Date.now() })
}

function parseItemType(type: string | undefined): ItemType {
  const types: Record<string, ItemType> = {
    story: 0,
    comment: 1,
    job: 2,
    poll: 3,
    pollopt: 4,
  }
  return types[type ?? ''] ?? 5
}

interface RawHNItem {
  id: number
  type?: string
  by?: string
  time?: number
  text?: string
  url?: string
  score?: number
  title?: string
  descendants?: number
  kids?: number[]
  parent?: number
  dead?: boolean
  deleted?: boolean
}

function rawToItem(raw: RawHNItem): HNItem {
  return {
    id: raw.id,
    type: parseItemType(raw.type),
    by: raw.by ?? null,
    time: raw.time ?? 0,
    text: raw.text ?? null,
    url: raw.url ?? null,
    score: raw.score ?? 0,
    title: raw.title ?? null,
    descendants: raw.descendants ?? 0,
    kids: raw.kids ?? null,
    parent: raw.parent ?? null,
    dead: raw.dead ?? false,
    deleted: raw.deleted ?? false,
  }
}

export async function init(): Promise<void> {
  // No WASM init needed for now - using native JSON
}

export async function fetchStoryIds(
  feed: StoryFeed,
  limit?: number,
): Promise<number[]> {
  const endpoint = {
    top: 'topstories',
    new: 'newstories',
    best: 'beststories',
    ask: 'askstories',
    show: 'showstories',
    jobs: 'jobstories',
  }[feed]

  const ids = await fetchJson<number[]>(`${BASE_URL}/${endpoint}.json`)
  return limit ? ids.slice(0, limit) : ids
}

export async function fetchItem(id: number): Promise<HNItem> {
  const cached = getCachedItem(id)
  if (cached) return cached

  const raw = await fetchJson<RawHNItem>(`${BASE_URL}/item/${id}.json`)
  const item = rawToItem(raw)

  cacheItem(item)
  return item
}

interface RawHNUser {
  id: string
  created: number
  karma: number
  about?: string
  submitted?: number[]
}

export async function fetchUser(id: string): Promise<HNUser> {
  const raw = await fetchJson<RawHNUser>(`${BASE_URL}/user/${id}.json`)
  return {
    id: raw.id,
    created: raw.created,
    karma: raw.karma,
    about: raw.about ?? null,
    submitted: raw.submitted ?? null,
  }
}

// Fetch user submissions with pagination and type filtering
export async function fetchUserSubmissions(
  userId: string,
  offset: number,
  limit: number,
  filter?: 'all' | 'stories' | 'comments',
): Promise<{ items: HNItem[]; hasMore: boolean; total: number }> {
  const user = await fetchUser(userId)
  const allIds = user.submitted ?? []

  // Get the slice of IDs we need
  const slicedIds = allIds.slice(offset, offset + limit * 2) // Fetch extra for filtering
  const items = await fetchItems(slicedIds)

  // Filter by type if specified
  let filteredItems = items
  if (filter === 'stories') {
    filteredItems = items.filter(
      (item) => item.type === 0 || item.type === 2, // Story or Job
    )
  } else if (filter === 'comments') {
    filteredItems = items.filter((item) => item.type === 1) // Comment
  }

  // Take only the limit we need
  const resultItems = filteredItems.slice(0, limit)

  return {
    items: resultItems,
    hasMore: offset + limit < allIds.length,
    total: allIds.length,
  }
}

export async function fetchItems(ids: number[]): Promise<HNItem[]> {
  const items = await Promise.all(ids.map((id) => fetchItem(id)))
  return items
}

export async function fetchStories(
  feed: StoryFeed,
  limit = 30,
): Promise<HNItem[]> {
  const ids = await fetchStoryIds(feed, limit)
  return fetchItems(ids)
}

// Cache for story IDs per feed to enable pagination
const storyIdsCache = new Map<StoryFeed, { ids: number[]; timestamp: number }>()
const STORY_IDS_CACHE_TTL = 2 * 60 * 1000 // 2 minutes

export async function fetchStoriesPaginated(
  feed: StoryFeed,
  offset: number,
  limit: number,
): Promise<{ stories: HNItem[]; hasMore: boolean; total: number }> {
  // Get cached IDs or fetch new ones
  let ids: number[]
  const cached = storyIdsCache.get(feed)

  if (cached && Date.now() - cached.timestamp < STORY_IDS_CACHE_TTL) {
    ids = cached.ids
  } else {
    ids = await fetchStoryIds(feed)
    storyIdsCache.set(feed, { ids, timestamp: Date.now() })
  }

  const pageIds = ids.slice(offset, offset + limit)
  const stories = await fetchItems(pageIds)

  return {
    stories,
    hasMore: offset + limit < ids.length,
    total: ids.length,
  }
}

export function clearStoryIdsCache(feed?: StoryFeed): void {
  if (feed) {
    storyIdsCache.delete(feed)
  } else {
    storyIdsCache.clear()
  }
}

export async function fetchComments(
  item: HNItem,
  depth = 2,
): Promise<CommentWithChildren[]> {
  if (!item.kids || item.kids.length === 0 || depth <= 0) {
    return []
  }

  const comments = await fetchItems(item.kids)

  if (depth > 1) {
    await Promise.all(
      comments.map(async (comment) => {
        const nested = await fetchComments(comment, depth - 1)
        ;(comment as CommentWithChildren).children = nested
      }),
    )
  }

  return comments as CommentWithChildren[]
}

// Fetch children for a specific comment (used for "load more" in deep threads)
export async function fetchCommentChildren(
  commentId: number,
  depth = 2,
): Promise<CommentWithChildren[]> {
  const comment = await fetchItem(commentId)
  return fetchComments(comment, depth)
}

export async function fetchStoryWithComments(
  id: number,
  depth = 2,
): Promise<StoryWithComments> {
  const story = await fetchItem(id)
  const comments = await fetchComments(story, depth)
  return { story, comments }
}

export function clearCache(): void {
  itemCache.clear()
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)

  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ===== SEARCH API (Algolia HN Search) =====
const ALGOLIA_BASE_URL = 'https://hn.algolia.com/api/v1'

export interface SearchResult {
  id: number
  title: string | null
  url: string | null
  author: string | null
  points: number
  numComments: number
  createdAt: number
  type: 'story' | 'comment'
  storyId?: number // For comments, the parent story ID
  storyTitle?: string // For comments, the parent story title
  text?: string // Comment text
}

export interface SearchResponse {
  hits: SearchResult[]
  nbHits: number
  page: number
  nbPages: number
  hitsPerPage: number
  query: string
}

interface AlgoliaHit {
  objectID: string
  title?: string
  url?: string
  author?: string
  points?: number
  num_comments?: number
  created_at_i?: number
  story_id?: number
  story_title?: string
  comment_text?: string
  _tags?: string[]
}

interface AlgoliaResponse {
  hits: AlgoliaHit[]
  nbHits: number
  page: number
  nbPages: number
  hitsPerPage: number
  query: string
}

function algoliaHitToResult(hit: AlgoliaHit): SearchResult {
  const isComment = hit._tags?.includes('comment') ?? false

  return {
    id: Number.parseInt(hit.objectID, 10),
    title: hit.title ?? null,
    url: hit.url ?? null,
    author: hit.author ?? null,
    points: hit.points ?? 0,
    numComments: hit.num_comments ?? 0,
    createdAt: hit.created_at_i ?? 0,
    type: isComment ? 'comment' : 'story',
    storyId: hit.story_id,
    storyTitle: hit.story_title,
    text: hit.comment_text,
  }
}

export type SearchSort = 'relevance' | 'date'
export type SearchFilter = 'all' | 'story' | 'comment'

/**
 * Search HN using Algolia Search API
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

  // Build query params
  const params = new URLSearchParams({
    query,
    page: String(page),
    hitsPerPage: String(hitsPerPage),
  })

  // Add filter tags
  if (filter !== 'all') {
    params.set('tags', filter)
  }

  // Use different endpoint based on sort
  const endpoint = sort === 'date' ? 'search_by_date' : 'search'
  const url = `${ALGOLIA_BASE_URL}/${endpoint}?${params.toString()}`

  const response = await fetchJson<AlgoliaResponse>(url)

  return {
    hits: response.hits.map(algoliaHitToResult),
    nbHits: response.nbHits,
    page: response.page,
    nbPages: response.nbPages,
    hitsPerPage: response.hitsPerPage,
    query: response.query,
  }
}

import type { HNItem, ItemType, StoryFeed } from './types'

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

export async function fetchComments(
  item: HNItem,
  depth = 2,
): Promise<HNItem[]> {
  if (!item.kids || item.kids.length === 0 || depth <= 0) {
    return []
  }

  const comments = await fetchItems(item.kids)

  if (depth > 1) {
    await Promise.all(
      comments.map(async (comment) => {
        const nested = await fetchComments(comment, depth - 1)
        ;(comment as HNItem & { children?: HNItem[] }).children = nested
      }),
    )
  }

  return comments
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

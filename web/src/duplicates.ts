/**
 * Duplicate story detection utilities
 *
 * Detects when the same URL has been submitted multiple times to HN.
 * URLs are normalized to account for variations like:
 * - www vs non-www
 * - Trailing slashes
 * - UTM tracking parameters
 * - Hash fragments
 */

import type { HNItem } from './types'

/**
 * Information about a duplicate story
 */
export interface DuplicateInfo {
  /** IDs of other stories with the same URL */
  otherIds: number[]
  /** Total number of submissions of this URL */
  totalSubmissions: number
}

/** Tracking parameters to remove during URL normalization */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'source',
  'fbclid',
  'gclid',
])

/**
 * Normalize a URL for comparison
 * - Removes www prefix
 * - Removes trailing slashes
 * - Removes hash fragments
 * - Removes common tracking parameters
 * - Lowercases the hostname
 */
export function normalizeUrl(url: string | null): string | null {
  if (!url || url.trim() === '') return null

  try {
    const parsed = new URL(url)

    // Lowercase the hostname only (not the path, which may be case-sensitive)
    parsed.hostname = parsed.hostname.toLowerCase()

    // Remove www prefix
    if (parsed.hostname.startsWith('www.')) {
      parsed.hostname = parsed.hostname.slice(4)
    }

    // Remove hash fragment
    parsed.hash = ''

    // Remove tracking parameters
    const params = new URLSearchParams(parsed.search)
    for (const param of TRACKING_PARAMS) {
      params.delete(param)
    }
    parsed.search = params.toString()

    // Build the normalized URL
    let pathname = parsed.pathname

    // Remove trailing slash from pathname
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1)
    }

    // Handle root path - don't add the trailing slash
    if (pathname === '/') {
      pathname = ''
    }

    let normalized = parsed.origin + pathname

    // Add remaining query string if present
    if (parsed.search) {
      normalized += parsed.search
    }

    return normalized
  } catch {
    // Invalid URL, return null
    return null
  }
}

/**
 * Build an index of normalized URLs to story IDs
 * @param stories - List of stories to index
 * @returns Map of normalized URL to array of story IDs
 */
export function buildUrlIndex(stories: HNItem[]): Map<string, number[]> {
  const index = new Map<string, number[]>()

  for (const story of stories) {
    const normalized = normalizeUrl(story.url)
    if (!normalized) continue

    const existing = index.get(normalized)
    if (existing) {
      existing.push(story.id)
    } else {
      index.set(normalized, [story.id])
    }
  }

  return index
}

/**
 * Find all duplicate stories in a list
 * @param stories - List of stories to check
 * @returns Map of story ID to DuplicateInfo (only includes stories that have duplicates)
 */
export function findDuplicates(stories: HNItem[]): Map<number, DuplicateInfo> {
  const urlIndex = buildUrlIndex(stories)
  const duplicates = new Map<number, DuplicateInfo>()

  for (const [, ids] of urlIndex) {
    // Only process URLs with multiple submissions
    if (ids.length <= 1) continue

    // Add duplicate info for each story
    for (const id of ids) {
      duplicates.set(id, {
        otherIds: ids.filter((otherId) => otherId !== id),
        totalSubmissions: ids.length,
      })
    }
  }

  return duplicates
}

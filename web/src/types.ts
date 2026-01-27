/**
 * Type definitions for Hacker News data structures
 * These types mirror the Rust types defined in src-tauri/src/types.rs
 */

/**
 * HN item types as numeric enum for wire efficiency
 * Matches the Rust ItemType enum
 */
export enum ItemType {
  Story = 0,
  Comment = 1,
  Job = 2,
  Poll = 3,
  PollOpt = 4,
  Unknown = 5,
}

/**
 * Represents a Hacker News item (story, comment, job, poll, etc.)
 * All fields are nullable except id, type, time, score, descendants, dead, deleted
 */
export interface HNItem {
  /** Unique item identifier */
  id: number
  /** Type of item (Story, Comment, Job, etc.) */
  type: ItemType
  /** Username of the item author */
  by: string | null
  /** Unix timestamp of creation */
  time: number
  /** HTML content (for comments, Ask HN text, etc.) */
  text: string | null
  /** External URL (for stories with links) */
  url: string | null
  /** Points/score for the item */
  score: number
  /** Title (for stories and jobs) */
  title: string | null
  /** Total comment count (recursive) */
  descendants: number
  /** IDs of direct child comments */
  kids: number[] | null
  /** ID of parent item (for comments) */
  parent: number | null
  /** Whether the item is marked as dead */
  dead: boolean
  /** Whether the item is deleted */
  deleted: boolean
}

/**
 * A comment with its child comments recursively loaded
 * Used for comment tree rendering
 */
export interface CommentWithChildren extends HNItem {
  /** Nested child comments (recursively loaded to specified depth) */
  children?: CommentWithChildren[]
}

/**
 * A story with its comment tree
 * Returned by fetch_story_with_comments
 */
export interface StoryWithComments {
  /** The story item */
  story: HNItem
  /** Top-level comments with nested children */
  comments: CommentWithChildren[]
}

/**
 * Hacker News user profile
 */
export interface HNUser {
  /** Username (case-sensitive) */
  id: string
  /** Unix timestamp of account creation */
  created: number
  /** User's karma score */
  karma: number
  /** User's self-description (HTML) */
  about: string | null
  /** IDs of items submitted by this user */
  submitted: number[] | null
}

/**
 * Available story feeds
 * 'saved' is a client-side only feed for bookmarked stories
 */
export type StoryFeed =
  | 'top'
  | 'new'
  | 'best'
  | 'ask'
  | 'show'
  | 'jobs'
  | 'saved'

/**
 * Extracted article content from an external URL
 * Returned by the article reader feature
 */
export interface ArticleContent {
  /** Article title extracted from page */
  title: string | null
  /** Cleaned HTML content */
  content: string
  /** Plain text content for reading time calculation */
  textContent: string
  /** Author byline if detected */
  byline: string | null
  /** Article excerpt/summary */
  excerpt: string | null
  /** Website name */
  siteName: string | null
  /** Content language code */
  lang: string | null
  /** Word count for reading time */
  wordCount: number
}

/**
 * Cache statistics from the Rust backend
 * Used for cache management in settings
 */
export interface CacheStats {
  /** Number of items in the item cache */
  itemCount: number
  /** Number of story ID lists cached */
  storyIdsCount: number
  /** Number of users in the user cache */
  userCount: number
  /** TTL for items in seconds */
  itemTtlSecs: number
  /** TTL for story IDs in seconds */
  storyIdsTtlSecs: number
  /** TTL for users in seconds */
  userTtlSecs: number
}

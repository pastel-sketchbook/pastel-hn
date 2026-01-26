/**
 * HTML rendering functions for stories, comments, and submissions
 * These are pure functions that generate HTML strings
 */

import { extractDomain, formatTimeAgo } from './api'
import { icons } from './icons'
import type { TrendingLevel } from './storage'
import type { CommentWithChildren, HNItem } from './types'
import {
  calculateReadingTime,
  countWords,
  escapeHtml,
  getScoreHeat,
  getStoryType,
  sanitizeHtml,
} from './utils'

/**
 * Render a single story item
 * @param story - The story data
 * @param rank - Display rank number
 * @param isRead - Whether the story has been read
 * @param newComments - Number of new comments since last visit (0 = none or never visited)
 * @param trendingLevel - Trending indicator level ('none', 'rising', or 'hot')
 */
export function renderStory(
  story: HNItem,
  rank: number,
  isRead: boolean,
  newComments = 0,
  trendingLevel: TrendingLevel = 'none',
): string {
  const domain = extractDomain(story.url)
  const timeAgo = formatTimeAgo(story.time)
  const storyType = story.type === 2 ? 'job' : getStoryType(story.title) // ItemType.Job = 2
  const scoreHeat = getScoreHeat(story.score)

  // Calculate reading time for text posts (Ask HN, etc.)
  const textWordCount = story.text ? countWords(story.text) : 0
  const readingTime =
    textWordCount > 0 ? calculateReadingTime(textWordCount) : ''

  const typeAttr = storyType ? ` data-type="${storyType}"` : ''
  const heatAttr = scoreHeat ? ` data-heat="${scoreHeat}"` : ''
  const readClass = isRead ? ' story-read' : ''
  const readStatus = isRead ? 'Previously read. ' : ''

  // New comments badge HTML
  const newCommentsBadge =
    newComments > 0
      ? `<span class="new-comments-badge">+${newComments} new</span>`
      : ''

  // Trending indicator HTML
  const trendingIndicator =
    trendingLevel !== 'none'
      ? `<span class="story-trending" data-level="${trendingLevel}" title="${trendingLevel === 'hot' ? 'Hot - rapidly gaining points' : 'Rising - gaining points'}">${trendingLevel === 'hot' ? icons.flame : icons.trendingUp}</span>`
      : ''

  return `
    <article class="story${readClass}" data-id="${story.id}"${typeAttr} aria-label="${readStatus}${escapeHtml(story.title || 'Untitled')} - ${story.score} points, ${story.descendants || 0} comments">
      <div class="story-rank" aria-hidden="true">${rank}</div>
      <div class="story-vote">
        <button class="vote-btn" title="Upvote" aria-label="Upvote this story">${icons.upvote}</button>
      </div>
      <div class="story-content">
        <h2 class="story-title">
          <a href="${story.url || `#item/${story.id}`}" target="_blank" rel="noopener">
            ${escapeHtml(story.title || 'Untitled')}
          </a>
          ${domain ? `<span class="story-domain" aria-label="from ${domain}">(${domain})</span>` : ''}
        </h2>
        <div class="story-meta" aria-hidden="true">
          <span class="story-score"${heatAttr}>${icons.points}${story.score} points${trendingIndicator}</span>
          <span class="meta-sep"></span>
          <span class="story-by">${icons.user}<a href="#user/${encodeURIComponent(story.by || 'unknown')}" class="user-link">${escapeHtml(story.by || 'unknown')}</a></span>
          <span class="meta-sep"></span>
          <span class="story-time">${icons.clock}${timeAgo}</span>
          <span class="meta-sep"></span>
          <span class="story-comments">
            <a href="#item/${story.id}" aria-label="${story.descendants || 0} comments">${icons.comment}${story.descendants || 0} comments</a>${newCommentsBadge}
          </span>
          ${readingTime ? `<span class="meta-sep"></span><span class="story-reading-time">${icons.book}${readingTime}</span>` : ''}
        </div>
      </div>
    </article>
  `
}

/**
 * Render a comment with its children recursively
 * @param comment - The comment data with children
 * @param depth - Nesting depth level
 * @param storyAuthor - Username of the story author (for OP highlighting)
 */
export function renderComment(
  comment: CommentWithChildren,
  depth = 0,
  storyAuthor: string | null = null,
): string {
  if (comment.deleted || comment.dead) {
    return `
      <div class="comment comment-deleted" data-depth="${depth}">
        <div class="comment-meta">
          <span class="comment-deleted-text">[deleted]</span>
        </div>
      </div>
    `
  }

  const timeAgo = formatTimeAgo(comment.time)
  const isOp = storyAuthor && comment.by === storyAuthor
  const hasChildren = comment.children && comment.children.length > 0
  const childCount = comment.children?.length ?? 0

  // Check if there are unfetched children (kids exist but weren't fetched)
  const totalKids = comment.kids?.length ?? 0
  const hasUnfetchedChildren = totalKids > 0 && !hasChildren

  const childrenHtml = hasChildren
    ? comment.children
        ?.map((child) => renderComment(child, depth + 1, storyAuthor))
        .join('')
    : ''

  // "Load more" button for unfetched children
  const loadMoreHtml = hasUnfetchedChildren
    ? `
      <div class="comment-load-more" data-parent-id="${comment.id}" data-depth="${depth + 1}" data-reply-count="${totalKids}">
        <button class="load-more-replies-btn">
          ${icons.expand}
          <span>Load ${totalKids} ${totalKids === 1 ? 'reply' : 'replies'}</span>
        </button>
      </div>
    `
    : ''

  return `
    <div class="comment" data-id="${comment.id}" data-depth="${depth}" data-collapsed="false" data-kids="${totalKids}">
      <div class="comment-indent" style="--depth: ${depth}"></div>
      <div class="comment-body">
        <div class="comment-meta">
          <button class="comment-collapse" title="Collapse">
            ${icons.collapse}
          </button>
          <span class="comment-author${isOp ? ' comment-author-op' : ''}">${icons.user}<a href="#user/${encodeURIComponent(comment.by || 'unknown')}" class="user-link">${escapeHtml(comment.by || 'unknown')}</a>${isOp ? ' <span class="op-badge">OP</span>' : ''}</span>
          <span class="meta-sep"></span>
          <span class="comment-time">${icons.clock}${timeAgo}</span>
          ${hasChildren ? `<span class="meta-sep"></span><span class="comment-replies">${icons.replies}${childCount}</span>` : ''}
          ${hasUnfetchedChildren ? `<span class="meta-sep"></span><span class="comment-replies comment-replies-unfetched">${icons.replies}${totalKids}</span>` : ''}
        </div>
        <div class="comment-content-wrapper">
          <div class="comment-content-inner">
            <div class="comment-text">${sanitizeHtml(comment.text)}</div>
          </div>
        </div>
        <div class="comment-collapsed-info">
          <span class="comment-author${isOp ? ' comment-author-op' : ''}">${escapeHtml(comment.by || 'unknown')}</span>
          <span class="meta-sep"></span>
          ${hasChildren || hasUnfetchedChildren ? `<span>${(childCount || totalKids) + 1} comments collapsed</span>` : '<span>collapsed</span>'}
        </div>
      </div>
      ${hasChildren ? `<div class="comment-children-wrapper"><div class="comment-children-inner"><div class="comment-children">${childrenHtml}</div></div></div>` : ''}
      ${loadMoreHtml}
    </div>
  `
}

/**
 * Render a submission item (story or comment) for user profile
 * @param item - The submission item
 */
export function renderSubmissionItem(item: HNItem): string {
  const timeAgo = formatTimeAgo(item.time)

  if (item.type === 1) {
    // Comment (ItemType.Comment = 1)
    return `
      <div class="submission-item submission-comment">
        <div class="submission-meta">
          ${icons.comment}
          <span class="submission-time">${timeAgo}</span>
          <span class="meta-sep"></span>
          <a href="#item/${item.parent}" class="submission-parent-link">on story</a>
        </div>
        <div class="submission-text">${sanitizeHtml(item.text)}</div>
      </div>
    `
  }

  // Story or Job
  const domain = extractDomain(item.url)
  const isJob = item.type === 2 // ItemType.Job = 2

  return `
    <div class="submission-item submission-story${isJob ? ' submission-job' : ''}">
      <div class="submission-title">
        <a href="${item.url || `#item/${item.id}`}" target="${item.url ? '_blank' : '_self'}" rel="noopener">
          ${escapeHtml(item.title || 'Untitled')}
        </a>
        ${domain ? `<span class="story-domain">(${domain})</span>` : ''}
      </div>
      <div class="submission-meta">
        ${icons.points}${item.score} points
        <span class="meta-sep"></span>
        ${icons.clock}${timeAgo}
        <span class="meta-sep"></span>
        <a href="#item/${item.id}">${icons.comment}${item.descendants || 0} comments</a>
      </div>
    </div>
  `
}

/**
 * Render the "load more" indicator at the bottom of story lists
 * @param hasMore - Whether there are more stories to load
 */
export function renderLoadMoreIndicator(hasMore = true): string {
  if (!hasMore) {
    return `
      <div class="load-more-indicator end">
        <span class="end-message">You've reached the end</span>
      </div>
    `
  }
  return `
    <div class="load-more-indicator">
      <div class="loading-spinner small"></div>
      <span>Loading more stories...</span>
    </div>
  `
}

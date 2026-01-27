/**
 * Story detail view module.
 * Handles rendering individual story details with comments.
 */

import { announce, escapeAttr } from './accessibility'
import {
  animateDetailEnter,
  animateStoriesAway,
  applyStaggerAnimation,
} from './animations'
import {
  extractDomain,
  fetchArticleContent,
  fetchCommentChildren,
  fetchStoryWithComments,
  formatTimeAgo,
} from './api'
import { setStoryContext, updateAssistantZenMode } from './assistant-ui'
import { parseApiError, renderErrorWithRetry, showErrorToast } from './errors'
import { icons } from './icons'
import { isCurrentlyOffline } from './offline'
import { getCachedStoryDetail } from './prefetch'
import { renderComment } from './renderers'
import { restoreStoryScrollPosition, setScrollTop } from './scroll-utils'
import { renderCommentSkeletons } from './skeletons'
import {
  getBookmarkedStoryById,
  isStoryBookmarked,
  markStoryAsRead,
  saveStoryCommentCount,
} from './storage'
import { toastInfo } from './toast'
import { type HNItem, ItemType } from './types'
import {
  calculateReadingTime,
  countWords,
  escapeHtml,
  getScoreHeat,
  getStoryType,
  sanitizeHtml,
} from './utils'
import { isZenModeActive } from './zen-mode'

// Module state
let currentStoryAuthor: string | null = null
let currentStoryId: number | null = null
let currentStoryCommentCount: number | null = null
let currentStoryData: HNItem | null = null
let isLoading = false

/**
 * Get current story ID.
 */
export function getCurrentStoryId(): number | null {
  return currentStoryId
}

/**
 * Get current story author (OP).
 */
export function getCurrentStoryAuthor(): string | null {
  return currentStoryAuthor
}

/**
 * Get current story data.
 */
export function getCurrentStoryData(): HNItem | null {
  return currentStoryData
}

/**
 * Get current story comment count.
 */
export function getCurrentStoryCommentCount(): number | null {
  return currentStoryCommentCount
}

/**
 * Check if story detail is currently loading.
 */
export function isStoryDetailLoading(): boolean {
  return isLoading
}

/**
 * Save current story's comment count and reset state.
 * Called when navigating away from story detail.
 */
export function saveAndResetStoryState(
  commentCountsMap: Map<number, number>,
): void {
  if (currentStoryId && currentStoryCommentCount !== null) {
    saveStoryCommentCount(currentStoryId, currentStoryCommentCount)
    commentCountsMap.set(currentStoryId, currentStoryCommentCount)
  }
  currentStoryCommentCount = null
  currentStoryData = null
  currentStoryId = null
  currentStoryAuthor = null
}

/**
 * Set up tab switching for story detail view.
 */
function setupStoryTabs(container: HTMLElement): void {
  const _tablist = container.querySelector('.story-tabs')
  const tabs = container.querySelectorAll('.story-tab')
  const contents = container.querySelectorAll('.story-tab-content')

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab
      if (!tabName) return

      // Update active tab and ARIA states
      tabs.forEach((t) => {
        const isActive = t === tab
        t.classList.toggle('active', isActive)
        t.setAttribute('aria-selected', isActive ? 'true' : 'false')
        t.setAttribute('tabindex', isActive ? '0' : '-1')
      })

      // Show/hide content
      contents.forEach((content) => {
        const contentName = (content as HTMLElement).dataset.tabContent
        const isVisible = contentName === tabName
        content.classList.toggle('hidden', !isVisible)
        content.setAttribute('aria-hidden', isVisible ? 'false' : 'true')
      })

      // Scroll to top when switching tabs
      setScrollTop(0)
    })

    // Keyboard navigation for tabs
    tab.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key
      const currentIndex = Array.from(tabs).indexOf(tab)
      let newIndex = currentIndex

      if (key === 'ArrowLeft' || key === 'ArrowUp') {
        e.preventDefault()
        newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
      } else if (key === 'ArrowRight' || key === 'ArrowDown') {
        e.preventDefault()
        newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1
      } else if (key === 'Home') {
        e.preventDefault()
        newIndex = 0
      } else if (key === 'End') {
        e.preventDefault()
        newIndex = tabs.length - 1
      }

      if (newIndex !== currentIndex) {
        const newTab = tabs[newIndex] as HTMLElement
        newTab.focus()
        newTab.click()
      }
    })
  })
}

/**
 * Fetch article content from external URL and display it.
 */
async function fetchAndDisplayArticle(
  url: string,
  container: HTMLElement,
): Promise<void> {
  const articleContainer = container.querySelector('.article-content')
  if (!articleContainer) return

  try {
    const article = await fetchArticleContent(url)

    if (article.content) {
      const readingTime = article.wordCount
        ? calculateReadingTime(article.wordCount)
        : ''
      articleContainer.innerHTML = `
        <div class="article-reader">
          ${article.title ? `<h2 class="article-title">${escapeHtml(article.title)}</h2>` : ''}
          ${article.byline ? `<div class="article-byline">${escapeHtml(article.byline)}</div>` : ''}
          <div class="article-meta">
            ${article.siteName ? `<span class="article-source">${escapeHtml(article.siteName)}</span>` : ''}
            ${readingTime ? `<span class="article-reading-time">${icons.clock}${readingTime}</span>` : ''}
          </div>
          <div class="article-body">${article.content}</div>
        </div>
      `
    } else {
      articleContainer.innerHTML = `
        <div class="article-error">
          <p>Could not extract article content.</p>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="external-link-btn">
            ${icons.link}
            <span>Open in browser</span>
          </a>
        </div>
      `
    }
  } catch (error) {
    console.error('Failed to fetch article:', error)
    articleContainer.innerHTML = `
      <div class="article-error">
        <p>Failed to load article content.</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="external-link-btn">
          ${icons.link}
          <span>Open in browser</span>
        </a>
      </div>
    `
  }
}

/**
 * Set up comment collapse handlers.
 */
export function setupCommentCollapse(container: HTMLElement): void {
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement

    // Handle collapse button
    const collapseBtn = target.closest(
      '.comment-collapse',
    ) as HTMLElement | null
    if (collapseBtn) {
      const comment = collapseBtn.closest('.comment') as HTMLElement | null
      if (!comment) return

      const isCollapsed = comment.dataset.collapsed === 'true'
      comment.dataset.collapsed = isCollapsed ? 'false' : 'true'
      collapseBtn.title = isCollapsed ? 'Collapse' : 'Expand'
      collapseBtn.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false')

      // Update aria-label to reflect current state
      const author =
        comment.querySelector('.comment-author a')?.textContent || 'unknown'
      collapseBtn.setAttribute(
        'aria-label',
        isCollapsed
          ? `Collapse comment by ${author}`
          : `Expand comment by ${author}`,
      )
      return
    }

    // Handle "load more replies" button
    const loadMoreBtn = target.closest(
      '.load-more-replies-btn',
    ) as HTMLButtonElement | null
    if (loadMoreBtn) {
      const loadMoreContainer = loadMoreBtn.closest(
        '.comment-load-more',
      ) as HTMLElement | null
      if (!loadMoreContainer) return

      const parentId = Number(loadMoreContainer.dataset.parentId)
      const depth = Number(loadMoreContainer.dataset.depth)
      const replyCount = Number(loadMoreContainer.dataset.replyCount) || 3

      // Show loading skeleton instead of button
      const skeletonCount = Math.min(replyCount, 3)
      loadMoreContainer.innerHTML = renderCommentSkeletons(skeletonCount)
      loadMoreContainer.classList.add('loading')

      try {
        const children = await fetchCommentChildren(parentId, 1)

        if (children.length > 0) {
          const newCommentsHtml = children
            .map((c) => renderComment(c, depth, currentStoryAuthor))
            .join('')

          const parentComment = container.querySelector(
            `.comment[data-id="${parentId}"]`,
          ) as HTMLElement | null

          if (parentComment) {
            let childrenContainer =
              parentComment.querySelector('.comment-children')
            if (!childrenContainer) {
              childrenContainer = document.createElement('div')
              childrenContainer.className = 'comment-children'
              parentComment.appendChild(childrenContainer)
            }

            childrenContainer.insertAdjacentHTML('beforeend', newCommentsHtml)
            loadMoreContainer.remove()

            const repliesSpan = parentComment.querySelector(
              '.comment-replies-unfetched',
            )
            if (repliesSpan) {
              repliesSpan.classList.remove('comment-replies-unfetched')
              repliesSpan.textContent = `${children.length} ${children.length === 1 ? 'reply' : 'replies'}`
            }
          }
        }
      } catch (error) {
        console.error('Failed to load replies:', error)
        loadMoreContainer.classList.remove('loading')
        loadMoreContainer.innerHTML = `
          <button class="load-more-replies-btn error">
            ${icons.expand}
            <span>Failed to load. Retry?</span>
          </button>
        `
      }
    }
  })
}

/**
 * Render a cached/bookmarked story in offline mode.
 */
function renderOfflineStoryDetail(container: HTMLElement, story: HNItem): void {
  const domain = extractDomain(story.url)
  const timeAgo = formatTimeAgo(story.time)
  const storyType =
    story.type === ItemType.Job ? 'job' : getStoryType(story.title)
  const scoreHeat = getScoreHeat(story.score)
  const typeAttr = storyType ? ` data-type="${storyType}"` : ''
  const heatAttr = scoreHeat ? ` data-heat="${scoreHeat}"` : ''

  currentStoryData = story
  currentStoryAuthor = story.by

  const textWordCount = story.text ? countWords(story.text) : 0
  const textReadingTime =
    textWordCount > 0 ? calculateReadingTime(textWordCount) : ''

  container.innerHTML = `
    <div class="story-detail"${typeAttr}>
      <div class="story-detail-header">
        <button class="back-btn" data-action="back" title="Back to stories">
          ${icons.back}
          <span>Back</span>
        </button>
      </div>
      
      <div class="offline-badge">
        ${icons.wifiOff}
        <span>Viewing cached version (offline)</span>
      </div>
      
      <article class="story-detail-content">
        <h1 class="story-detail-title">
          ${story.url ? `<a href="${story.url}" target="_blank" rel="noopener">${escapeHtml(story.title || 'Untitled')}</a>` : escapeHtml(story.title || 'Untitled')}
        </h1>
        ${domain ? `<div class="story-detail-domain"><a href="${story.url}" target="_blank" rel="noopener">${icons.link}${domain}</a></div>` : ''}
        <div class="story-detail-meta">
          <span class="story-score"${heatAttr}>${icons.points}${story.score} points</span>
          <span class="meta-sep"></span>
          <span class="story-by">${icons.user}<a href="#user/${encodeURIComponent(story.by || 'unknown')}" class="user-link">${escapeHtml(story.by || 'unknown')}</a></span>
          <span class="meta-sep"></span>
          <span class="story-time">${icons.clock}${timeAgo}</span>
          <span class="meta-sep"></span>
          <span class="story-comments-count">${icons.comment}${story.descendants || 0} comments</span>
          ${textReadingTime ? `<span class="meta-sep"></span><span class="story-reading-time">${icons.book}${textReadingTime}</span>` : ''}
        </div>
        <div class="story-actions">
          <button class="story-action-btn${isStoryBookmarked(story.id) ? ' bookmarked' : ''}" data-action="toggle-bookmark" data-id="${story.id}" title="${isStoryBookmarked(story.id) ? 'Remove bookmark' : 'Bookmark story'}">
            ${isStoryBookmarked(story.id) ? icons.bookmarkFilled : icons.bookmark}
            <span>${isStoryBookmarked(story.id) ? 'Bookmarked' : 'Bookmark'}</span>
          </button>
          <button class="story-action-btn" data-action="copy-hn-link" data-id="${story.id}" title="Copy HN link">
            ${icons.copy}
            <span>Copy HN Link</span>
          </button>
          ${
            story.url
              ? `<button class="story-action-btn" data-action="copy-article-link" data-url="${escapeAttr(story.url)}" title="Copy article link">
            ${icons.link}
            <span>Copy Article Link</span>
          </button>`
              : ''
          }
        </div>
      </article>
      
      ${
        story.text
          ? `
        <div class="story-detail-text">${sanitizeHtml(story.text)}</div>
      `
          : ''
      }
      
      <div class="offline-story-notice">
        ${icons.wifiOff}
        Comments are not available while offline. Connect to the internet to load comments.
      </div>
    </div>
  `

  setScrollTop(0)
  updateAssistantZenMode(isZenModeActive(), 'detail')
}

/**
 * Render story detail view.
 */
export async function renderStoryDetail(
  storyId: number,
  container: HTMLElement,
  readStoryIds: Set<number>,
  clickedStoryEl?: HTMLElement,
): Promise<void> {
  if (isLoading) return
  isLoading = true

  currentStoryId = storyId
  markStoryAsRead(storyId)
  readStoryIds.add(storyId)

  // Animate stories away if we have a clicked element
  if (clickedStoryEl) {
    await animateStoriesAway(clickedStoryEl)
  }

  // Show skeleton loading state
  const skeletonWidth = isZenModeActive() ? '95%' : '90%'
  container.innerHTML = `
    <div class="story-detail" style="max-width: ${skeletonWidth};">
      <div class="story-detail-header">
        <button class="back-btn" data-action="back" title="Back to stories">
          ${icons.back}
          <span>Back</span>
        </button>
      </div>
      <article class="story-detail-content">
        <div class="skeleton skeleton-title" style="height: 1.75rem; width: 80%; margin-bottom: 0.75rem;"></div>
        <div class="skeleton skeleton-meta-item" style="width: 120px; margin-bottom: 1rem;"></div>
        <div class="skeleton-meta" style="margin-bottom: 1rem;">
          <div class="skeleton skeleton-meta-item"></div>
          <div class="skeleton skeleton-meta-item wide"></div>
          <div class="skeleton skeleton-meta-item"></div>
        </div>
      </article>
      <section class="comments-section">
        <h2 class="comments-header">${icons.comment}Comments</h2>
        <div class="comments-list">
          ${renderCommentSkeletons(5)}
        </div>
      </section>
    </div>
  `

  await animateDetailEnter(container)

  try {
    const cachedData = getCachedStoryDetail(storyId)
    const { story, comments } =
      cachedData || (await fetchStoryWithComments(storyId, 1))

    currentStoryAuthor = story.by
    currentStoryData = story

    const domain = extractDomain(story.url)
    const timeAgo = formatTimeAgo(story.time)
    const storyType =
      story.type === ItemType.Job ? 'job' : getStoryType(story.title)
    const scoreHeat = getScoreHeat(story.score)

    const typeAttr = storyType ? ` data-type="${storyType}"` : ''
    const heatAttr = scoreHeat ? ` data-heat="${scoreHeat}"` : ''

    const commentsHtml =
      comments.length > 0
        ? comments.map((c) => renderComment(c, 0, story.by)).join('')
        : '<div class="no-comments">No comments yet</div>'

    const hasExternalUrl = !!story.url && !story.url.startsWith('item?id=')
    const commentCount = story.descendants || 0
    currentStoryCommentCount = commentCount

    const textWordCount = story.text ? countWords(story.text) : 0
    const textReadingTime =
      textWordCount > 0 ? calculateReadingTime(textWordCount) : ''

    container.innerHTML = `
      <div class="story-detail"${typeAttr}>
        <div class="story-detail-header">
          <button class="back-btn" data-action="back" title="Back to stories">
            ${icons.back}
            <span>Back</span>
          </button>
        </div>
        <article class="story-detail-content">
          <h1 class="story-detail-title">
            ${story.url ? `<a href="${story.url}" target="_blank" rel="noopener">${escapeHtml(story.title || 'Untitled')}</a>` : escapeHtml(story.title || 'Untitled')}
          </h1>
          ${domain ? `<div class="story-detail-domain"><a href="${story.url}" target="_blank" rel="noopener">${icons.link}${domain}</a></div>` : ''}
          <div class="story-detail-meta">
            <span class="story-score"${heatAttr}>${icons.points}${story.score} points</span>
            <span class="meta-sep"></span>
            <span class="story-by">${icons.user}<a href="#user/${encodeURIComponent(story.by || 'unknown')}" class="user-link">${escapeHtml(story.by || 'unknown')}</a></span>
            <span class="meta-sep"></span>
            <span class="story-time">${icons.clock}${timeAgo}</span>
            <span class="meta-sep"></span>
            <span class="story-comments-count">${icons.comment}${commentCount} comments</span>
            ${textReadingTime ? `<span class="meta-sep"></span><span class="story-reading-time">${icons.book}${textReadingTime}</span>` : ''}
          </div>
          <div class="story-actions">
            <button class="story-action-btn${isStoryBookmarked(story.id) ? ' bookmarked' : ''}" data-action="toggle-bookmark" data-id="${story.id}" title="${isStoryBookmarked(story.id) ? 'Remove bookmark' : 'Bookmark story'}">
              ${isStoryBookmarked(story.id) ? icons.bookmarkFilled : icons.bookmark}
              <span>${isStoryBookmarked(story.id) ? 'Bookmarked' : 'Bookmark'}</span>
            </button>
            <button class="story-action-btn" data-action="copy-hn-link" data-id="${story.id}" title="Copy HN link">
              ${icons.copy}
              <span>Copy HN Link</span>
            </button>
            ${
              story.url
                ? `<button class="story-action-btn" data-action="copy-article-link" data-url="${escapeAttr(story.url)}" title="Copy article link">
              ${icons.link}
              <span>Copy Article Link</span>
            </button>`
                : ''
            }
            <button class="story-action-btn" data-action="share" data-id="${story.id}" data-title="${escapeAttr(story.title || 'Untitled')}" ${story.url ? `data-url="${escapeAttr(story.url)}"` : ''} title="Share story">
              ${icons.share}
              <span>Share</span>
            </button>
          </div>
        </article>
        
        <div class="story-tabs" role="tablist" aria-label="Story content tabs">
          <button class="story-tab active" data-tab="story" role="tab" aria-selected="true" aria-controls="story-tab-panel" id="story-tab" tabindex="0">
            ${icons.article}
            <span>Story</span>
          </button>
          <button class="story-tab" data-tab="comments" role="tab" aria-selected="false" aria-controls="comments-tab-panel" id="comments-tab" tabindex="-1">
            ${icons.comment}
            <span>Comments${commentCount > 0 ? ` (${commentCount})` : ''}</span>
          </button>
        </div>
        
        <div class="story-tab-content" data-tab-content="story" role="tabpanel" id="story-tab-panel" aria-labelledby="story-tab" aria-hidden="false">
          ${
            hasExternalUrl
              ? `
            <div class="article-content" data-url="${escapeHtml(story.url || '')}">
              <div class="article-loading">
                <div class="skeleton skeleton-title" style="height: 1.75rem; width: 75%; margin-bottom: 1.25rem;"></div>
                <div class="skeleton" style="height: 0.9rem; width: 30%; margin-bottom: 1.5rem; opacity: 0.6;"></div>
                <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.6rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.6rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 92%; margin-bottom: 1.25rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.6rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.6rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 88%; margin-bottom: 0.6rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 95%; margin-bottom: 1.25rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.6rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 75%;"></div>
              </div>
            </div>
          `
              : story.text
                ? `
            <div class="story-detail-text">${sanitizeHtml(story.text)}</div>
          `
                : `
            <div class="no-content">
              <p>This story links to an external URL.</p>
              <a href="${story.url}" target="_blank" rel="noopener" class="external-link-btn">
                ${icons.link}
                <span>Open in browser</span>
              </a>
            </div>
          `
          }
        </div>
        
        <div class="story-tab-content hidden" data-tab-content="comments" role="tabpanel" id="comments-tab-panel" aria-labelledby="comments-tab" aria-hidden="true">
          <section class="comments-section">
            <div class="comments-list">
              ${commentsHtml}
            </div>
          </section>
        </div>
      </div>
    `

    setupStoryTabs(container)
    setupCommentCollapse(container)

    const commentsList = container.querySelector('.comments-list')
    if (commentsList) {
      applyStaggerAnimation(commentsList as HTMLElement, ':scope > .comment')
    }

    if (hasExternalUrl && story.url) {
      fetchAndDisplayArticle(story.url, container)
    }

    setStoryContext(story, comments)
    restoreStoryScrollPosition(storyId)
    updateAssistantZenMode(isZenModeActive(), 'detail')
    announce(`Story loaded with ${commentCount} comments`)
  } catch (error) {
    const cachedStory = getBookmarkedStoryById(storyId)

    if (cachedStory && isCurrentlyOffline()) {
      renderOfflineStoryDetail(container, cachedStory)
      toastInfo('Showing cached version (offline)')
      announce('Showing cached story. You are offline.')
    } else {
      const parsed = parseApiError(error)
      container.innerHTML = renderErrorWithRetry(
        parsed,
        'Story',
        'retry-story',
        true,
      )
      showErrorToast(error, 'Load story')
      announce('Error loading story')
      console.error('Failed to load story:', error)
    }
  } finally {
    isLoading = false
  }
}

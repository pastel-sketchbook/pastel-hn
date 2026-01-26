import { announce, escapeAttr } from './accessibility'
import {
  animateDetailEnter,
  animateDetailExit,
  animateListEnter,
  animateStoriesAway,
  applyStaggerAnimation,
} from './animations'
import {
  clearStoryIdsCache,
  extractDomain,
  fetchArticleContent,
  fetchCommentChildren,
  fetchStoriesPaginated,
  fetchStoryWithComments,
  fetchUser,
  fetchUserSubmissions,
  formatTimeAgo,
  init,
} from './api'
import {
  clearStoryContext,
  closeAssistant,
  initAssistant,
  isAssistantOpen,
  setStoryContext,
  updateAssistantZenMode,
} from './assistant-ui'
import {
  configureBackToTop,
  scrollToTop,
  setupBackToTop,
  updateBackToTopVisibility,
} from './back-to-top'
import { parseApiError, renderErrorWithRetry, showErrorToast } from './errors'
import { closeHelpModal, isHelpModalOpen, showHelpModal } from './help-modal'
import { icons } from './icons'
import { initKeyboard, resetSelection, setKeyboardCallbacks } from './keyboard'
import {
  clearPrefetchCache,
  getCachedStoryDetail,
  onStoryHoverEnd,
  onStoryHoverStart,
  prefetchNextPage,
  prefetchVisibleStories,
} from './prefetch'
import { configurePullRefresh, setupPullToRefresh } from './pull-refresh'
import {
  renderComment,
  renderLoadMoreIndicator,
  renderStory,
  renderSubmissionItem,
} from './renderers'
import { closeSearchModal, isSearchModalOpen, showSearchModal } from './search'
import {
  closeSettingsModal,
  getSettings,
  initSettings,
  isSettingsModalOpen,
  showSettingsModal,
} from './settings'
import {
  renderCommentSkeletons,
  renderStorySkeletons,
  renderUserProfileSkeleton,
} from './skeletons'
import {
  clearFeedScrollPosition,
  getCommentCountsMap,
  getFeedScrollPosition,
  getReadStoryIds,
  getStoryScrollPosition,
  markStoryAsRead,
  saveFeedScrollPosition,
  saveStoryCommentCount,
  saveStoryScrollPosition,
} from './storage'
import { toggleTheme } from './theme'
import { toastError, toastInfo, toastSuccess } from './toast'
import { type HNItem, ItemType, type StoryFeed } from './types'
import {
  calculateReadingTime,
  countWords,
  escapeHtml,
  formatAccountAge,
  getScoreHeat,
  getStoryType,
  sanitizeHtml,
} from './utils'
import { VirtualScroll } from './virtual-scroll'
import {
  exitZenMode,
  isZenModeActive,
  isZenModeTransitioning,
  setZenModeChangeCallback,
  toggleZenMode,
} from './zen-mode'
import './styles/main.css'

let currentFeed: StoryFeed = 'top'
let isLoading = false
let isLoadingMore = false
let currentView: 'list' | 'detail' | 'user' = 'list'
let currentStories: HNItem[] = []
let currentOffset = 0
let hasMoreStories = true
let currentStoryAuthor: string | null = null // Track OP for comment highlighting
let currentStoryId: number | null = null // Track current story for scroll position
let currentUserId: string | null = null // Track current user profile
let readStoryIds: Set<number> = new Set() // Cache of read stories
let commentCountsMap: Map<number, number> = new Map() // Cache of last seen comment counts
let currentStoryCommentCount: number | null = null // Track comment count of current story
const STORIES_PER_PAGE = 30
const SUBMISSIONS_PER_PAGE = 20

/**
 * Navigate back to list view with animation
 */
async function navigateBackToList(): Promise<void> {
  const container = document.getElementById('stories')
  if (!container) return

  // Save comment count when leaving story detail view
  // This enables the "new comments" badge on next visit
  if (currentStoryId && currentStoryCommentCount !== null) {
    saveStoryCommentCount(currentStoryId, currentStoryCommentCount)
    // Update local cache so badge reflects immediately
    commentCountsMap.set(currentStoryId, currentStoryCommentCount)
  }

  // Exit zen mode when going back to list
  // This ensures window decorations and header are restored
  if (isZenModeActive()) {
    await exitZenMode()
  }

  // Animate detail view exiting
  await animateDetailExit(container)

  // Clear AI assistant context and close panel when leaving story
  clearStoryContext()
  closeAssistant()

  // Reset current story tracking
  currentStoryCommentCount = null

  // Update state and render list with animation
  currentView = 'list'
  window.location.hash = ''
  await renderStories(currentFeed, false, true)
}

// Virtual scroll configuration
const STORY_ITEM_HEIGHT = 95 // Estimated height of each story item in pixels
const VIRTUAL_SCROLL_THRESHOLD = 100 // Use virtual scroll when list exceeds this
let virtualScroll: VirtualScroll<HNItem> | null = null

// Intersection Observer for infinite scroll (fallback for small lists)
let scrollObserver: IntersectionObserver | null = null

// Get the main scroll container
function getScrollContainer(): HTMLElement {
  return document.querySelector('main') as HTMLElement
}

// Get current scroll position from the scroll container
function getScrollTop(): number {
  const container = getScrollContainer()
  return container ? container.scrollTop : 0
}

// Set scroll position on the scroll container
function setScrollTop(top: number, behavior: ScrollBehavior = 'auto'): void {
  const container = getScrollContainer()
  if (container) {
    container.scrollTo({ top, behavior })
  }
}

// Debounced scroll position saver
let scrollSaveTimeout: ReturnType<typeof setTimeout> | null = null
function saveScrollPositionDebounced(): void {
  if (scrollSaveTimeout) clearTimeout(scrollSaveTimeout)
  scrollSaveTimeout = setTimeout(() => {
    const scrollY = getScrollTop()
    if (currentView === 'list') {
      saveFeedScrollPosition(currentFeed, scrollY)
    } else if (currentView === 'detail' && currentStoryId) {
      saveStoryScrollPosition(currentStoryId, scrollY)
    }
  }, 150)
}

// Handle sticky header shadow on scroll
function updateHeaderShadow(): void {
  const header = document.querySelector('header')
  if (!header) return

  if (getScrollTop() > 10) {
    header.classList.add('scrolled')
  } else {
    header.classList.remove('scrolled')
  }
}

// Pull-to-refresh handler called by the pull-refresh module
async function handlePullRefresh(): Promise<void> {
  if (currentView === 'list') {
    await renderStories(currentFeed, true)
    toastSuccess('Feed refreshed')
  }
}

async function renderStories(
  feed: StoryFeed,
  refresh = false,
  animateIn = false,
): Promise<void> {
  if (isLoading) return
  isLoading = true
  resetSelection()

  // Save current scroll position before clearing (for feed switches)
  if (currentView === 'list' && currentFeed !== feed) {
    saveFeedScrollPosition(currentFeed, getScrollTop())
  }

  // Reset pagination state
  currentOffset = 0
  hasMoreStories = true
  currentStories = []
  currentStoryId = null

  // Clean up existing virtual scroll
  if (virtualScroll) {
    virtualScroll.destroy()
    virtualScroll = null
  }

  // Clear scroll position on explicit refresh
  if (refresh) {
    clearStoryIdsCache(feed)
    clearFeedScrollPosition(feed)
    clearPrefetchCache() // Clear prefetched data on refresh
  }

  // Load read stories cache
  readStoryIds = getReadStoryIds()

  // Load comment counts cache for "new comments" badge
  commentCountsMap = getCommentCountsMap()

  const container = document.getElementById('stories')
  if (!container) {
    isLoading = false
    return
  }

  // Show skeleton loading state
  container.innerHTML = renderStorySkeletons(6)

  // Animate list entering if coming back from detail
  if (animateIn) {
    await animateListEnter(container)
  }

  try {
    const { stories, hasMore } = await fetchStoriesPaginated(
      feed,
      0,
      STORIES_PER_PAGE,
    )
    currentStories = stories
    currentOffset = stories.length
    hasMoreStories = hasMore

    // Decide whether to use virtual scroll based on expected list size
    // For now, always use standard rendering and let virtual scroll kick in
    // when we exceed the threshold
    renderStoriesStandard(container, stories)

    // Update accessibility state
    container.setAttribute('aria-busy', 'false')

    // Announce to screen readers
    announce(`${stories.length} stories loaded`)

    // Restore scroll position (defer to allow DOM to render)
    requestAnimationFrame(() => {
      const savedPosition = getFeedScrollPosition(feed)
      if (savedPosition > 0) {
        setScrollTop(savedPosition)
      }
    })
  } catch (error) {
    container.setAttribute('aria-busy', 'false')
    const parsed = parseApiError(error)
    container.innerHTML = renderErrorWithRetry(
      parsed,
      'Stories',
      'retry-stories',
    )
    showErrorToast(error, 'Load stories')
    announce('Error loading stories')
    console.error('Failed to load stories:', error)
  } finally {
    isLoading = false
  }
}

/**
 * Standard rendering for small lists - uses direct DOM
 */
function renderStoriesStandard(
  container: HTMLElement,
  stories: HNItem[],
): void {
  container.innerHTML =
    stories
      .map((story, idx) => {
        const lastSeenCount = commentCountsMap.get(story.id)
        const currentCount = story.descendants || 0
        const newComments =
          lastSeenCount !== undefined
            ? Math.max(0, currentCount - lastSeenCount)
            : 0
        return renderStory(
          story,
          idx + 1,
          readStoryIds.has(story.id),
          newComments,
        )
      })
      .join('') + renderLoadMoreIndicator(hasMoreStories)

  // Apply stagger animation to stories
  applyStaggerAnimation(container, '.story')

  // Setup hover prefetch for story cards
  setupStoryHoverPrefetch(container)

  // Prefetch visible stories during idle time
  const storyIds = stories.map((s) => s.id)
  prefetchVisibleStories(storyIds)

  // Setup infinite scroll observer
  setupInfiniteScroll()

  // Update assistant visibility (disabled in list view)
  updateAssistantZenMode(isZenModeActive(), 'list')
}

/**
 * Set up hover event listeners on story cards for prefetching
 */
function setupStoryHoverPrefetch(container: HTMLElement): void {
  const storyCards = container.querySelectorAll('.story[data-id]')

  storyCards.forEach((card) => {
    const storyId = Number((card as HTMLElement).dataset.id)
    if (!storyId) return

    card.addEventListener('mouseenter', () => {
      onStoryHoverStart(storyId)
    })

    card.addEventListener('mouseleave', () => {
      onStoryHoverEnd(storyId)
    })
  })
}

/**
 * Initialize virtual scroll for large lists
 */
function initVirtualScroll(container: HTMLElement): void {
  // Clean up existing
  if (virtualScroll) {
    virtualScroll.destroy()
  }

  virtualScroll = new VirtualScroll<HNItem>({
    container,
    itemHeight: STORY_ITEM_HEIGHT,
    bufferSize: 10,
    renderItem: (story, index) => {
      const lastSeenCount = commentCountsMap.get(story.id)
      const currentCount = story.descendants || 0
      const newComments =
        lastSeenCount !== undefined
          ? Math.max(0, currentCount - lastSeenCount)
          : 0
      return renderStory(
        story,
        index + 1,
        readStoryIds.has(story.id),
        newComments,
      )
    },
    onNearEnd: () => {
      if (hasMoreStories && !isLoadingMore) {
        loadMoreStoriesVirtual()
      }
    },
    nearEndThreshold: 400,
  })

  virtualScroll.init(currentStories)
}

/**
 * Load more stories for virtual scroll mode
 */
async function loadMoreStoriesVirtual(): Promise<void> {
  if (isLoadingMore || !hasMoreStories) return
  isLoadingMore = true

  try {
    const { stories, hasMore } = await fetchStoriesPaginated(
      currentFeed,
      currentOffset,
      STORIES_PER_PAGE,
    )

    if (stories.length > 0 && virtualScroll) {
      currentStories = [...currentStories, ...stories]
      currentOffset += stories.length
      hasMoreStories = hasMore

      virtualScroll.appendItems(stories)
      virtualScroll.resetNearEndTrigger()
    }
  } catch (error) {
    console.error('Failed to load more stories:', error)
  } finally {
    isLoadingMore = false
  }
}

/**
 * Switch to virtual scroll when list gets large
 */
function maybeEnableVirtualScroll(): void {
  if (virtualScroll) return // Already using virtual scroll

  if (currentStories.length >= VIRTUAL_SCROLL_THRESHOLD) {
    const container = document.getElementById('stories')
    if (container) {
      // Save current scroll position
      const scrollY = getScrollTop()

      // Switch to virtual scroll
      initVirtualScroll(container)

      // Restore scroll position
      setScrollTop(scrollY)
    }
  }
}

async function loadMoreStories(): Promise<void> {
  if (isLoadingMore || !hasMoreStories || currentView !== 'list') return

  // If using virtual scroll, delegate to that
  if (virtualScroll) {
    return loadMoreStoriesVirtual()
  }

  isLoadingMore = true

  const indicator = document.querySelector('.load-more-indicator')
  if (indicator) {
    indicator.classList.add('loading')
  }

  try {
    const { stories, hasMore } = await fetchStoriesPaginated(
      currentFeed,
      currentOffset,
      STORIES_PER_PAGE,
    )

    if (stories.length > 0) {
      const container = document.getElementById('stories')
      if (!container) return

      // Remove the load more indicator temporarily
      const loadMoreEl = container.querySelector('.load-more-indicator')
      if (loadMoreEl) loadMoreEl.remove()

      // Append new stories
      const startRank = currentStories.length + 1
      const newStoriesHtml = stories
        .map((story, idx) => {
          const lastSeenCount = commentCountsMap.get(story.id)
          const currentCount = story.descendants || 0
          const newComments =
            lastSeenCount !== undefined
              ? Math.max(0, currentCount - lastSeenCount)
              : 0
          return renderStory(
            story,
            startRank + idx,
            readStoryIds.has(story.id),
            newComments,
          )
        })
        .join('')

      container.insertAdjacentHTML('beforeend', newStoriesHtml)
      container.insertAdjacentHTML(
        'beforeend',
        renderLoadMoreIndicator(hasMoreStories),
      )

      // Setup hover prefetch for newly added story cards
      const newStoryCards = container.querySelectorAll(
        '.story[data-id]:not([data-prefetch-bound])',
      )
      newStoryCards.forEach((card) => {
        const el = card as HTMLElement
        const storyId = Number(el.dataset.id)
        if (!storyId) return
        el.dataset.prefetchBound = 'true'
        el.addEventListener('mouseenter', () => onStoryHoverStart(storyId))
        el.addEventListener('mouseleave', () => onStoryHoverEnd(storyId))
      })

      currentStories = [...currentStories, ...stories]
      currentOffset += stories.length
      hasMoreStories = hasMore

      // Re-setup observer for new indicator
      setupInfiniteScroll()

      // Check if we should switch to virtual scroll for better performance
      maybeEnableVirtualScroll()
    }
  } catch (error) {
    console.error('Failed to load more stories:', error)
    const indicator = document.querySelector('.load-more-indicator')
    if (indicator) {
      indicator.innerHTML = `
        <span class="load-more-error">Failed to load more. <button class="retry-btn" onclick="window.retryLoadMore()">Retry</button></span>
      `
    }
  } finally {
    isLoadingMore = false
    const indicator = document.querySelector('.load-more-indicator')
    if (indicator) {
      indicator.classList.remove('loading')
    }
  }
}
// Expose retry function globally for the retry button
;(window as { retryLoadMore?: typeof loadMoreStories }).retryLoadMore =
  loadMoreStories

function setupInfiniteScroll(): void {
  // Clean up existing observer
  if (scrollObserver) {
    scrollObserver.disconnect()
  }

  const indicator = document.querySelector('.load-more-indicator')
  if (!indicator || !hasMoreStories) return

  scrollObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && hasMoreStories && !isLoadingMore) {
        // Prefetch the next page while loading current
        prefetchNextPage(
          currentFeed,
          currentOffset + STORIES_PER_PAGE,
          STORIES_PER_PAGE,
        )
        loadMoreStories()
      }
    },
    {
      rootMargin: '200px', // Start loading 200px before reaching the bottom
      threshold: 0,
    },
  )

  scrollObserver.observe(indicator)
}

/**
 * Set up tab switching for story detail view
 */
function setupStoryTabs(container: HTMLElement): void {
  const tabs = container.querySelectorAll('.story-tab')
  const contents = container.querySelectorAll('.story-tab-content')

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab
      if (!tabName) return

      // Update active tab
      tabs.forEach((t) => {
        t.classList.remove('active')
      })
      tab.classList.add('active')

      // Show/hide content
      contents.forEach((content) => {
        const contentName = (content as HTMLElement).dataset.tabContent
        if (contentName === tabName) {
          content.classList.remove('hidden')
        } else {
          content.classList.add('hidden')
        }
      })

      // Scroll to top when switching tabs
      setScrollTop(0)
    })
  })
}

/**
 * Fetch article content from external URL and display it
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

async function renderStoryDetail(
  storyId: number,
  clickedStoryEl?: HTMLElement,
): Promise<void> {
  if (isLoading) return
  isLoading = true
  currentView = 'detail'

  // Save feed scroll position before navigating
  saveFeedScrollPosition(currentFeed, getScrollTop())

  // Set current story for scroll tracking
  currentStoryId = storyId

  // Mark story as read
  markStoryAsRead(storyId)
  readStoryIds.add(storyId)

  const container = document.getElementById('stories')
  if (!container) {
    isLoading = false
    return
  }

  // Animate stories away if we have a clicked element
  if (clickedStoryEl) {
    await animateStoriesAway(clickedStoryEl)
  }

  // Show skeleton loading state for story detail
  // Use appropriate width based on zen mode
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

  // Animate detail view entering
  await animateDetailEnter(container)

  try {
    // Check if we have cached data from prefetching
    const cachedData = getCachedStoryDetail(storyId)
    // Use depth=1 for lazy loading - fetch only top-level comments initially
    // Users can expand individual threads to load more
    const { story, comments } =
      cachedData || (await fetchStoryWithComments(storyId, 1))
    currentStoryAuthor = story.by // Store for "load more" functionality
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

    // For stories with URLs, we'll show a "Story" tab for article content
    // For Ask HN / text posts, show the text directly
    const hasExternalUrl = !!story.url && !story.url.startsWith('item?id=')
    const commentCount = story.descendants || 0

    // Store comment count for "new comments" tracking
    currentStoryCommentCount = commentCount

    // Calculate reading time for text posts (Ask HN, etc.)
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
        
        <div class="story-tabs">
          <button class="story-tab active" data-tab="story">
            ${icons.article}
            <span>Story</span>
          </button>
          <button class="story-tab" data-tab="comments">
            ${icons.comment}
            <span>Comments${commentCount > 0 ? ` (${commentCount})` : ''}</span>
          </button>
        </div>
        
        <div class="story-tab-content" data-tab-content="story">
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
        
        <div class="story-tab-content hidden" data-tab-content="comments">
          <section class="comments-section">
            <div class="comments-list">
              ${commentsHtml}
            </div>
          </section>
        </div>
      </div>
    `

    // Set up tab switching
    setupStoryTabs(container)

    // Set up comment collapse handlers
    setupCommentCollapse()

    // Apply stagger animation to top-level comments
    const commentsList = container.querySelector('.comments-list')
    if (commentsList) {
      applyStaggerAnimation(commentsList as HTMLElement, ':scope > .comment')
    }

    // If there's an external URL, fetch the article content
    if (hasExternalUrl && story.url) {
      fetchAndDisplayArticle(story.url, container)
    }

    // Set AI assistant context with current story and comments
    setStoryContext(story, comments)

    // Restore scroll position for this story (defer to allow DOM to render)
    requestAnimationFrame(() => {
      const savedPosition = getStoryScrollPosition(storyId)
      if (savedPosition > 0) {
        setScrollTop(savedPosition)
      } else {
        setScrollTop(0)
      }
    })

    // Update assistant visibility for detail view
    updateAssistantZenMode(isZenModeActive(), 'detail')

    // Announce to screen readers
    announce(`Story loaded with ${commentCount} comments`)
  } catch (error) {
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
  } finally {
    isLoading = false
  }
}

async function renderUserProfile(userId: string): Promise<void> {
  if (isLoading) return
  isLoading = true
  currentView = 'user'
  currentUserId = userId

  const container = document.getElementById('stories')
  if (!container) {
    isLoading = false
    return
  }

  // Show skeleton loading state for user profile
  container.innerHTML = renderUserProfileSkeleton()

  try {
    const user = await fetchUser(userId)
    const accountAge = formatAccountAge(user.created)
    const joinDate = new Date(user.created * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    // Fetch initial submissions (stories first)
    const { items: submissions } = await fetchUserSubmissions(
      userId,
      0,
      SUBMISSIONS_PER_PAGE,
      'all',
    )

    const submissionsHtml =
      submissions.length > 0
        ? submissions.map((item) => renderSubmissionItem(item)).join('')
        : '<div class="no-submissions">No submissions yet</div>'

    container.innerHTML = `
      <div class="user-profile">
        <div class="user-profile-header">
          <button class="back-btn" data-action="back" title="Back">
            ${icons.back}
            <span>Back</span>
          </button>
        </div>
        
        <div class="user-card cyber-frame">
          <span class="corner-tr"></span>
          <span class="corner-bl"></span>
          
          <div class="user-identity">
            <div class="user-avatar">${icons.user}</div>
            <div class="user-info">
              <h1 class="user-name">${escapeHtml(user.id)}</h1>
              <div class="user-stats">
                <span class="user-karma">${icons.points}${user.karma.toLocaleString()} karma</span>
                <span class="meta-sep"></span>
                <span class="user-age">${icons.clock}${accountAge}</span>
              </div>
            </div>
          </div>
          
          <div class="user-meta-details">
            <div class="user-joined">Member since ${joinDate}</div>
            ${user.submitted ? `<div class="user-submission-count">${user.submitted.length.toLocaleString()} submissions</div>` : ''}
          </div>
          
          ${
            user.about
              ? `
            <div class="user-about">
              <h2 class="user-about-title">About</h2>
              <div class="user-about-content">${sanitizeHtml(user.about)}</div>
            </div>
          `
              : ''
          }
        </div>
        
        <section class="user-submissions">
          <div class="submissions-header">
            <h2 class="submissions-title">${icons.comment}Recent Activity</h2>
            <div class="submissions-tabs">
              <button class="tab-btn active" data-filter="all">All</button>
              <button class="tab-btn" data-filter="stories">Stories</button>
              <button class="tab-btn" data-filter="comments">Comments</button>
            </div>
          </div>
          <div class="submissions-list" data-user="${escapeHtml(userId)}" data-filter="all" data-offset="${SUBMISSIONS_PER_PAGE}">
            ${submissionsHtml}
          </div>
          ${
            user.submitted && user.submitted.length > SUBMISSIONS_PER_PAGE
              ? `
            <div class="submissions-load-more">
              <button class="load-more-submissions-btn">Load more</button>
            </div>
          `
              : ''
          }
        </section>
      </div>
    `

    // Setup tab switching
    setupUserProfileTabs()

    // Scroll to top
    setScrollTop(0)

    // Announce to screen readers
    announce(`User profile loaded for ${user.id}`)
  } catch (error) {
    const parsed = parseApiError(error)
    container.innerHTML = renderErrorWithRetry(
      parsed,
      'User',
      'retry-user',
      true,
    )
    showErrorToast(error, 'Load user')
    announce('Error loading user profile')
    console.error('Failed to load user:', error)
  } finally {
    isLoading = false
  }
}

function setupUserProfileTabs(): void {
  const container = document.getElementById('stories')
  if (!container) return

  // Tab switching
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const tabBtn = target.closest('.tab-btn') as HTMLElement | null

    if (tabBtn && currentUserId) {
      const filter = tabBtn.dataset.filter as 'all' | 'stories' | 'comments'
      if (!filter) return

      // Update active tab
      container.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn === tabBtn)
      })

      // Reload submissions with new filter
      const listEl = container.querySelector('.submissions-list') as HTMLElement
      if (!listEl) return

      listEl.innerHTML = `
        <div class="loading submissions-loading">
          <div class="loading-spinner"></div>
        </div>
      `

      try {
        const { items } = await fetchUserSubmissions(
          currentUserId,
          0,
          SUBMISSIONS_PER_PAGE,
          filter,
        )
        listEl.dataset.filter = filter
        listEl.dataset.offset = String(SUBMISSIONS_PER_PAGE)

        listEl.innerHTML =
          items.length > 0
            ? items.map((item) => renderSubmissionItem(item)).join('')
            : `<div class="no-submissions">No ${filter === 'all' ? 'submissions' : filter} yet</div>`
      } catch (_error) {
        listEl.innerHTML = '<div class="error">Failed to load submissions</div>'
      }
    }

    // Load more button
    const loadMoreBtn = target.closest(
      '.load-more-submissions-btn',
    ) as HTMLButtonElement | null
    if (loadMoreBtn && currentUserId) {
      const listEl = container.querySelector('.submissions-list') as HTMLElement
      if (!listEl) return

      const filter = (listEl.dataset.filter || 'all') as
        | 'all'
        | 'stories'
        | 'comments'
      const offset = Number(listEl.dataset.offset) || SUBMISSIONS_PER_PAGE

      loadMoreBtn.disabled = true
      loadMoreBtn.textContent = 'Loading...'

      try {
        const { items, hasMore } = await fetchUserSubmissions(
          currentUserId,
          offset,
          SUBMISSIONS_PER_PAGE,
          filter,
        )

        if (items.length > 0) {
          const newHtml = items
            .map((item) => renderSubmissionItem(item))
            .join('')
          listEl.insertAdjacentHTML('beforeend', newHtml)
          listEl.dataset.offset = String(offset + SUBMISSIONS_PER_PAGE)
        }

        if (!hasMore) {
          loadMoreBtn.parentElement?.remove()
        } else {
          loadMoreBtn.disabled = false
          loadMoreBtn.textContent = 'Load more'
        }
      } catch (_error) {
        loadMoreBtn.disabled = false
        loadMoreBtn.textContent = 'Failed. Retry?'
      }
    }
  })
}

function setupCommentCollapse(): void {
  const container = document.getElementById('stories')
  if (!container) return

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
      // Icon rotation is handled by CSS based on data-collapsed state
      collapseBtn.title = isCollapsed ? 'Collapse' : 'Expand'
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
      const skeletonCount = Math.min(replyCount, 3) // Show up to 3 skeletons
      loadMoreContainer.innerHTML = renderCommentSkeletons(skeletonCount)
      loadMoreContainer.classList.add('loading')

      try {
        // Use depth=1 for lazy loading - only load immediate children
        // Each child will have its own "load more" button if it has kids
        const children = await fetchCommentChildren(parentId, 1)

        if (children.length > 0) {
          // Render the new comments
          const newCommentsHtml = children
            .map((c) => renderComment(c, depth, currentStoryAuthor))
            .join('')

          // Find the parent comment and add children container
          const parentComment = container.querySelector(
            `.comment[data-id="${parentId}"]`,
          ) as HTMLElement | null

          if (parentComment) {
            // Check if children container exists, if not create it
            let childrenContainer =
              parentComment.querySelector('.comment-children')
            if (!childrenContainer) {
              childrenContainer = document.createElement('div')
              childrenContainer.className = 'comment-children'
              parentComment.appendChild(childrenContainer)
            }

            // Add new comments
            childrenContainer.insertAdjacentHTML('beforeend', newCommentsHtml)

            // Remove the "load more" button
            loadMoreContainer.remove()

            // Update the reply count in the parent's meta
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
        // Restore the button on error
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

function setupKeyboardNavigation(): void {
  setKeyboardCallbacks({
    onSelect: (index) => {
      if (currentView === 'list' && currentStories[index]) {
        const storyId = currentStories[index].id
        // Find the selected story card element for contextual animation
        const storyCards = document.querySelectorAll('.story-card')
        const clickedEl = storyCards[index] as HTMLElement | undefined
        // Call renderStoryDetail directly with element for animation
        // then update hash (renderStoryDetail sets isLoading, preventing double render)
        renderStoryDetail(storyId, clickedEl)
        window.location.hash = `item/${storyId}`
      }
    },
    onOpenExternal: (index) => {
      if (currentView === 'list' && currentStories[index]) {
        const story = currentStories[index]
        if (story.url) {
          window.open(story.url, '_blank', 'noopener')
        } else {
          toastInfo('No external link for this story')
        }
      }
    },
    onBack: () => {
      // Priority: Close modals/panels first, then exit zen mode, then navigate back
      // This ensures modals can be closed while in zen mode without exiting zen
      if (isSettingsModalOpen()) {
        closeSettingsModal()
      } else if (isSearchModalOpen()) {
        closeSearchModal()
      } else if (isHelpModalOpen()) {
        closeHelpModal()
      } else if (isAssistantOpen()) {
        closeAssistant()
      } else if (isZenModeActive()) {
        exitZenMode()
      } else if (currentView === 'detail') {
        navigateBackToList()
      }
    },
    onRefresh: () => {
      if (currentView === 'list') {
        renderStories(currentFeed)
      } else if (currentView === 'detail' && currentStoryId) {
        // Refresh the current story
        renderStoryDetail(currentStoryId)
      }
    },
    onFeedChange: (feed) => {
      if (currentView === 'list' && feed !== currentFeed) {
        currentFeed = feed
        // Update active nav button
        document.querySelectorAll('[data-feed]').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-feed') === feed)
        })
        renderStories(feed)
      }
    },
    onHelp: () => {
      if (isHelpModalOpen()) {
        closeHelpModal()
      } else {
        showHelpModal()
      }
    },
    onScrollToTop: () => {
      scrollToTop()
    },
    onSearch: () => {
      if (isSearchModalOpen()) {
        closeSearchModal()
      } else {
        showSearchModal()
      }
    },
    onFocusComments: () => {
      // Only works in detail view - scroll to comments section
      if (currentView !== 'detail') return

      const commentsSection = document.querySelector('.comments-section')
      if (commentsSection) {
        commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })

        // Focus the first comment for keyboard navigation
        const firstComment = document.querySelector(
          '.comment[data-depth="0"]',
        ) as HTMLElement
        if (firstComment) {
          firstComment.focus()
          firstComment.classList.add('keyboard-selected')
        }
      }
    },
    onZenMode: () => {
      toggleZenMode()
    },
    onBackToList: () => {
      // Navigate back to list without exiting zen mode
      if (currentView === 'detail') {
        navigateBackToList()
      }
    },
    onToggleTheme: () => {
      toggleTheme()
    },
    onQuit: async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const appWindow = getCurrentWindow()
        await appWindow.close()
      } catch {
        // Not in Tauri environment, ignore
      }
    },
  })

  initKeyboard()
}

function setupNavigation(): void {
  const nav = document.getElementById('nav')
  if (!nav) return

  nav.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const feedBtn = target.closest('[data-feed]') as HTMLElement | null
    if (!feedBtn) return

    const feed = feedBtn.dataset.feed as StoryFeed
    if (feed === currentFeed && currentView === 'list') return

    document.querySelectorAll('[data-feed]').forEach((btn) => {
      btn.classList.remove('active')
      btn.setAttribute('aria-pressed', 'false')
    })
    feedBtn.classList.add('active')
    feedBtn.setAttribute('aria-pressed', 'true')

    currentFeed = feed
    currentView = 'list'
    window.location.hash = ''
    renderStories(feed)
  })

  // Handle back button clicks - use animated transition
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const backBtn = target.closest('[data-action="back"]')
    if (backBtn) {
      e.preventDefault()
      navigateBackToList()
    }
  })

  // Handle retry button clicks for error recovery
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const retryBtn = target.closest(
      '[data-action^="retry-"]',
    ) as HTMLElement | null
    if (retryBtn) {
      e.preventDefault()
      const action = retryBtn.dataset.action
      if (action === 'retry-stories') {
        renderStories(currentFeed)
      } else if (action === 'retry-story' && currentStoryId) {
        renderStoryDetail(currentStoryId)
      } else if (action === 'retry-user' && currentUserId) {
        renderUserProfile(currentUserId)
      }
    }
  })

  // Handle share/copy action buttons in story detail
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const actionBtn = target.closest('[data-action]') as HTMLElement | null
    if (!actionBtn) return

    const action = actionBtn.dataset.action

    if (action === 'copy-hn-link') {
      e.preventDefault()
      const id = actionBtn.dataset.id
      if (id) {
        const hnUrl = `https://news.ycombinator.com/item?id=${id}`
        try {
          await navigator.clipboard.writeText(hnUrl)
          toastSuccess('HN link copied to clipboard')
        } catch {
          toastError('Failed to copy link')
        }
      }
    } else if (action === 'copy-article-link') {
      e.preventDefault()
      const url = actionBtn.dataset.url
      if (url) {
        try {
          await navigator.clipboard.writeText(url)
          toastSuccess('Article link copied to clipboard')
        } catch {
          toastError('Failed to copy link')
        }
      }
    } else if (action === 'share') {
      e.preventDefault()
      const id = actionBtn.dataset.id
      const title = actionBtn.dataset.title || 'Hacker News Story'
      const articleUrl = actionBtn.dataset.url
      const hnUrl = `https://news.ycombinator.com/item?id=${id}`

      // Use Web Share API if available
      if (navigator.share) {
        try {
          await navigator.share({
            title: title,
            text: `${title} - Hacker News`,
            url: articleUrl || hnUrl,
          })
        } catch (err) {
          // User cancelled or share failed - ignore AbortError
          if (err instanceof Error && err.name !== 'AbortError') {
            toastError('Failed to share')
          }
        }
      } else {
        // Fallback: copy HN link to clipboard
        try {
          await navigator.clipboard.writeText(hnUrl)
          toastSuccess('Link copied to clipboard (share not available)')
        } catch {
          toastError('Failed to copy link')
        }
      }
    }
  })

  // Handle comment link clicks in story list
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const link = target.closest('a[href^="#item/"]') as HTMLAnchorElement | null
    if (link) {
      e.preventDefault()
      const match = link.href.match(/#item\/(\d+)/)
      if (match) {
        const storyId = Number.parseInt(match[1], 10)
        // Find the parent story card if we're clicking the comments link
        const storyCard = link.closest('.story[data-id]') as HTMLElement | null
        renderStoryDetail(storyId, storyCard || undefined)
        window.location.hash = `item/${storyId}`
      }
    }
  })

  // Handle user link clicks
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const link = target.closest('a[href^="#user/"]') as HTMLAnchorElement | null
    if (link) {
      e.preventDefault()
      const match = link.href.match(/#user\/(.+)/)
      if (match) {
        const userId = decodeURIComponent(match[1])
        window.location.hash = `user/${encodeURIComponent(userId)}`
      }
    }
  })

  // Handle story card clicks (navigate to detail view with animation)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    // Don't handle if clicking on a link, button, or interactive element
    if (target.closest('a, button, .vote-btn')) return

    const storyCard = target.closest('.story[data-id]') as HTMLElement | null
    if (storyCard && currentView === 'list') {
      const storyId = storyCard.dataset.id
      if (storyId) {
        // Use animated transition with the clicked card
        renderStoryDetail(Number.parseInt(storyId, 10), storyCard)
        window.location.hash = `item/${storyId}`
      }
    }
  })
}

function setupThemeToggle(): void {
  const toggle = document.getElementById('theme-toggle')
  if (!toggle) return

  toggle.addEventListener('click', () => {
    toggleTheme()
  })
}

function setupSettingsToggle(): void {
  const toggle = document.getElementById('settings-toggle')
  if (!toggle) return

  toggle.addEventListener('click', () => {
    showSettingsModal()
  })
}

function handleHashChange(): void {
  const hash = window.location.hash
  const itemMatch = hash.match(/^#item\/(\d+)$/)
  const userMatch = hash.match(/^#user\/(.+)$/)

  if (itemMatch) {
    const storyId = Number.parseInt(itemMatch[1], 10)
    renderStoryDetail(storyId)
  } else if (userMatch) {
    const userId = decodeURIComponent(userMatch[1])
    renderUserProfile(userId)
  } else if (currentView === 'detail' || currentView === 'user') {
    // Going back to list
    currentView = 'list'
    renderStories(currentFeed)
  }
}

async function main(): Promise<void> {
  // Initialize settings first to prevent flash of wrong theme
  // Note: initSettings() handles theme initialization via applySettings()
  // We don't call initTheme() separately to avoid duplicate system theme listeners
  initSettings()

  // Ensure window decorations are visible on startup (safety net)
  // The window-state plugin is configured to NOT save decoration state,
  // but we call this as a fallback in case of any edge cases
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const appWindow = getCurrentWindow()
    await appWindow.setDecorations(true)
  } catch {
    // Not in Tauri environment
  }

  // Load cached read stories
  readStoryIds = getReadStoryIds()

  // Use default feed from settings
  const settings = getSettings()
  currentFeed = settings.defaultFeed

  try {
    await init()
    setupNavigation()
    setupThemeToggle()
    setupSettingsToggle()
    setupKeyboardNavigation()

    // Configure and setup pull-to-refresh
    configurePullRefresh({
      onRefresh: handlePullRefresh,
      getScrollTop: getScrollTop,
      canRefresh: () => currentView === 'list' && !isZenModeTransitioning(),
      isLoading: () => isLoading,
    })
    setupPullToRefresh()

    // Initialize AI assistant (conditionally enabled if Copilot available)
    initAssistant()

    // Set up zen mode callback for virtual scroll re-render and assistant updates
    setZenModeChangeCallback((isActive) => {
      // Update assistant visibility
      updateAssistantZenMode(isActive, currentView)
      // Force virtual scroll to re-render with new styling
      if (virtualScroll) {
        requestAnimationFrame(() => {
          virtualScroll?.forceRender()
        })
      }
    })

    // Update nav to show correct default feed as active
    document.querySelectorAll('[data-feed]').forEach((btn) => {
      btn.classList.toggle(
        'active',
        btn.getAttribute('data-feed') === currentFeed,
      )
    })

    // Handle hash routing
    window.addEventListener('hashchange', handleHashChange)

    // Handle reading history cleared event from settings
    window.addEventListener('reading-history-cleared', () => {
      readStoryIds.clear()
      // Re-render stories if on list view to update read indicators
      if (currentView === 'list') {
        const container = document.getElementById('stories')
        if (container) {
          // Just update the read state classes without full re-render
          container.querySelectorAll('.story').forEach((storyEl) => {
            storyEl.classList.remove('story-read')
          })
        }
      }
    })

    // Set up scroll position saving, header shadow, and back to top
    // Listen on the main scroll container instead of window
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.addEventListener(
        'scroll',
        () => {
          saveScrollPositionDebounced()
          updateHeaderShadow()
          updateBackToTopVisibility()
        },
        { passive: true },
      )
    }

    // Set up back to top button
    configureBackToTop({
      setScrollTop: setScrollTop,
      getScrollTop: getScrollTop,
    })
    setupBackToTop()

    // Check initial hash
    const hash = window.location.hash
    const itemMatch = hash.match(/^#item\/(\d+)$/)

    if (itemMatch) {
      const storyId = Number.parseInt(itemMatch[1], 10)
      await renderStoryDetail(storyId)
    } else {
      await renderStories(currentFeed)
    }
  } catch (error) {
    console.error('Failed to initialize:', error)
    const container = document.getElementById('stories')
    if (container) {
      container.innerHTML = `
        <div class="error">
          <span class="error-icon">⚠</span>
          <span>Failed to initialize. Please refresh the page.</span>
        </div>
      `
    }
  }
}

main()

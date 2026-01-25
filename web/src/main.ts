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
  type SearchFilter,
  type SearchResult,
  type SearchSort,
  searchHN,
} from './api'
import {
  initKeyboard,
  KEYBOARD_SHORTCUTS,
  resetSelection,
  setKeyboardCallbacks,
} from './keyboard'
import {
  closeSettingsModal,
  getSettings,
  initSettings,
  isSettingsModalOpen,
  showSettingsModal,
} from './settings'
import {
  clearFeedScrollPosition,
  getFeedScrollPosition,
  getReadStoryIds,
  getStoryScrollPosition,
  markStoryAsRead,
  saveFeedScrollPosition,
  saveStoryScrollPosition,
} from './storage'
import { initTheme, toggleTheme } from './theme'
import { toastError, toastInfo, toastSuccess } from './toast'
import {
  type CommentWithChildren,
  type HNItem,
  ItemType,
  type StoryFeed,
} from './types'
import { VirtualScroll } from './virtual-scroll'
import './styles/main.css'

let currentFeed: StoryFeed = 'top'
let isLoading = false
let isLoadingMore = false
let currentView: 'list' | 'detail' | 'user' = 'list'
let currentStories: HNItem[] = []
let helpModalOpen = false
let currentOffset = 0
let hasMoreStories = true
let currentStoryAuthor: string | null = null // Track OP for comment highlighting
let currentStoryId: number | null = null // Track current story for scroll position
let currentUserId: string | null = null // Track current user profile
let readStoryIds: Set<number> = new Set() // Cache of read stories
const STORIES_PER_PAGE = 30
const SUBMISSIONS_PER_PAGE = 20

// Animation duration constants
const TRANSITION_DURATION = 350 // ms - matches CSS animation duration

/**
 * Error types for user-friendly messages
 */
type ApiErrorType = 'rate_limited' | 'not_found' | 'network' | 'unknown'

interface ParsedError {
  type: ApiErrorType
  message: string
  retryAfter?: number
}

/**
 * Parse error message from API to determine error type and user-friendly message
 */
function parseApiError(error: unknown): ParsedError {
  const errorStr = String(error)

  // Check for rate limiting
  const rateLimitMatch = errorStr.match(
    /Rate limited, retry after (\d+) seconds/,
  )
  if (rateLimitMatch) {
    const retryAfter = Number.parseInt(rateLimitMatch[1], 10)
    return {
      type: 'rate_limited',
      message: `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
      retryAfter,
    }
  }

  // Check for not found errors
  if (errorStr.includes('not found') || errorStr.includes('NotFound')) {
    return {
      type: 'not_found',
      message: 'The requested content was not found.',
    }
  }

  // Check for network errors
  if (
    errorStr.includes('network') ||
    errorStr.includes('fetch') ||
    errorStr.includes('Failed to fetch') ||
    errorStr.includes('NetworkError')
  ) {
    return {
      type: 'network',
      message: 'Network error. Check your connection and try again.',
    }
  }

  // Default unknown error
  return {
    type: 'unknown',
    message: 'An unexpected error occurred. Please try again.',
  }
}

/**
 * Show appropriate toast for an API error
 */
function showErrorToast(error: unknown, context: string): void {
  const parsed = parseApiError(error)

  if (parsed.type === 'rate_limited') {
    toastError(`Rate limited: ${context}. Try again in ${parsed.retryAfter}s.`)
  } else if (parsed.type === 'not_found') {
    toastError(`${context} not found.`)
  } else if (parsed.type === 'network') {
    toastError(`Network error: ${context}. Check your connection.`)
  } else {
    toastError(`Failed to ${context.toLowerCase()}.`)
  }
}

/**
 * Calculate estimated reading time from word count
 * Average reading speed: ~200-250 words per minute
 * Using 200 wpm for comfortable reading
 */
function calculateReadingTime(wordCount: number): string {
  if (wordCount <= 0) return ''
  const minutes = Math.ceil(wordCount / 200)
  if (minutes < 1) return 'less than 1 min read'
  if (minutes === 1) return '1 min read'
  return `${minutes} min read`
}

/**
 * Count words in text (strips HTML tags first)
 */
function countWords(text: string): number {
  if (!text) return 0
  // Strip HTML tags
  const plainText = text.replace(/<[^>]*>/g, ' ')
  // Split by whitespace and filter empty strings
  const words = plainText.split(/\s+/).filter((word) => word.length > 0)
  return words.length
}

/**
 * Check if user prefers reduced motion
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animate stories away from clicked story (contextual open animation)
 * - Stories above the clicked one slide up
 * - Stories below the clicked one slide down
 * - Clicked story fades out
 */
async function animateStoriesAway(clickedStoryEl: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return

  const container = document.getElementById('stories')
  if (!container) return

  const allStories = Array.from(container.querySelectorAll('.story'))
  const clickedIndex = allStories.indexOf(clickedStoryEl)

  if (clickedIndex === -1) return

  // Apply animations to each story based on position relative to clicked
  allStories.forEach((story, index) => {
    const el = story as HTMLElement
    el.classList.add('view-transition')

    if (index < clickedIndex) {
      // Stories above: slide up
      el.classList.add('view-exit-up')
    } else if (index > clickedIndex) {
      // Stories below: slide down
      el.classList.add('view-exit-down')
    } else {
      // Clicked story: fade out in place
      el.classList.add('view-anchor-fade')
    }
  })

  // Wait for animation to complete
  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION))
}

/**
 * Animate detail view entering
 */
async function animateDetailEnter(container: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return

  container.classList.add('view-transition', 'view-enter-from-bottom')
  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION))
  container.classList.remove('view-transition', 'view-enter-from-bottom')
}

/**
 * Animate detail view exiting (going back to list)
 */
async function animateDetailExit(container: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return

  container.classList.add('view-transition', 'view-fade-out')
  await new Promise((resolve) => setTimeout(resolve, 200))
  container.classList.remove('view-transition', 'view-fade-out')
}

/**
 * Animate list view entering (coming back from detail)
 */
async function animateListEnter(container: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return

  container.classList.add('view-transition', 'view-enter-from-top')
  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION))
  container.classList.remove('view-transition', 'view-enter-from-top')
}

/**
 * Navigate back to list view with animation
 */
async function navigateBackToList(): Promise<void> {
  const container = document.getElementById('stories')
  if (!container) return

  // Animate detail view exiting
  await animateDetailExit(container)

  // Update state and render list with animation
  currentView = 'list'
  window.location.hash = ''
  await renderStories(currentFeed, false, true)
}

function applyStaggerAnimation(container: HTMLElement, selector: string): void {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  if (prefersReducedMotion) return

  const items = container.querySelectorAll(selector)
  items.forEach((item, index) => {
    if (index < 10) {
      // Only stagger first 10
      item.classList.add('stagger-in')
    }
  })
}

// Virtual scroll configuration
const STORY_ITEM_HEIGHT = 95 // Estimated height of each story item in pixels
const VIRTUAL_SCROLL_THRESHOLD = 100 // Use virtual scroll when list exceeds this
let virtualScroll: VirtualScroll<HNItem> | null = null

// Search modal state
let searchModalOpen = false
let searchQuery = ''
let searchResults: SearchResult[] = []
let searchSort: SearchSort = 'relevance'
let searchFilter: SearchFilter = 'all'
let searchPage = 0
let searchTotalPages = 0
let searchTotalHits = 0
let isSearching = false
let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null

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

// Back to top button
let backToTopBtn: HTMLButtonElement | null = null
const BACK_TO_TOP_THRESHOLD = 400 // Show button after scrolling this much

function setupBackToTop(): void {
  // Create the button
  backToTopBtn = document.createElement('button')
  backToTopBtn.className = 'back-to-top'
  backToTopBtn.title = 'Back to top (t)'
  backToTopBtn.innerHTML = `
    <svg viewBox="0 0 24 24">
      <polyline points="18 15 12 9 6 15"/>
    </svg>
  `

  document.body.appendChild(backToTopBtn)

  // Click handler
  backToTopBtn.addEventListener('click', scrollToTop)
}

function scrollToTop(): void {
  setScrollTop(0, 'smooth')
}

function updateBackToTopVisibility(): void {
  if (!backToTopBtn) return

  if (getScrollTop() > BACK_TO_TOP_THRESHOLD) {
    backToTopBtn.classList.add('visible')
  } else {
    backToTopBtn.classList.remove('visible')
  }
}

// Pull-to-refresh state
let pullStartY = 0
let pullDistance = 0
let isPulling = false
let pullRefreshEnabled = true
const PULL_THRESHOLD = 80 // Distance needed to trigger refresh

function setupPullToRefresh(): void {
  const indicator = document.createElement('div')
  indicator.className = 'pull-refresh-indicator'
  indicator.innerHTML = `
    <div class="pull-refresh-content">
      <div class="pull-refresh-spinner"></div>
      <span class="pull-refresh-text">Pull to refresh</span>
    </div>
  `
  document.body.prepend(indicator)

  let touchStartY = 0

  // Touch events for mobile
  document.addEventListener(
    'touchstart',
    (e) => {
      if (getScrollTop() === 0 && currentView === 'list' && !isLoading) {
        touchStartY = e.touches[0].clientY
        pullStartY = touchStartY
        isPulling = true
      }
    },
    { passive: true },
  )

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!isPulling || getScrollTop() > 0) {
        isPulling = false
        updatePullIndicator(0)
        return
      }

      const touchY = e.touches[0].clientY
      pullDistance = Math.max(0, touchY - pullStartY)

      if (pullDistance > 0) {
        updatePullIndicator(pullDistance)
      }
    },
    { passive: true },
  )

  document.addEventListener('touchend', () => {
    if (isPulling && pullDistance >= PULL_THRESHOLD && !isLoading) {
      triggerRefresh()
    }
    isPulling = false
    pullDistance = 0
    updatePullIndicator(0)
  })

  // Mouse wheel for desktop (overscroll at top)
  let wheelDeltaAccumulator = 0
  let wheelResetTimeout: ReturnType<typeof setTimeout> | null = null

  document.addEventListener(
    'wheel',
    (e) => {
      // Only trigger if at top of page, scrolling up, and in list view
      if (
        getScrollTop() === 0 &&
        e.deltaY < 0 &&
        currentView === 'list' &&
        !isLoading
      ) {
        wheelDeltaAccumulator += Math.abs(e.deltaY)

        // Reset accumulator after a pause in scrolling
        if (wheelResetTimeout) clearTimeout(wheelResetTimeout)
        wheelResetTimeout = setTimeout(() => {
          wheelDeltaAccumulator = 0
          updatePullIndicator(0)
        }, 300)

        // Show visual feedback
        const progress = Math.min(
          wheelDeltaAccumulator / 2,
          PULL_THRESHOLD * 1.5,
        )
        updatePullIndicator(progress)

        // Trigger refresh if threshold met
        if (wheelDeltaAccumulator > PULL_THRESHOLD * 2 && pullRefreshEnabled) {
          pullRefreshEnabled = false
          wheelDeltaAccumulator = 0
          triggerRefresh()

          // Re-enable after a delay to prevent rapid refreshes
          setTimeout(() => {
            pullRefreshEnabled = true
          }, 1000)
        }
      }
    },
    { passive: true },
  )
}

function updatePullIndicator(distance: number): void {
  const indicator = document.querySelector(
    '.pull-refresh-indicator',
  ) as HTMLElement
  if (!indicator) return

  const progress = Math.min(distance / PULL_THRESHOLD, 1.5)
  const translateY = Math.min(distance * 0.5, 60) - 60 // Start hidden above

  indicator.style.transform = `translateY(${translateY}px)`
  indicator.style.opacity = String(Math.min(progress, 1))

  const text = indicator.querySelector('.pull-refresh-text')
  const spinner = indicator.querySelector(
    '.pull-refresh-spinner',
  ) as HTMLElement

  if (text && spinner) {
    if (isLoading) {
      text.textContent = 'Refreshing...'
      spinner.classList.add('spinning')
    } else if (progress >= 1) {
      text.textContent = 'Release to refresh'
      spinner.classList.remove('spinning')
    } else {
      text.textContent = 'Pull to refresh'
      spinner.classList.remove('spinning')
    }
  }
}

async function triggerRefresh(): Promise<void> {
  updatePullIndicator(PULL_THRESHOLD) // Show loading state

  if (currentView === 'list') {
    await renderStories(currentFeed, true)
    toastSuccess('Feed refreshed')
  }

  // Hide indicator after refresh completes
  setTimeout(() => {
    updatePullIndicator(0)
  }, 300)
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
  }

  // Load read stories cache
  readStoryIds = getReadStoryIds()

  const container = document.getElementById('stories')
  if (!container) return

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
    const errorMessage =
      parsed.type === 'rate_limited'
        ? `Too many requests. Please wait ${parsed.retryAfter} seconds.`
        : 'Failed to load stories. Please try again.'
    container.innerHTML = `
      <div class="error" role="alert">
        <span class="error-icon" aria-hidden="true">⚠</span>
        <span>${errorMessage}</span>
      </div>
    `
    showErrorToast(error, 'Load stories')
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
    stories.map((story, idx) => renderStory(story, idx + 1)).join('') +
    renderLoadMoreIndicator()

  // Apply stagger animation to stories
  applyStaggerAnimation(container, '.story')

  // Setup infinite scroll observer
  setupInfiniteScroll()
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
    renderItem: (story, index) => renderStory(story, index + 1),
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
        .map((story, idx) => renderStory(story, startRank + idx))
        .join('')

      container.insertAdjacentHTML('beforeend', newStoriesHtml)
      container.insertAdjacentHTML('beforeend', renderLoadMoreIndicator())

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
;(window as unknown as { retryLoadMore: () => void }).retryLoadMore =
  loadMoreStories

function renderLoadMoreIndicator(): string {
  if (!hasMoreStories) {
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

// Line-only SVG icons
const icons = {
  upvote: `<svg viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15"/></svg>`,
  points: `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  comment: `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  back: `<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  link: `<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  collapse: `<svg viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>`,
  expand: `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  sort: `<svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>`,
  externalLink: `<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  document: `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  article: `<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="12" y2="15"/></svg>`,
  book: `<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
}

// ===== SKELETON LOADING COMPONENTS =====

/**
 * Render a skeleton story item for loading state
 */
function renderStorySkeleton(index: number): string {
  const titleClass = index % 3 === 2 ? 'skeleton-title-short' : ''
  return `
    <div class="story-skeleton">
      <div class="skeleton-rank skeleton"></div>
      <div class="skeleton-vote skeleton"></div>
      <div class="skeleton-content">
        <div class="skeleton-title skeleton ${titleClass}"></div>
        <div class="skeleton-meta">
          <div class="skeleton-meta-item skeleton"></div>
          <div class="skeleton-meta-item skeleton wide"></div>
          <div class="skeleton-meta-item skeleton"></div>
          <div class="skeleton-meta-item skeleton narrow"></div>
        </div>
      </div>
    </div>
  `
}

/**
 * Render multiple skeleton stories for loading state
 */
function renderStorySkeletons(count = 6): string {
  return Array.from({ length: count }, (_, i) => renderStorySkeleton(i)).join(
    '',
  )
}

/**
 * Render a skeleton comment for loading state
 */
function renderCommentSkeleton(depth = 0): string {
  return `
    <div class="comment-skeleton" style="--depth: ${depth}">
      <div class="skeleton-indent"></div>
      <div class="skeleton-comment-body">
        <div class="skeleton-comment-meta">
          <div class="skeleton-author skeleton"></div>
          <div class="skeleton-time skeleton"></div>
        </div>
        <div class="skeleton-comment-text">
          <div class="skeleton-text-line skeleton"></div>
          <div class="skeleton-text-line skeleton"></div>
          <div class="skeleton-text-line skeleton"></div>
        </div>
      </div>
    </div>
  `
}

/**
 * Render multiple skeleton comments for loading state
 */
function renderCommentSkeletons(count = 5): string {
  // Create varied depths for visual interest
  const depths = [0, 0, 1, 1, 2]
  return Array.from({ length: count }, (_, i) =>
    renderCommentSkeleton(depths[i % depths.length]),
  ).join('')
}

/**
 * Render skeleton for user profile card
 */
function renderUserProfileSkeleton(): string {
  return `
    <div class="user-profile">
      <div class="user-profile-header">
        <button class="back-btn" data-action="back" title="Back" disabled>
          ${icons.back}
          <span>Back</span>
        </button>
      </div>
      
      <div class="user-card cyber-frame user-skeleton">
        <span class="corner-tr"></span>
        <span class="corner-bl"></span>
        
        <div class="user-identity">
          <div class="skeleton-avatar skeleton"></div>
          <div class="user-info">
            <div class="skeleton-user-name skeleton" style="margin-bottom: 0.5rem;"></div>
            <div class="skeleton-user-stats">
              <div class="skeleton-stat skeleton"></div>
              <div class="skeleton-stat skeleton"></div>
            </div>
          </div>
        </div>
        
        <div class="user-meta-details">
          <div class="skeleton-meta-item skeleton wide"></div>
        </div>
      </div>
      
      <section class="user-submissions">
        <div class="submissions-header">
          <div class="skeleton skeleton-meta-item wide" style="height: 1.1rem;"></div>
        </div>
        <div class="submissions-list">
          ${renderStorySkeletons(3)}
        </div>
      </section>
    </div>
  `
}

// Determine story type from title
function getStoryType(title: string | null): 'ask' | 'show' | null {
  if (!title) return null
  const lowerTitle = title.toLowerCase()
  if (lowerTitle.startsWith('ask hn:') || lowerTitle.startsWith('ask hn –'))
    return 'ask'
  if (lowerTitle.startsWith('show hn:') || lowerTitle.startsWith('show hn –'))
    return 'show'
  return null
}

// Determine score heat level for glow effect
function getScoreHeat(score: number): string {
  if (score >= 500) return 'fire'
  if (score >= 200) return 'hot'
  if (score >= 100) return 'warm'
  return ''
}

function renderStory(story: HNItem, rank: number): string {
  const domain = extractDomain(story.url)
  const timeAgo = formatTimeAgo(story.time)
  const storyType =
    story.type === ItemType.Job ? 'job' : getStoryType(story.title)
  const scoreHeat = getScoreHeat(story.score)
  const isRead = readStoryIds.has(story.id)

  const typeAttr = storyType ? ` data-type="${storyType}"` : ''
  const heatAttr = scoreHeat ? ` data-heat="${scoreHeat}"` : ''
  const readClass = isRead ? ' story-read' : ''
  const readStatus = isRead ? 'Previously read. ' : ''

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
          <span class="story-score"${heatAttr}>${icons.points}${story.score} points</span>
          <span class="meta-sep"></span>
          <span class="story-by">${icons.user}<a href="#user/${encodeURIComponent(story.by || 'unknown')}" class="user-link">${escapeHtml(story.by || 'unknown')}</a></span>
          <span class="meta-sep"></span>
          <span class="story-time">${icons.clock}${timeAgo}</span>
          <span class="meta-sep"></span>
          <span class="story-comments">
            <a href="#item/${story.id}" aria-label="${story.descendants || 0} comments">${icons.comment}${story.descendants || 0} comments</a>
          </span>
        </div>
      </div>
    </article>
  `
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Sanitize HTML content from HN API (comments/about text)
// HN uses a limited subset of HTML: <p>, <a>, <pre>, <code>, <i>
function sanitizeHtml(html: string | null): string {
  if (!html) return ''
  // HN uses <p> for paragraphs, we need to preserve that
  // Basic sanitization - allow safe tags only
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}

function renderComment(
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
      <div class="comment-load-more" data-parent-id="${comment.id}" data-depth="${depth + 1}">
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
          ${hasChildren ? `<span class="meta-sep"></span><span class="comment-replies">${childCount} ${childCount === 1 ? 'reply' : 'replies'}</span>` : ''}
          ${hasUnfetchedChildren ? `<span class="meta-sep"></span><span class="comment-replies comment-replies-unfetched">${totalKids} ${totalKids === 1 ? 'reply' : 'replies'}</span>` : ''}
        </div>
        <div class="comment-text">${sanitizeHtml(comment.text)}</div>
        <div class="comment-collapsed-info">
          <span class="comment-author${isOp ? ' comment-author-op' : ''}">${escapeHtml(comment.by || 'unknown')}</span>
          <span class="meta-sep"></span>
          ${hasChildren || hasUnfetchedChildren ? `<span>${(childCount || totalKids) + 1} comments collapsed</span>` : '<span>collapsed</span>'}
        </div>
      </div>
      ${hasChildren ? `<div class="comment-children">${childrenHtml}</div>` : ''}
      ${loadMoreHtml}
    </div>
  `
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
      const readingTime = article.wordCount ? calculateReadingTime(article.wordCount) : ''
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
  if (!container) return

  // Animate stories away if we have a clicked element
  if (clickedStoryEl) {
    await animateStoriesAway(clickedStoryEl)
  }

  // Show skeleton loading state for story detail
  container.innerHTML = `
    <div class="story-detail">
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
    const { story, comments } = await fetchStoryWithComments(storyId, 3)
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

    // Calculate reading time for text posts (Ask HN, etc.)
    const textWordCount = story.text ? countWords(story.text) : 0
    const textReadingTime = textWordCount > 0 ? calculateReadingTime(textWordCount) : ''

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
                <div class="skeleton skeleton-title" style="height: 1.5rem; width: 60%; margin-bottom: 1rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.5rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 100%; margin-bottom: 0.5rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 90%; margin-bottom: 0.5rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 95%; margin-bottom: 0.5rem;"></div>
                <div class="skeleton" style="height: 1rem; width: 80%;"></div>
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

    // Restore scroll position for this story (defer to allow DOM to render)
    requestAnimationFrame(() => {
      const savedPosition = getStoryScrollPosition(storyId)
      if (savedPosition > 0) {
        setScrollTop(savedPosition)
      } else {
        setScrollTop(0)
      }
    })
  } catch (error) {
    const parsed = parseApiError(error)
    const errorMessage =
      parsed.type === 'rate_limited'
        ? `Too many requests. Please wait ${parsed.retryAfter} seconds.`
        : parsed.type === 'not_found'
          ? 'Story not found. It may have been deleted.'
          : 'Failed to load story. Please try again.'
    container.innerHTML = `
      <div class="error">
        <span class="error-icon">⚠</span>
        <span>${errorMessage}</span>
      </div>
      <button class="back-btn" data-action="back" style="margin: 2rem auto; display: flex;">
        ${icons.back}
        <span>Back to stories</span>
      </button>
    `
    showErrorToast(error, 'Load story')
    console.error('Failed to load story:', error)
  } finally {
    isLoading = false
  }
}

// Format account age
function formatAccountAge(created: number): string {
  const seconds = Math.floor(Date.now() / 1000 - created)
  const days = Math.floor(seconds / 86400)
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)

  if (years > 0) {
    return months > 0 ? `${years}y ${months}mo` : `${years} years`
  }
  if (months > 0) {
    return `${months} months`
  }
  return `${days} days`
}

// Render a submission item (story or comment) for user profile
function renderSubmissionItem(item: HNItem): string {
  const timeAgo = formatTimeAgo(item.time)

  if (item.type === 1) {
    // Comment
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
  const isJob = item.type === 2

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

async function renderUserProfile(userId: string): Promise<void> {
  if (isLoading) return
  isLoading = true
  currentView = 'user'
  currentUserId = userId

  const container = document.getElementById('stories')
  if (!container) return

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
              <h3 class="user-about-title">About</h3>
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
  } catch (error) {
    const parsed = parseApiError(error)
    const errorMessage =
      parsed.type === 'rate_limited'
        ? `Too many requests. Please wait ${parsed.retryAfter} seconds.`
        : parsed.type === 'not_found'
          ? 'User not found. The account may not exist.'
          : 'Failed to load user profile. Please try again.'
    container.innerHTML = `
      <div class="error">
        <span class="error-icon">⚠</span>
        <span>${errorMessage}</span>
      </div>
      <button class="back-btn" data-action="back" style="margin: 2rem auto; display: flex;">
        ${icons.back}
        <span>Back</span>
      </button>
    `
    showErrorToast(error, 'Load user')
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
      collapseBtn.innerHTML = isCollapsed ? icons.collapse : icons.expand
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

      // Show loading state
      loadMoreBtn.disabled = true
      loadMoreBtn.innerHTML = `
        <div class="loading-spinner small"></div>
        <span>Loading...</span>
      `

      try {
        const children = await fetchCommentChildren(parentId, 2)

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
        loadMoreBtn.disabled = false
        loadMoreBtn.innerHTML = `
          ${icons.expand}
          <span>Failed to load. Retry?</span>
        `
      }
    }
  })
}

function showHelpModal(): void {
  if (helpModalOpen) return
  helpModalOpen = true

  const modal = document.createElement('div')
  modal.className = 'help-modal-overlay'
  modal.innerHTML = `
    <div class="help-modal cyber-frame">
      <span class="corner-tr"></span>
      <span class="corner-bl"></span>
      <h2 class="help-modal-title">Keyboard Shortcuts</h2>
      <div class="help-shortcuts">
        ${KEYBOARD_SHORTCUTS.map(
          (s) => `
          <div class="help-shortcut">
            <kbd>${s.key}</kbd>
            <span>${s.description}</span>
          </div>
        `,
        ).join('')}
      </div>
      <button class="help-close-btn" data-action="close-help">Close (Esc)</button>
    </div>
  `

  document.body.appendChild(modal)

  // Close on click outside or escape
  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === modal || target.closest('[data-action="close-help"]')) {
      closeHelpModal()
    }
  })
}

function closeHelpModal(): void {
  const modal = document.querySelector('.help-modal-overlay')
  if (modal) {
    modal.remove()
    helpModalOpen = false
  }
}

// ===== SEARCH MODAL =====

function showSearchModal(): void {
  if (searchModalOpen) return
  searchModalOpen = true

  // Reset search state
  searchQuery = ''
  searchResults = []
  searchPage = 0
  searchTotalPages = 0
  searchTotalHits = 0
  isSearching = false

  const modal = document.createElement('div')
  modal.className = 'search-modal-overlay'
  modal.innerHTML = `
    <div class="search-modal cyber-frame">
      <span class="corner-tr"></span>
      <span class="corner-bl"></span>
      <div class="search-header">
        <div class="search-input-wrapper">
          ${icons.search}
          <input
            type="text"
            class="search-input"
            placeholder="Search Hacker News..."
            autofocus
          />
        </div>
        <div class="search-filters">
          <button class="search-filter-btn active" data-filter="all">All</button>
          <button class="search-filter-btn" data-filter="story">Stories</button>
          <button class="search-filter-btn" data-filter="comment">Comments</button>
          <button class="search-filter-btn search-sort-btn" data-sort="toggle">
            ${icons.sort}
            <span class="sort-label">Relevance</span>
          </button>
        </div>
      </div>
      <div class="search-results">
        <div class="search-hint">
          Type to search • <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)

  // Get input element
  const input = modal.querySelector('.search-input') as HTMLInputElement
  if (input) {
    input.focus()

    // Handle input with debounce
    input.addEventListener('input', () => {
      const query = input.value.trim()
      if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout)

      if (query.length < 2) {
        searchResults = []
        renderSearchResults()
        return
      }

      searchDebounceTimeout = setTimeout(() => {
        searchQuery = query
        searchPage = 0
        performSearch()
      }, 300)
    })

    // Handle keyboard in input
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSearchModal()
      }
    })
  }

  // Handle filter clicks
  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // Close on backdrop click
    if (target === modal) {
      closeSearchModal()
      return
    }

    // Filter buttons
    const filterBtn = target.closest('[data-filter]') as HTMLElement
    if (filterBtn) {
      const filter = filterBtn.dataset.filter as SearchFilter
      if (filter && filter !== searchFilter) {
        searchFilter = filter
        modal.querySelectorAll('[data-filter]').forEach((btn) => {
          btn.classList.toggle('active', btn === filterBtn)
        })
        if (searchQuery.length >= 2) {
          searchPage = 0
          performSearch()
        }
      }
      return
    }

    // Sort toggle
    const sortBtn = target.closest('[data-sort="toggle"]') as HTMLElement
    if (sortBtn) {
      searchSort = searchSort === 'relevance' ? 'date' : 'relevance'
      const label = sortBtn.querySelector('.sort-label')
      if (label) {
        label.textContent = searchSort === 'relevance' ? 'Relevance' : 'Date'
      }
      sortBtn.classList.toggle('active', searchSort === 'date')
      if (searchQuery.length >= 2) {
        searchPage = 0
        performSearch()
      }
      return
    }

    // Pagination
    const prevBtn = target.closest('[data-action="prev-page"]')
    if (prevBtn && searchPage > 0) {
      searchPage--
      performSearch()
      return
    }

    const nextBtn = target.closest('[data-action="next-page"]')
    if (nextBtn && searchPage < searchTotalPages - 1) {
      searchPage++
      performSearch()
      return
    }

    // Result click
    const resultEl = target.closest('.search-result') as HTMLElement
    if (resultEl) {
      const resultId = resultEl.dataset.id
      const resultType = resultEl.dataset.type
      if (resultId) {
        closeSearchModal()
        if (resultType === 'comment') {
          // Navigate to the story containing the comment
          const storyId = resultEl.dataset.storyId
          if (storyId) {
            window.location.hash = `item/${storyId}`
          }
        } else {
          window.location.hash = `item/${resultId}`
        }
      }
    }
  })
}

function closeSearchModal(): void {
  const modal = document.querySelector('.search-modal-overlay')
  if (modal) {
    modal.remove()
    searchModalOpen = false
  }
  if (searchDebounceTimeout) {
    clearTimeout(searchDebounceTimeout)
    searchDebounceTimeout = null
  }
}

async function performSearch(): Promise<void> {
  if (!searchQuery || searchQuery.length < 2) return

  isSearching = true
  renderSearchResults()

  try {
    const response = await searchHN(searchQuery, {
      page: searchPage,
      hitsPerPage: 20,
      sort: searchSort,
      filter: searchFilter,
    })

    searchResults = response.hits
    searchTotalPages = response.nbPages
    searchTotalHits = response.nbHits
    isSearching = false
    renderSearchResults()
  } catch (error) {
    console.error('Search error:', error)
    isSearching = false
    searchResults = []
    renderSearchResults(true)
  }
}

function renderSearchResults(hasError = false): void {
  const container = document.querySelector('.search-results')
  if (!container) return

  // Loading state
  if (isSearching) {
    container.innerHTML = `
      <div class="search-loading">
        <div class="loading-spinner"></div>
        <span>Searching...</span>
      </div>
    `
    return
  }

  // Error state
  if (hasError) {
    container.innerHTML = `
      <div class="search-error">
        <span>Search failed. Please try again.</span>
      </div>
    `
    return
  }

  // Empty state (no query)
  if (!searchQuery || searchQuery.length < 2) {
    container.innerHTML = `
      <div class="search-hint">
        Type to search • <kbd>Esc</kbd> to close
      </div>
    `
    return
  }

  // No results
  if (searchResults.length === 0) {
    container.innerHTML = `
      <div class="search-empty">
        ${icons.search}
        <span>No results found for "${escapeHtml(searchQuery)}"</span>
      </div>
    `
    return
  }

  // Results
  const resultsHtml = searchResults.map(renderSearchResult).join('')

  const paginationHtml =
    searchTotalPages > 1
      ? `
    <div class="search-pagination">
      <button class="search-pagination-btn" data-action="prev-page" ${searchPage === 0 ? 'disabled' : ''}>
        ← Prev
      </button>
      <span class="search-pagination-info">
        Page ${searchPage + 1} of ${searchTotalPages} • ${searchTotalHits.toLocaleString()} results
      </span>
      <button class="search-pagination-btn" data-action="next-page" ${searchPage >= searchTotalPages - 1 ? 'disabled' : ''}>
        Next →
      </button>
    </div>
  `
      : `<div class="search-pagination-info" style="text-align: center; padding: 1rem;">
        ${searchTotalHits.toLocaleString()} results
      </div>`

  container.innerHTML = resultsHtml + paginationHtml
}

function renderSearchResult(result: SearchResult): string {
  const isComment = result.type === 'comment'
  const typeClass = isComment ? 'search-result-comment' : ''

  if (isComment) {
    // Comment result
    const storyTitle = result.storyTitle
      ? escapeHtml(result.storyTitle)
      : 'Unknown story'
    const textPreview = result.text ? escapeHtml(result.text.slice(0, 200)) : ''
    const timeAgo = result.createdAt ? formatTimeAgo(result.createdAt) : ''

    return `
      <div class="search-result ${typeClass}" data-id="${result.id}" data-type="comment" data-story-id="${result.storyId || ''}">
        <div class="search-result-title">
          Re: ${storyTitle}
        </div>
        ${textPreview ? `<div class="search-result-comment-text">${textPreview}...</div>` : ''}
        <div class="search-result-meta">
          ${icons.user}<span>${escapeHtml(result.author || 'unknown')}</span>
          <span class="meta-sep">•</span>
          ${icons.clock}<span>${timeAgo}</span>
        </div>
      </div>
    `
  }

  // Story result
  const title = result.title ? escapeHtml(result.title) : 'Untitled'
  const domain = result.url ? extractDomain(result.url) : null
  const timeAgo = result.createdAt ? formatTimeAgo(result.createdAt) : ''

  return `
    <div class="search-result ${typeClass}" data-id="${result.id}" data-type="story">
      <div class="search-result-title">
        ${title}
        ${domain ? `<span class="meta-sep">•</span><span class="result-domain">${domain}</span>` : ''}
      </div>
      <div class="search-result-meta">
        ${icons.points}<span>${result.points}</span>
        <span class="meta-sep">•</span>
        ${icons.user}<span>${escapeHtml(result.author || 'unknown')}</span>
        <span class="meta-sep">•</span>
        ${icons.clock}<span>${timeAgo}</span>
        <span class="meta-sep">•</span>
        ${icons.comment}<span>${result.numComments}</span>
      </div>
    </div>
  `
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
      if (isSettingsModalOpen()) {
        closeSettingsModal()
      } else if (searchModalOpen) {
        closeSearchModal()
      } else if (helpModalOpen) {
        closeHelpModal()
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
      if (helpModalOpen) {
        closeHelpModal()
      } else {
        showHelpModal()
      }
    },
    onScrollToTop: () => {
      scrollToTop()
    },
    onSearch: () => {
      if (searchModalOpen) {
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
  // Initialize theme and settings first to prevent flash of wrong theme
  initTheme()
  initSettings()

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
    setupPullToRefresh()

    // Update nav to show correct default feed as active
    document.querySelectorAll('[data-feed]').forEach((btn) => {
      btn.classList.toggle(
        'active',
        btn.getAttribute('data-feed') === currentFeed,
      )
    })

    // Handle hash routing
    window.addEventListener('hashchange', handleHashChange)

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

/**
 * Story list view module.
 * Handles rendering the list of stories with pagination and virtual scrolling.
 */

import { announce } from './accessibility'
import { animateListEnter, applyStaggerAnimation } from './animations'
import {
  clearStoryIdsCache,
  fetchStoriesPaginated,
  onFeedRefresh,
  triggerBackgroundRefreshIfStale,
} from './api'
import { updateAssistantZenMode } from './assistant-ui'
import { type DuplicateInfo, findDuplicates } from './duplicates'
import { parseApiError, renderErrorWithRetry, showErrorToast } from './errors'
import { observeNewFavicons } from './favicon'
import { icons } from './icons'
import { resetSelection } from './keyboard'
import {
  clearPrefetchCache,
  onStoryHoverEnd,
  onStoryHoverStart,
  prefetchNextPage,
  prefetchVisibleStories,
} from './prefetch'
import { renderLoadMoreIndicator, renderStory } from './renderers'
import {
  getScrollTop,
  restoreFeedScrollPosition,
  setScrollTop,
} from './scroll-utils'
import { renderStorySkeletons } from './skeletons'
import {
  clearFeedScrollPosition,
  getBookmarkedStories,
  getCommentCountsMap,
  getNewCommentsCount,
  getReadStoryIds,
  getStoryTrendingLevel,
  saveFeedScrollPosition,
  saveStoryScore,
} from './storage'
import type { HNItem, StoryFeed } from './types'
import { VirtualScroll } from './virtual-scroll'
import { isZenModeActive } from './zen-mode'

// Constants
const STORIES_PER_PAGE = 30
const STORY_ITEM_HEIGHT = 95
const VIRTUAL_SCROLL_THRESHOLD = 100

/** Feed display titles for h1 heading */
const FEED_TITLES: Record<StoryFeed, string> = {
  top: 'Top Stories',
  new: 'New Stories',
  best: 'Best Stories',
  ask: 'Ask HN',
  show: 'Show HN',
  jobs: 'Jobs',
  saved: 'Saved Stories',
}

/**
 * Get display title for a feed.
 */
export function getFeedTitle(feed: StoryFeed): string {
  return FEED_TITLES[feed]
}

// Module state
let currentFeed: StoryFeed = 'top'
let currentStories: HNItem[] = []
let currentOffset = 0
let hasMoreStories = true
let currentDuplicates: Map<number, DuplicateInfo> = new Map()
let readStoryIds: Set<number> = new Set()
let commentCountsMap: Map<number, number> = new Map()
let isLoading = false
let isLoadingMore = false
let virtualScroll: VirtualScroll<HNItem> | null = null
let scrollObserver: IntersectionObserver | null = null

/**
 * Get current feed.
 */
export function getCurrentFeed(): StoryFeed {
  return currentFeed
}

/**
 * Set current feed.
 */
export function setCurrentFeed(feed: StoryFeed): void {
  currentFeed = feed
}

/**
 * Get current stories.
 */
export function getCurrentStories(): HNItem[] {
  return currentStories
}

/**
 * Get read story IDs set.
 */
export function getReadStoryIdsSet(): Set<number> {
  return readStoryIds
}

/**
 * Get comment counts map.
 */
export function getCommentCountsMapRef(): Map<number, number> {
  return commentCountsMap
}

/**
 * Check if story list is loading.
 */
export function isStoryListLoading(): boolean {
  return isLoading
}

/**
 * Get virtual scroll instance.
 */
export function getVirtualScroll(): VirtualScroll<HNItem> | null {
  return virtualScroll
}

/**
 * Clear read story IDs (called when reading history is cleared).
 */
export function clearReadStoryIds(): void {
  readStoryIds.clear()
}

/**
 * Set up hover event listeners on story cards for prefetching.
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
 * Standard rendering for small lists - uses direct DOM.
 */
function renderStoriesStandard(
  container: HTMLElement,
  stories: HNItem[],
): void {
  // Save story scores for trending detection
  for (const story of stories) {
    saveStoryScore(story.id, story.score || 0)
  }

  const feedTitle = getFeedTitle(currentFeed)

  container.innerHTML =
    `<h1 class="feed-title">${feedTitle}</h1>` +
    stories
      .map((story, idx) => {
        const duplicateInfo = currentDuplicates.get(story.id)
        return renderStory(
          story,
          idx + 1,
          readStoryIds.has(story.id),
          getNewCommentsCount(story.id, story.descendants || 0),
          getStoryTrendingLevel(story.id, story.score || 0),
          duplicateInfo?.totalSubmissions ?? 0,
        )
      })
      .join('') +
    renderLoadMoreIndicator(hasMoreStories)

  applyStaggerAnimation(container, '.story')
  setupStoryHoverPrefetch(container)

  const storyIds = stories.map((s) => s.id)
  prefetchVisibleStories(storyIds)

  setupInfiniteScroll()
  updateAssistantZenMode(isZenModeActive(), 'list')
}

/**
 * Render saved/bookmarked stories with special empty state.
 */
function renderSavedStories(container: HTMLElement, stories: HNItem[]): void {
  const feedTitle = getFeedTitle('saved')

  if (stories.length === 0) {
    container.innerHTML = `
      <h1 class="feed-title">${feedTitle}</h1>
      <div class="saved-empty-state">
        <div class="saved-empty-icon">${icons.bookmark}</div>
        <p class="saved-empty-title">No saved stories</p>
        <p class="saved-empty-text">
          Stories you bookmark will appear here for easy access.
          <br>
          Bookmark stories from their detail view using the Bookmark button.
        </p>
      </div>
    `
    return
  }

  container.innerHTML =
    `<h1 class="feed-title">${feedTitle}</h1>` +
    stories
      .map((story, idx) =>
        renderStory(story, idx + 1, readStoryIds.has(story.id), 0, 'none', 0),
      )
      .join('')

  // Observe newly added favicons for lazy loading
  observeNewFavicons()

  applyStaggerAnimation(container, '.story')
  setupStoryHoverPrefetch(container)

  const storyIds = stories.map((s) => s.id)
  prefetchVisibleStories(storyIds)

  updateAssistantZenMode(isZenModeActive(), 'list')
}

/**
 * Initialize virtual scroll for large lists.
 */
function initVirtualScroll(container: HTMLElement): void {
  if (virtualScroll) {
    virtualScroll.destroy()
  }

  const feedTitle = getFeedTitle(currentFeed)

  virtualScroll = new VirtualScroll<HNItem>({
    container,
    itemHeight: STORY_ITEM_HEIGHT,
    bufferSize: 10,
    headerHtml: `<h1 class="feed-title">${feedTitle}</h1>`,
    renderItem: (story, index) => {
      const duplicateInfo = currentDuplicates.get(story.id)
      return renderStory(
        story,
        index + 1,
        readStoryIds.has(story.id),
        getNewCommentsCount(story.id, story.descendants || 0),
        getStoryTrendingLevel(story.id, story.score || 0),
        duplicateInfo?.totalSubmissions ?? 0,
      )
    },
    onNearEnd: () => {
      if (hasMoreStories && !isLoadingMore) {
        loadMoreStoriesVirtual()
      }
    },
    nearEndThreshold: 400,
    onRender: () => {
      // Observe newly rendered favicons for lazy loading
      observeNewFavicons()
    },
  })

  virtualScroll.init(currentStories)
}

/**
 * Load more stories for virtual scroll mode.
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

      currentDuplicates = findDuplicates(currentStories)

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
 * Switch to virtual scroll when list gets large.
 */
function maybeEnableVirtualScroll(): void {
  if (virtualScroll) return

  if (currentStories.length >= VIRTUAL_SCROLL_THRESHOLD) {
    const container = document.getElementById('stories')
    if (container) {
      const scrollY = getScrollTop()
      initVirtualScroll(container)
      setScrollTop(scrollY)
    }
  }
}

/**
 * Set up infinite scroll observer.
 */
function setupInfiniteScroll(): void {
  if (scrollObserver) {
    scrollObserver.disconnect()
  }

  const indicator = document.querySelector('.load-more-indicator')
  if (!indicator || !hasMoreStories) return

  scrollObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && hasMoreStories && !isLoadingMore) {
        prefetchNextPage(
          currentFeed,
          currentOffset + STORIES_PER_PAGE,
          STORIES_PER_PAGE,
        )
        loadMoreStories()
      }
    },
    {
      rootMargin: '200px',
      threshold: 0,
    },
  )

  scrollObserver.observe(indicator)
}

/**
 * Load more stories (standard mode).
 */
export async function loadMoreStories(): Promise<void> {
  if (isLoadingMore || !hasMoreStories) return

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

      const loadMoreEl = container.querySelector('.load-more-indicator')
      if (loadMoreEl) loadMoreEl.remove()

      for (const story of stories) {
        saveStoryScore(story.id, story.score || 0)
      }

      const allStories = [...currentStories, ...stories]
      currentDuplicates = findDuplicates(allStories)

      const startRank = currentStories.length + 1
      const newStoriesHtml = stories
        .map((story, idx) => {
          const duplicateInfo = currentDuplicates.get(story.id)
          return renderStory(
            story,
            startRank + idx,
            readStoryIds.has(story.id),
            getNewCommentsCount(story.id, story.descendants || 0),
            getStoryTrendingLevel(story.id, story.score || 0),
            duplicateInfo?.totalSubmissions ?? 0,
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

      setupInfiniteScroll()
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
// Expose retry function globally
;(window as { retryLoadMore?: typeof loadMoreStories }).retryLoadMore =
  loadMoreStories

/**
 * Render stories for a feed.
 */
export async function renderStories(
  feed: StoryFeed,
  refresh = false,
  animateIn = false,
): Promise<void> {
  if (isLoading) return
  isLoading = true
  resetSelection()

  // Fast path: reuse cached stories when returning from detail view to same feed
  const canReuseCachedStories =
    animateIn && !refresh && feed === currentFeed && currentStories.length > 0

  // Save current scroll position before clearing (for feed switches)
  if (currentFeed !== feed) {
    saveFeedScrollPosition(currentFeed, getScrollTop())
  }

  // Save stories before resetting state (in case we can reuse them)
  const cachedStories = currentStories
  const cachedOffset = currentOffset
  const cachedHasMore = hasMoreStories
  const cachedDuplicates = currentDuplicates

  // Reset pagination state
  currentOffset = 0
  hasMoreStories = true
  currentStories = []

  // Clean up existing virtual scroll
  if (virtualScroll) {
    virtualScroll.destroy()
    virtualScroll = null
  }

  // Clear scroll position on explicit refresh
  if (refresh) {
    clearStoryIdsCache(feed)
    clearFeedScrollPosition(feed)
    clearPrefetchCache()
  }

  // Update current feed
  currentFeed = feed

  // Load read stories cache
  readStoryIds = getReadStoryIds()

  // Load comment counts cache for "new comments" badge
  commentCountsMap = getCommentCountsMap()

  const container = document.getElementById('stories')
  if (!container) {
    isLoading = false
    return
  }

  // Use cached stories instantly when returning from detail view
  if (canReuseCachedStories) {
    currentStories = cachedStories
    currentOffset = cachedOffset
    hasMoreStories = cachedHasMore
    currentDuplicates = cachedDuplicates

    if (feed === 'saved') {
      renderSavedStories(container, cachedStories)
    } else {
      renderStoriesStandard(container, cachedStories)
    }

    container.setAttribute('aria-busy', 'false')
    await animateListEnter(container)
    restoreFeedScrollPosition(feed)
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
    let stories: HNItem[]
    let hasMore: boolean

    // Handle 'saved' feed specially - load from local storage
    if (feed === 'saved') {
      stories = getBookmarkedStories()
      hasMore = false
    } else {
      const result = await fetchStoriesPaginated(feed, 0, STORIES_PER_PAGE)
      stories = result.stories
      hasMore = result.hasMore
    }

    currentStories = stories
    currentOffset = stories.length
    hasMoreStories = hasMore

    // Compute duplicate stories for the current feed
    currentDuplicates = findDuplicates(stories)

    if (feed === 'saved') {
      renderSavedStories(container, stories)
    } else {
      renderStoriesStandard(container, stories)
    }

    container.setAttribute('aria-busy', 'false')

    // Announce feed switch and story count for screen readers
    const feedTitle = getFeedTitle(feed)
    if (feed === 'saved') {
      announce(
        `${feedTitle}: ${stories.length} bookmarked ${stories.length === 1 ? 'story' : 'stories'}`,
      )
    } else {
      announce(`${feedTitle}: ${stories.length} stories loaded`)
    }

    restoreFeedScrollPosition(feed)

    // Trigger background refresh if feed data is stale (but not for saved feed)
    if (feed !== 'saved') {
      triggerBackgroundRefreshIfStale(feed)
    }
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
 * Clean up story list state (called when navigating away).
 */
export function cleanupStoryList(): void {
  if (scrollObserver) {
    scrollObserver.disconnect()
    scrollObserver = null
  }
}

// ===== Background Refresh =====

/** Track if new stories banner is currently shown */
let newStoriesBannerVisible = false

/**
 * Show a banner indicating new stories are available.
 */
function showNewStoriesBanner(count: number): void {
  if (newStoriesBannerVisible) return

  const container = document.getElementById('stories')
  if (!container) return

  // Remove any existing banner
  const existingBanner = document.querySelector('.new-stories-banner')
  if (existingBanner) existingBanner.remove()

  const banner = document.createElement('button')
  banner.className = 'new-stories-banner'
  banner.innerHTML = `${icons.retry} ${count} new ${count === 1 ? 'story' : 'stories'} available`
  banner.setAttribute('aria-live', 'polite')

  banner.addEventListener('click', () => {
    hideNewStoriesBanner()
    // Refresh the current feed
    renderStories(currentFeed, true)
  })

  // Insert at the top of the stories container
  container.insertAdjacentElement('afterbegin', banner)
  newStoriesBannerVisible = true

  // Animate in
  requestAnimationFrame(() => {
    banner.classList.add('visible')
  })

  // Announce for screen readers
  announce(`${count} new ${count === 1 ? 'story' : 'stories'} available. Click to refresh.`)
}

/**
 * Hide the new stories banner.
 */
function hideNewStoriesBanner(): void {
  const banner = document.querySelector('.new-stories-banner')
  if (banner) {
    banner.classList.remove('visible')
    setTimeout(() => banner.remove(), 200)
  }
  newStoriesBannerVisible = false
}

/**
 * Handle background refresh completion.
 * Called when new stories are fetched in the background.
 */
function handleFeedRefresh(feed: StoryFeed, newIds: number[]): void {
  // Only show banner if this is for the current feed
  if (feed !== currentFeed) return

  // Compare with current story IDs to find actually new stories
  const currentIds = new Set(currentStories.map((s) => s.id))
  const newStoryIds = newIds.filter((id) => !currentIds.has(id))

  if (newStoryIds.length > 0) {
    showNewStoriesBanner(newStoryIds.length)
  }
}

// Register the background refresh callback on module load
onFeedRefresh(handleFeedRefresh)

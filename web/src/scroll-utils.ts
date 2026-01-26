/**
 * Scroll utilities for managing scroll position in the main container.
 * Provides consistent scroll handling across list and detail views.
 */

import {
  getFeedScrollPosition,
  getStoryScrollPosition,
  saveFeedScrollPosition,
  saveStoryScrollPosition,
} from './storage'
import type { StoryFeed } from './types'

/**
 * Get the main scroll container element.
 */
export function getScrollContainer(): HTMLElement {
  return document.querySelector('main') as HTMLElement
}

/**
 * Get the current scroll position from the scroll container.
 */
export function getScrollTop(): number {
  const container = getScrollContainer()
  return container ? container.scrollTop : 0
}

/**
 * Set the scroll position on the scroll container.
 */
export function setScrollTop(
  top: number,
  behavior: ScrollBehavior = 'auto',
): void {
  const container = getScrollContainer()
  if (container) {
    container.scrollTo({ top, behavior })
  }
}

// Debounce timeout handle
let scrollSaveTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Save scroll position with debouncing to avoid excessive writes.
 * Saves to the appropriate storage based on current view.
 */
export function saveScrollPositionDebounced(
  currentView: 'list' | 'detail' | 'user',
  currentFeed: StoryFeed,
  currentStoryId: number | null,
): void {
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

/**
 * Restore scroll position for a feed after DOM renders.
 * Uses requestAnimationFrame to ensure DOM is ready.
 */
export function restoreFeedScrollPosition(feed: StoryFeed): void {
  requestAnimationFrame(() => {
    const savedPosition = getFeedScrollPosition(feed)
    if (savedPosition > 0) {
      setScrollTop(savedPosition)
    }
  })
}

/**
 * Restore scroll position for a story detail view.
 * Scrolls to saved position or top if no position saved.
 */
export function restoreStoryScrollPosition(storyId: number): void {
  requestAnimationFrame(() => {
    const savedPosition = getStoryScrollPosition(storyId)
    if (savedPosition > 0) {
      setScrollTop(savedPosition)
    } else {
      setScrollTop(0)
    }
  })
}

/**
 * Update header shadow based on scroll position.
 * Adds 'scrolled' class when scrolled down to create shadow effect.
 */
export function updateHeaderShadow(): void {
  const header = document.querySelector('header')
  if (!header) return

  if (getScrollTop() > 10) {
    header.classList.add('scrolled')
  } else {
    header.classList.remove('scrolled')
  }
}

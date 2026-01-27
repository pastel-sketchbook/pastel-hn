/**
 * Navigation module.
 * Handles routing, feed switching, and action button handlers.
 */

import { icons } from './icons'
import {
  bookmarkStory,
  followStory,
  isStoryBookmarked,
  isStoryFollowed,
  removeBookmark,
  unfollowStory,
} from './storage'
import { toastError, toastInfo, toastSuccess } from './toast'
import type { HNItem, StoryFeed } from './types'

/**
 * Navigation callbacks interface.
 */
export interface NavigationCallbacks {
  getCurrentView: () => 'list' | 'detail' | 'user'
  setCurrentView: (view: 'list' | 'detail' | 'user') => void
  getCurrentFeed: () => StoryFeed
  setCurrentFeed: (feed: StoryFeed) => void
  getCurrentStoryId: () => number | null
  getCurrentUserId: () => string | null
  getCurrentStoryData: () => HNItem | null
  renderStories: (feed: StoryFeed) => Promise<void>
  renderStoryDetail: (storyId: number, clickedEl?: HTMLElement) => Promise<void>
  renderUserProfile: (userId: string) => Promise<void>
  navigateBackToList: () => Promise<void>
}

let callbacks: NavigationCallbacks | null = null

/**
 * Configure navigation with callbacks.
 */
export function configureNavigation(cbs: NavigationCallbacks): void {
  callbacks = cbs
}

/**
 * Set up feed navigation click handlers.
 */
export function setupFeedNavigation(): void {
  if (!callbacks) return

  const nav = document.getElementById('nav')
  if (!nav) return

  nav.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const feedBtn = target.closest('[data-feed]') as HTMLElement | null
    if (!feedBtn || !callbacks) return

    const feed = feedBtn.dataset.feed as StoryFeed
    if (
      feed === callbacks.getCurrentFeed() &&
      callbacks.getCurrentView() === 'list'
    )
      return

    document.querySelectorAll('[data-feed]').forEach((btn) => {
      btn.classList.remove('active')
      btn.setAttribute('aria-pressed', 'false')
    })
    feedBtn.classList.add('active')
    feedBtn.setAttribute('aria-pressed', 'true')

    callbacks.setCurrentFeed(feed)
    callbacks.setCurrentView('list')
    window.location.hash = ''
    callbacks.renderStories(feed)
  })
}

/**
 * Set up back button click handlers.
 */
export function setupBackNavigation(): void {
  if (!callbacks) return

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const backBtn = target.closest('[data-action="back"]')
    if (backBtn && callbacks) {
      e.preventDefault()
      callbacks.navigateBackToList()
    }
  })
}

/**
 * Set up retry button click handlers.
 */
export function setupRetryHandlers(): void {
  if (!callbacks) return

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const retryBtn = target.closest(
      '[data-action^="retry-"]',
    ) as HTMLElement | null
    if (retryBtn && callbacks) {
      e.preventDefault()
      const action = retryBtn.dataset.action
      if (action === 'retry-stories') {
        callbacks.renderStories(callbacks.getCurrentFeed())
      } else if (action === 'retry-story') {
        const storyId = callbacks.getCurrentStoryId()
        if (storyId) callbacks.renderStoryDetail(storyId)
      } else if (action === 'retry-user') {
        const userId = callbacks.getCurrentUserId()
        if (userId) callbacks.renderUserProfile(userId)
      }
    }
  })
}

/**
 * Set up share/copy action button handlers.
 */
export function setupActionHandlers(): void {
  if (!callbacks) return

  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const actionBtn = target.closest('[data-action]') as HTMLElement | null
    if (!actionBtn || !callbacks) return

    const action = actionBtn.dataset.action

    if (action === 'toggle-bookmark') {
      e.preventDefault()
      const storyId = Number(actionBtn.dataset.id)
      if (!storyId) return

      if (isStoryBookmarked(storyId)) {
        removeBookmark(storyId)
        actionBtn.classList.remove('bookmarked')
        actionBtn.title = 'Bookmark story'
        actionBtn.innerHTML = `${icons.bookmark}<span>Bookmark</span>`
        toastInfo('Bookmark removed')
      } else {
        const storyData = callbacks.getCurrentStoryData()
        if (storyData) {
          bookmarkStory(storyData)
          actionBtn.classList.add('bookmarked')
          actionBtn.title = 'Remove bookmark'
          actionBtn.innerHTML = `${icons.bookmarkFilled}<span>Bookmarked</span>`
          toastSuccess('Story bookmarked')
        }
      }
    } else if (action === 'toggle-follow') {
      e.preventDefault()
      const storyId = Number(actionBtn.dataset.id)
      if (!storyId) return

      if (isStoryFollowed(storyId)) {
        unfollowStory(storyId)
        actionBtn.classList.remove('followed')
        actionBtn.title = 'Get notified of new comments'
        actionBtn.innerHTML = `${icons.bell}<span>Follow</span>`
        toastInfo('Stopped following story')
      } else {
        const storyData = callbacks.getCurrentStoryData()
        if (storyData) {
          followStory(storyData)
          actionBtn.classList.add('followed')
          actionBtn.title = 'Unfollow story'
          actionBtn.innerHTML = `${icons.bellFilled}<span>Following</span>`
          toastSuccess("Following story - you'll be notified of new comments")
        }
      }
    } else if (action === 'copy-hn-link') {
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

      if (navigator.share) {
        try {
          await navigator.share({
            title: title,
            text: `${title} - Hacker News`,
            url: articleUrl || hnUrl,
          })
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            toastError('Failed to share')
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(hnUrl)
          toastSuccess('Link copied to clipboard (share not available)')
        } catch {
          toastError('Failed to copy link')
        }
      }
    }
  })
}

/**
 * Set up comment link click handlers (navigating to story detail).
 */
export function setupCommentLinkHandlers(): void {
  if (!callbacks) return

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const link = target.closest('a[href^="#item/"]') as HTMLAnchorElement | null
    if (link && callbacks) {
      e.preventDefault()
      const match = link.href.match(/#item\/(\d+)/)
      if (match) {
        const storyId = Number.parseInt(match[1], 10)
        const storyCard = link.closest('.story[data-id]') as HTMLElement | null
        callbacks.renderStoryDetail(storyId, storyCard || undefined)
        window.location.hash = `item/${storyId}`
      }
    }
  })
}

/**
 * Set up user link click handlers.
 */
export function setupUserLinkHandlers(): void {
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
}

/**
 * Set up story card click handlers (clicking anywhere on card navigates to detail).
 */
export function setupStoryCardHandlers(): void {
  if (!callbacks) return

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    // Don't handle if clicking on a link, button, or interactive element
    if (target.closest('a, button, .vote-btn')) return

    const storyCard = target.closest('.story[data-id]') as HTMLElement | null
    if (storyCard && callbacks && callbacks.getCurrentView() === 'list') {
      const storyId = storyCard.dataset.id
      if (storyId) {
        callbacks.renderStoryDetail(Number.parseInt(storyId, 10), storyCard)
        window.location.hash = `item/${storyId}`
      }
    }
  })
}

/**
 * Handle hash changes for routing.
 */
export function handleHashChange(): void {
  if (!callbacks) return

  const hash = window.location.hash
  const itemMatch = hash.match(/^#item\/(\d+)$/)
  const userMatch = hash.match(/^#user\/(.+)$/)

  if (itemMatch) {
    const storyId = Number.parseInt(itemMatch[1], 10)
    callbacks.renderStoryDetail(storyId)
  } else if (userMatch) {
    const userId = decodeURIComponent(userMatch[1])
    callbacks.renderUserProfile(userId)
  } else if (
    callbacks.getCurrentView() === 'detail' ||
    callbacks.getCurrentView() === 'user'
  ) {
    callbacks.setCurrentView('list')
    callbacks.renderStories(callbacks.getCurrentFeed())
  }
}

/**
 * Set up all navigation handlers.
 */
export function setupAllNavigation(): void {
  setupFeedNavigation()
  setupBackNavigation()
  setupRetryHandlers()
  setupActionHandlers()
  setupCommentLinkHandlers()
  setupUserLinkHandlers()
  setupStoryCardHandlers()
}

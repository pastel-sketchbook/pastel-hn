/**
 * Main entry point for pastel-hn.
 * Orchestrates initialization and coordinates between modules.
 */

import { animateDetailExit } from './animations'
import { init } from './api'
import {
  clearStoryContext,
  closeAssistant,
  initAssistant,
  isAssistantOpen,
  updateAssistantZenMode,
} from './assistant-ui'
import {
  configureBackToTop,
  scrollToTop,
  setupBackToTop,
  updateBackToTopVisibility,
} from './back-to-top'
import { configureDeepLinks, initDeepLinks } from './deep-link'
import { initErrorBoundary } from './error-boundary'
import { initFaviconLazyLoading } from './favicon'
import { startFollowedStoriesPolling } from './follow-polling'
import { configureGlobalShortcuts } from './global-shortcuts'
import {
  getSelectedIndex,
  initKeyboard,
  setKeyboardCallbacks,
} from './keyboard'
import {
  configureNavigation,
  handleHashChange,
  setupAllNavigation,
} from './navigation'
import { initNotifications } from './notifications'
import { initOfflineDetection } from './offline'
import { configurePullRefresh, setupPullToRefresh } from './pull-refresh'
import {
  getScrollContainer,
  getScrollTop,
  saveScrollPositionDebounced,
  setScrollTop,
  updateHeaderShadow,
} from './scroll-utils'
import {
  closeSettingsModal,
  getSettings,
  initSettings,
  isSettingsModalOpen,
  showSettingsModal,
} from './settings'
import { saveFeedScrollPosition } from './storage'
import {
  getCurrentStoryData,
  getCurrentStoryId,
  renderStoryDetail as renderStoryDetailModule,
  saveAndResetStoryState,
} from './story-detail'
import {
  clearReadStoryIds,
  getCommentCountsMapRef,
  getCurrentStories,
  getReadStoryIdsSet,
  getVirtualScroll,
  isStoryListLoading,
  renderStories as renderStoriesModule,
  setCurrentFeed,
} from './story-list'
import { toggleTheme } from './theme'
import { toastError, toastInfo, toastSuccess } from './toast'
import { configureTrayEvents, initTrayEvents } from './tray-events'
import { initTtsUi } from './tts-ui'
import type { StoryFeed } from './types'
import {
  getCurrentUserId,
  renderUserProfile as renderUserProfileModule,
} from './user-profile'
import { getHNItemUrl } from './utils'
import {
  exitZenMode,
  isZenModeActive,
  isZenModeTransitioning,
  setZenModeChangeCallback,
  toggleZenMode,
} from './zen-mode'
import './styles/main.css'

// Application state
let currentView: 'list' | 'detail' | 'user' = 'list'
let currentFeed: StoryFeed = 'top'

/**
 * Get display name for a feed type.
 */
function getFeedDisplayName(feed: StoryFeed): string {
  const names: Record<StoryFeed, string> = {
    top: 'Top Stories',
    new: 'New Stories',
    best: 'Best Stories',
    ask: 'Ask HN',
    show: 'Show HN',
    jobs: 'Jobs',
    saved: 'Saved',
  }
  return names[feed] ?? feed
}

/**
 * Navigate back to list view with animation.
 */
async function navigateBackToList(): Promise<void> {
  const container = document.getElementById('stories')
  if (!container) return

  // Save comment count when leaving story detail view
  saveAndResetStoryState(getCommentCountsMapRef())

  // Animate detail view exiting
  await animateDetailExit(container)

  // Clear AI assistant context and close panel
  clearStoryContext()
  closeAssistant()

  // Update state and render list with animation
  currentView = 'list'
  window.location.hash = ''
  await renderStoriesModule(currentFeed, false, true)
}

/**
 * Render stories wrapper that updates local state.
 */
async function renderStories(feed: StoryFeed, refresh = false): Promise<void> {
  currentFeed = feed
  setCurrentFeed(feed)
  currentView = 'list'
  await renderStoriesModule(feed, refresh, false)
}

/**
 * Render story detail wrapper.
 */
async function renderStoryDetail(
  storyId: number,
  clickedStoryEl?: HTMLElement,
): Promise<void> {
  // Save feed scroll position before navigating
  saveFeedScrollPosition(currentFeed, getScrollTop())
  currentView = 'detail'

  const container = document.getElementById('stories')
  if (!container) return

  await renderStoryDetailModule(
    storyId,
    container,
    getReadStoryIdsSet(),
    clickedStoryEl,
  )
}

/**
 * Render user profile wrapper.
 */
async function renderUserProfile(userId: string): Promise<void> {
  currentView = 'user'

  const container = document.getElementById('stories')
  if (!container) return

  await renderUserProfileModule(userId, container)
}

/**
 * Pull-to-refresh handler.
 */
async function handlePullRefresh(): Promise<void> {
  if (currentView === 'list') {
    await renderStoriesModule(currentFeed, true)
    toastSuccess('Feed refreshed')
  }
}

/**
 * Set up keyboard navigation callbacks.
 */
function setupKeyboardNavigation(): void {
  setKeyboardCallbacks({
    onSelect: (index) => {
      if (currentView === 'list') {
        const stories = getCurrentStories()
        if (stories[index]) {
          const storyId = stories[index].id
          const storyCards = document.querySelectorAll('.story-card')
          const clickedEl = storyCards[index] as HTMLElement | undefined
          renderStoryDetail(storyId, clickedEl)
          window.location.hash = `item/${storyId}`
        }
      }
    },
    onOpenExternal: (index) => {
      if (currentView === 'list') {
        const stories = getCurrentStories()
        if (stories[index]) {
          const story = stories[index]
          if (story.url) {
            window.open(story.url, '_blank', 'noopener')
          } else {
            toastInfo('No external link for this story')
          }
        }
      }
    },
    onBack: async () => {
      if (isSettingsModalOpen()) {
        closeSettingsModal()
      } else if (document.getElementById('search-modal')) {
        const { closeSearchModal } = await import('./search')
        closeSearchModal()
      } else if (document.getElementById('help-modal')) {
        const { closeHelpModal } = await import('./help-modal')
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
        renderStoriesModule(currentFeed)
      } else if (currentView === 'detail') {
        const storyId = getCurrentStoryId()
        if (storyId) renderStoryDetail(storyId)
      }
    },
    onFeedChange: (feed) => {
      if (currentView === 'list' && feed !== currentFeed) {
        currentFeed = feed
        document.querySelectorAll('[data-feed]').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-feed') === feed)
        })
        renderStories(feed)
      }
    },
    onHelp: async () => {
      if (document.getElementById('help-modal')) {
        const { closeHelpModal } = await import('./help-modal')
        closeHelpModal()
      } else {
        const { showHelpModal } = await import('./help-modal')
        showHelpModal()
      }
    },
    onScrollToTop: () => {
      scrollToTop()
    },
    onSearch: async () => {
      if (document.getElementById('search-modal')) {
        const { closeSearchModal } = await import('./search')
        closeSearchModal()
      } else {
        const { showSearchModal } = await import('./search')
        showSearchModal()
      }
    },
    onFocusComments: () => {
      if (currentView !== 'detail') return

      const commentsSection = document.querySelector('.comments-section')
      if (commentsSection) {
        commentsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
        // Not in Tauri environment
      }
    },
    onCopy: async () => {
      let storyId: number | null = null

      if (currentView === 'detail') {
        storyId = getCurrentStoryId()
      } else if (currentView === 'list') {
        const stories = getCurrentStories()
        const index = getSelectedIndex()
        if (index >= 0 && stories[index]) {
          storyId = stories[index].id
        }
      }

      if (storyId) {
        const hnUrl = getHNItemUrl(storyId)
        try {
          await navigator.clipboard.writeText(hnUrl)
          toastSuccess('HN link copied to clipboard')
        } catch {
          toastError('Failed to copy link')
        }
      }
    },
    isDetailView: () => currentView === 'detail',
    onScrollVertical: (direction) => {
      const container = getScrollContainer()
      if (!container) return
      const scrollAmount = 100
      if (direction === 'down') {
        container.scrollTop += scrollAmount
      } else {
        container.scrollTop -= scrollAmount
      }
    },
    onPageScroll: (direction) => {
      const container = getScrollContainer()
      if (!container) return
      const pageAmount = container.clientHeight * 0.8
      if (direction === 'down') {
        container.scrollTop += pageAmount
      } else {
        container.scrollTop -= pageAmount
      }
    },
    onScrollToEnd: () => {
      const container = getScrollContainer()
      if (!container) return
      container.scrollTop = container.scrollHeight
    },
    onScrollToStart: () => {
      const container = getScrollContainer()
      if (!container) return
      container.scrollTop = 0
    },
  })

  initKeyboard()
}

/**
 * Set up theme toggle button.
 */
function setupThemeToggle(): void {
  const toggle = document.getElementById('theme-toggle')
  if (!toggle) return

  toggle.addEventListener('click', () => {
    toggleTheme()
  })
}

/**
 * Set up settings toggle button.
 */
function setupSettingsToggle(): void {
  const toggle = document.getElementById('settings-toggle')
  if (!toggle) return

  toggle.addEventListener('click', () => {
    showSettingsModal()
  })
}

/**
 * Main initialization function.
 */
async function main(): Promise<void> {
  // Initialize error boundary first
  initErrorBoundary()

  // Initialize settings (handles theme)
  initSettings()

  // Ensure window decorations are visible on startup
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const appWindow = getCurrentWindow()
    await appWindow.setDecorations(true)
  } catch {
    // Not in Tauri environment
  }

  // Use default feed from settings
  const settings = getSettings()
  currentFeed = settings.defaultFeed
  setCurrentFeed(currentFeed)

  try {
    await init()

    // Configure navigation callbacks
    configureNavigation({
      getCurrentView: () => currentView,
      setCurrentView: (view) => {
        currentView = view
      },
      getCurrentFeed: () => currentFeed,
      setCurrentFeed: (feed) => {
        currentFeed = feed
        setCurrentFeed(feed)
      },
      getCurrentStoryId,
      getCurrentUserId,
      getCurrentStoryData,
      renderStories,
      renderStoryDetail,
      renderUserProfile,
      navigateBackToList,
    })

    setupAllNavigation()
    setupThemeToggle()
    setupSettingsToggle()
    setupKeyboardNavigation()

    // Configure and setup pull-to-refresh
    configurePullRefresh({
      onRefresh: handlePullRefresh,
      getScrollTop: getScrollTop,
      canRefresh: () => currentView === 'list' && !isZenModeTransitioning(),
      isLoading: () => isStoryListLoading(),
    })
    setupPullToRefresh()

    // Initialize AI assistant
    initAssistant()

    // Initialize TTS (text-to-speech)
    initTtsUi()

    // Initialize offline detection
    initOfflineDetection()

    // Initialize favicon lazy loading
    initFaviconLazyLoading()

    // Initialize native notifications (requests permission if needed)
    initNotifications().then((available) => {
      if (available) {
        // Start background polling for followed story updates
        startFollowedStoriesPolling()
      }
    })

    // Configure and initialize system tray events
    configureTrayEvents({
      onFeedChange: (feed) => {
        if (currentView !== 'list' || feed === currentFeed) {
          // Navigate to list view first if needed
          if (currentView !== 'list') {
            navigateBackToList().then(() => {
              currentFeed = feed
              document.querySelectorAll('[data-feed]').forEach((btn) => {
                btn.classList.toggle(
                  'active',
                  btn.getAttribute('data-feed') === feed,
                )
              })
              renderStories(feed)
            })
          }
        } else {
          currentFeed = feed
          document.querySelectorAll('[data-feed]').forEach((btn) => {
            btn.classList.toggle(
              'active',
              btn.getAttribute('data-feed') === feed,
            )
          })
          renderStories(feed)
        }
        toastInfo(`Switched to ${getFeedDisplayName(feed)}`)
      },
      onRefresh: () => {
        if (currentView === 'list') {
          renderStoriesModule(currentFeed, true)
          toastSuccess('Feed refreshed')
        } else if (currentView === 'detail') {
          const storyId = getCurrentStoryId()
          if (storyId) {
            renderStoryDetail(storyId)
            toastSuccess('Story refreshed')
          }
        }
      },
      onSearch: async () => {
        const { showSearchModal } = await import('./search')
        showSearchModal()
      },
    })
    initTrayEvents()

    // Configure global shortcuts (Cmd+Shift+H to show, Cmd+Shift+R to refresh)
    // Note: The Rust backend handles these shortcuts; this is for any JS-only actions
    configureGlobalShortcuts({
      onShowWindow: () => {
        // Window is already shown by Rust handler
        console.log('Global shortcut: Show window triggered')
      },
      onRefresh: () => {
        // Rust handler shows window, we just refresh content
        if (currentView === 'list') {
          renderStoriesModule(currentFeed, true)
          toastSuccess('Feed refreshed')
        }
      },
    })

    // Configure deep links (pastelhn://item/123, pastelhn://user/dang, etc.)
    configureDeepLinks({
      onItem: (id) => {
        renderStoryDetail(id)
        toastInfo(`Opening story #${id}`)
      },
      onUser: (username) => {
        renderUserProfile(username)
        toastInfo(`Opening profile: ${username}`)
      },
      onFeed: (feed) => {
        if (currentView !== 'list') {
          navigateBackToList().then(() => {
            currentFeed = feed as StoryFeed
            renderStories(currentFeed)
          })
        } else {
          currentFeed = feed as StoryFeed
          renderStories(currentFeed)
        }
        toastInfo(`Switched to ${getFeedDisplayName(feed as StoryFeed)}`)
      },
      onSearch: async (query) => {
        const { showSearchModal } = await import('./search')
        showSearchModal(query)
      },
    })
    initDeepLinks()

    // Set up zen mode callback
    setZenModeChangeCallback((isActive) => {
      updateAssistantZenMode(isActive, currentView)
      const virtualScroll = getVirtualScroll()
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

    // Handle reading history cleared event
    window.addEventListener('reading-history-cleared', () => {
      clearReadStoryIds()
      if (currentView === 'list') {
        const container = document.getElementById('stories')
        if (container) {
          container.querySelectorAll('.story').forEach((storyEl) => {
            storyEl.classList.remove('story-read')
          })
        }
      }
    })

    // Set up scroll handlers
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.addEventListener(
        'scroll',
        () => {
          saveScrollPositionDebounced(
            currentView,
            currentFeed,
            getCurrentStoryId(),
          )
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

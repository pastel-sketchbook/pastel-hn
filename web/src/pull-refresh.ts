/**
 * Pull-to-refresh module
 *
 * Handles pull-to-refresh functionality for touch and mouse wheel interactions.
 * Uses a callback pattern to trigger refresh actions in the main application.
 */

// Constants
const PULL_THRESHOLD = 80 // Distance needed to trigger refresh

// Module state
let pullStartY = 0
let pullDistance = 0
let isPulling = false
let pullRefreshEnabled = true

// Callbacks and context getters
let onRefresh: (() => Promise<void>) | null = null
let getScrollTop: (() => number) | null = null
let canRefresh: (() => boolean) | null = null
let isLoadingCheck: (() => boolean) | null = null

/**
 * Configure the pull-to-refresh module with required callbacks
 */
export function configurePullRefresh(config: {
  onRefresh: () => Promise<void>
  getScrollTop: () => number
  canRefresh: () => boolean
  isLoading: () => boolean
}): void {
  onRefresh = config.onRefresh
  getScrollTop = config.getScrollTop
  canRefresh = config.canRefresh
  isLoadingCheck = config.isLoading
}

/**
 * Reset module state (primarily for testing)
 */
export function resetPullRefreshState(): void {
  pullStartY = 0
  pullDistance = 0
  isPulling = false
  pullRefreshEnabled = true
  onRefresh = null
  getScrollTop = null
  canRefresh = null
  isLoadingCheck = null
}

/**
 * Check if currently pulling
 */
export function isPullActive(): boolean {
  return isPulling
}

/**
 * Check if pull refresh is enabled
 */
export function isPullRefreshEnabled(): boolean {
  return pullRefreshEnabled
}

/**
 * Get current pull distance
 */
export function getPullDistance(): number {
  return pullDistance
}

/**
 * Get the pull threshold constant
 */
export function getPullThreshold(): number {
  return PULL_THRESHOLD
}

/**
 * Create and setup the pull-to-refresh indicator and event listeners
 */
export function setupPullToRefresh(): void {
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
      const scrollTop = getScrollTop?.() ?? 0
      const canDoRefresh = canRefresh?.() ?? false
      const loading = isLoadingCheck?.() ?? false

      if (scrollTop === 0 && canDoRefresh && !loading) {
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
      const scrollTop = getScrollTop?.() ?? 0

      if (!isPulling || scrollTop > 0) {
        isPulling = false
        updatePullIndicator(0, false)
        return
      }

      const touchY = e.touches[0].clientY
      pullDistance = Math.max(0, touchY - pullStartY)

      if (pullDistance > 0) {
        updatePullIndicator(pullDistance, false)
      }
    },
    { passive: true },
  )

  document.addEventListener('touchend', () => {
    const loading = isLoadingCheck?.() ?? false

    if (isPulling && pullDistance >= PULL_THRESHOLD && !loading) {
      triggerRefresh()
    }
    isPulling = false
    pullDistance = 0
    updatePullIndicator(0, false)
  })

  // Mouse wheel for desktop (overscroll at top)
  let wheelDeltaAccumulator = 0
  let wheelResetTimeout: ReturnType<typeof setTimeout> | null = null

  document.addEventListener(
    'wheel',
    (e) => {
      const scrollTop = getScrollTop?.() ?? 0
      const canDoRefresh = canRefresh?.() ?? false
      const loading = isLoadingCheck?.() ?? false

      // Only trigger if at top of page, scrolling up, and can refresh
      if (scrollTop === 0 && e.deltaY < 0 && canDoRefresh && !loading) {
        wheelDeltaAccumulator += Math.abs(e.deltaY)

        // Reset accumulator after a pause in scrolling
        if (wheelResetTimeout) clearTimeout(wheelResetTimeout)
        wheelResetTimeout = setTimeout(() => {
          wheelDeltaAccumulator = 0
          updatePullIndicator(0, false)
        }, 300)

        // Show visual feedback
        const progress = Math.min(
          wheelDeltaAccumulator / 2,
          PULL_THRESHOLD * 1.5,
        )
        updatePullIndicator(progress, false)

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

/**
 * Update the visual state of the pull indicator
 */
export function updatePullIndicator(distance: number, loading: boolean): void {
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
    if (loading) {
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

/**
 * Trigger the refresh action
 */
async function triggerRefresh(): Promise<void> {
  updatePullIndicator(PULL_THRESHOLD, true) // Show loading state

  if (onRefresh) {
    await onRefresh()
  }

  // Hide indicator after refresh completes
  setTimeout(() => {
    updatePullIndicator(0, false)
  }, 300)
}

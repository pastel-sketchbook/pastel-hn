/**
 * Back-to-top button module
 *
 * Provides a floating button that appears when the user scrolls down,
 * allowing them to quickly return to the top of the page.
 */

// Constants
const BACK_TO_TOP_THRESHOLD = 400 // Show button after scrolling this much

// Module state
let backToTopBtn: HTMLButtonElement | null = null

// Callbacks
let setScrollTop: ((top: number, behavior: ScrollBehavior) => void) | null =
  null
let getScrollTop: (() => number) | null = null

/**
 * Configure the back-to-top module with required callbacks
 */
export function configureBackToTop(config: {
  setScrollTop: (top: number, behavior: ScrollBehavior) => void
  getScrollTop: () => number
}): void {
  setScrollTop = config.setScrollTop
  getScrollTop = config.getScrollTop
}

/**
 * Reset module state (primarily for testing)
 */
export function resetBackToTopState(): void {
  backToTopBtn = null
  setScrollTop = null
  getScrollTop = null
}

/**
 * Get the threshold constant
 */
export function getBackToTopThreshold(): number {
  return BACK_TO_TOP_THRESHOLD
}

/**
 * Check if the back-to-top button exists
 */
export function hasBackToTopButton(): boolean {
  return backToTopBtn !== null
}

/**
 * Check if the back-to-top button is visible
 */
export function isBackToTopVisible(): boolean {
  return backToTopBtn?.classList.contains('visible') ?? false
}

/**
 * Create and setup the back-to-top button
 */
export function setupBackToTop(): void {
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

/**
 * Scroll to the top of the page with smooth animation
 */
export function scrollToTop(): void {
  setScrollTop?.(0, 'smooth')
}

/**
 * Update the visibility of the back-to-top button based on scroll position
 */
export function updateBackToTopVisibility(): void {
  if (!backToTopBtn) return

  const scrollPosition = getScrollTop?.() ?? 0

  if (scrollPosition > BACK_TO_TOP_THRESHOLD) {
    backToTopBtn.classList.add('visible')
  } else {
    backToTopBtn.classList.remove('visible')
  }
}

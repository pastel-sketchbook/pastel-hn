/**
 * Favicon lazy loading for story domains
 *
 * Uses IntersectionObserver for efficient lazy loading of domain favicons.
 * Favicons are loaded only when they enter the viewport.
 */

import { escapeHtml } from './utils'

/** Active IntersectionObserver instance */
let faviconObserver: IntersectionObserver | null = null

/**
 * Get the favicon URL for a domain using Google's favicon service
 * @param domain - The domain to get favicon for
 * @returns The favicon URL or empty string if invalid domain
 */
export function getFaviconUrl(domain: string): string {
  if (!domain) {
    return ''
  }
  // Use Google's favicon service which is reliable and fast
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`
}

/**
 * Create an HTML string for a lazy-loaded favicon image
 * @param domain - The domain to create favicon for
 * @returns HTML string for the favicon img element
 */
export function createFaviconElement(domain: string): string {
  if (!domain) {
    return ''
  }
  // Use data-domain for lazy loading - src is set by loadFavicon() when visible.
  // Inline onerror provides a defensive fallback if JS error handling fails.
  // The loadFavicon() function also sets handleFaviconError() programmatically.
  return `<img class="favicon" data-domain="${escapeHtml(domain)}" loading="lazy" width="16" height="16" alt="" aria-hidden="true" onerror="this.style.display='none';this.onerror=null;">`
}

/**
 * Handle favicon loading errors by hiding the image
 * This is the centralized error handler for all favicon load failures.
 * @param img - The img element that failed to load
 */
export function handleFaviconError(img: HTMLImageElement): void {
  img.style.display = 'none'
  img.onerror = null // Prevent infinite loops
}

/**
 * Load a favicon by setting its src from data-domain
 * @param img - The favicon img element
 */
function loadFavicon(img: HTMLImageElement): void {
  const domain = img.dataset.domain
  // Use getAttribute to avoid browser URL resolution on empty src
  if (domain && !img.getAttribute('src')) {
    // Set up error handler before setting src
    img.onerror = () => handleFaviconError(img)
    img.src = getFaviconUrl(domain)
  }
}

/**
 * Load all favicon elements immediately (fallback when IntersectionObserver unavailable)
 */
function loadAllFaviconsImmediately(): void {
  const favicons = document.querySelectorAll<HTMLImageElement>(
    '.favicon[data-domain]:not([src])',
  )
  for (const img of favicons) {
    loadFavicon(img)
  }
}

/**
 * Initialize favicon lazy loading with IntersectionObserver
 * Call this once when the app starts.
 * Falls back to loading all favicons immediately if IntersectionObserver is unavailable.
 */
export function initFaviconLazyLoading(): void {
  // Clean up any existing observer
  destroyFaviconLazyLoading()

  // Fallback for older browsers without IntersectionObserver
  if (typeof IntersectionObserver === 'undefined') {
    loadAllFaviconsImmediately()
    return
  }

  // Create observer with generous rootMargin for preloading
  faviconObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement
          loadFavicon(img)
          faviconObserver?.unobserve(img)
        }
      }
    },
    {
      // Load favicons when they're within 200px of viewport
      rootMargin: '200px',
      threshold: 0,
    },
  )

  // Observe all existing favicon elements
  observeNewFavicons()
}

/**
 * Observe any new favicon elements that haven't been observed yet
 * Call this after dynamically adding content with favicons
 */
export function observeNewFavicons(): void {
  if (!faviconObserver) {
    return
  }

  const favicons = document.querySelectorAll<HTMLImageElement>(
    '.favicon[data-domain]:not([src])',
  )
  for (const img of favicons) {
    faviconObserver.observe(img)
  }
}

/**
 * Clean up the favicon observer
 * Call this when cleaning up the app
 */
export function destroyFaviconLazyLoading(): void {
  if (faviconObserver) {
    faviconObserver.disconnect()
    faviconObserver = null
  }
}

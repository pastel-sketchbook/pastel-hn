/**
 * Animation utilities for view transitions
 * Handles smooth animations between list and detail views
 */

import { prefersReducedMotion } from './utils'
import { isZenModeActive } from './zen-mode'

/** Animation duration in ms - matches CSS animation duration */
export const TRANSITION_DURATION = 350

/**
 * Animate stories away when navigating to detail view
 * - Stories above the clicked one slide up
 * - Stories below the clicked one slide down
 * - Clicked story fades out
 *
 * Note: Animations are skipped in zen mode to prevent layout conflicts
 * with the fixed positioning used in zen mode
 */
export async function animateStoriesAway(
  clickedStoryEl: HTMLElement,
): Promise<void> {
  if (prefersReducedMotion()) return
  if (isZenModeActive()) return

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
 *
 * Note: Animations are skipped in zen mode to prevent layout conflicts
 * with the fixed positioning used in zen mode
 */
export async function animateDetailEnter(
  container: HTMLElement,
): Promise<void> {
  if (prefersReducedMotion()) return
  if (isZenModeActive()) return

  container.classList.add('view-transition', 'view-enter-from-bottom')
  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION))
  container.classList.remove('view-transition', 'view-enter-from-bottom')
}

/**
 * Animate detail view exiting (going back to list)
 *
 * Note: Animations are skipped in zen mode to prevent layout conflicts
 * with the fixed positioning used in zen mode
 */
export async function animateDetailExit(container: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return
  if (isZenModeActive()) return

  container.classList.add('view-transition', 'view-fade-out')
  await new Promise((resolve) => setTimeout(resolve, 200))
  container.classList.remove('view-transition', 'view-fade-out')
}

/**
 * Animate list view entering (coming back from detail)
 */
export async function animateListEnter(container: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return

  container.classList.add('view-transition', 'view-enter-from-top')
  await new Promise((resolve) => setTimeout(resolve, TRANSITION_DURATION))
  container.classList.remove('view-transition', 'view-enter-from-top')
}

/**
 * Apply staggered animation to list items for visual interest
 */
export function applyStaggerAnimation(
  container: HTMLElement,
  selector: string,
): void {
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  if (reducedMotion) return

  const items = container.querySelectorAll(selector)
  items.forEach((item, index) => {
    if (index < 10) {
      // Only stagger first 10
      item.classList.add('stagger-in')
    }
  })
}

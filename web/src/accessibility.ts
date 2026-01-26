/**
 * Accessibility utilities for screen reader support
 */

const ANNOUNCEMENT_CLEAR_DELAY = 1000

/**
 * Announce a message to screen readers via ARIA live region.
 * The message is announced and then cleared after a delay to allow
 * the same message to be re-announced if needed.
 */
export function announce(message: string): void {
  const announcer = document.getElementById('announcer')
  if (announcer) {
    announcer.textContent = message
    // Clear after a delay to allow re-announcement of same message
    setTimeout(() => {
      announcer.textContent = ''
    }, ANNOUNCEMENT_CLEAR_DELAY)
  }
}

/**
 * Escape a string for safe use in HTML attribute values.
 * This escapes: &, <, >, ", '
 */
export function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

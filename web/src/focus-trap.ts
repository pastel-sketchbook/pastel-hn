/**
 * Focus trap utility for modals
 * Keeps focus within a container when navigating with Tab/Shift+Tab
 */

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface FocusTrapInstance {
  activate: () => void
  deactivate: () => void
}

/**
 * Create a focus trap for a container element
 * Call activate() to start trapping, deactivate() to stop
 */
export function createFocusTrap(container: HTMLElement): FocusTrapInstance {
  let previouslyFocusedElement: Element | null = null
  let handleKeyDown: ((e: KeyboardEvent) => void) | null = null

  function getFocusableElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
      .filter(el => {
        // Check if element is visible
        const style = window.getComputedStyle(el)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
  }

  function activate(): void {
    // Store currently focused element to restore later
    previouslyFocusedElement = document.activeElement

    // Focus first focusable element in container
    const focusableElements = getFocusableElements()
    if (focusableElements.length > 0) {
      focusableElements[0].focus()
    }

    // Handle Tab/Shift+Tab to trap focus
    handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        // Shift+Tab: go backwards
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab: go forwards
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
  }

  function deactivate(): void {
    // Remove keydown listener
    if (handleKeyDown) {
      document.removeEventListener('keydown', handleKeyDown)
      handleKeyDown = null
    }

    // Restore focus to previously focused element
    if (previouslyFocusedElement && previouslyFocusedElement instanceof HTMLElement) {
      previouslyFocusedElement.focus()
    }
    previouslyFocusedElement = null
  }

  return { activate, deactivate }
}

/**
 * Simple focus trap that automatically cleans up when the container is removed
 * Use this when you want fire-and-forget focus trapping
 */
export function trapFocus(container: HTMLElement): () => void {
  const trap = createFocusTrap(container)
  trap.activate()
  return trap.deactivate
}

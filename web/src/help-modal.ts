/**
 * Help modal showing keyboard shortcuts
 */
import { createFocusTrap, type FocusTrapInstance } from './focus-trap'
import { KEYBOARD_SHORTCUTS } from './keyboard'

// Help modal state
let helpModalOpen = false
let helpModalFocusTrap: FocusTrapInstance | null = null

/**
 * Check if help modal is currently open
 */
export function isHelpModalOpen(): boolean {
  return helpModalOpen
}

/**
 * Show the help modal with keyboard shortcuts
 */
export function showHelpModal(): void {
  if (helpModalOpen) return
  helpModalOpen = true

  const modal = document.createElement('div')
  modal.className = 'help-modal-overlay'
  modal.innerHTML = `
    <div class="help-modal cyber-frame">
      <span class="corner-tr"></span>
      <span class="corner-bl"></span>
      <h2 class="help-modal-title">Keyboard Shortcuts</h2>
      <div class="help-shortcuts">
        ${KEYBOARD_SHORTCUTS.map(
          (s) => `
          <div class="help-shortcut">
            <kbd>${s.key}</kbd>
            <span>${s.description}</span>
          </div>
        `,
        ).join('')}
      </div>
      <button class="help-close-btn" data-action="close-help">Close (Esc)</button>
    </div>
  `

  document.body.appendChild(modal)

  // Set up focus trap
  const modalContent = modal.querySelector('.help-modal') as HTMLElement
  if (modalContent) {
    helpModalFocusTrap = createFocusTrap(modalContent)
    helpModalFocusTrap.activate()
  }

  // Close on click outside or escape
  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === modal || target.closest('[data-action="close-help"]')) {
      closeHelpModal()
    }
  })
}

/**
 * Close the help modal
 */
export function closeHelpModal(): void {
  // Deactivate focus trap first
  if (helpModalFocusTrap) {
    helpModalFocusTrap.deactivate()
    helpModalFocusTrap = null
  }

  const modal = document.querySelector('.help-modal-overlay')
  if (modal) {
    modal.remove()
    helpModalOpen = false
  }
}

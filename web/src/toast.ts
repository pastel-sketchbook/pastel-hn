/**
 * Toast notification system for user feedback
 */

import { escapeHtml } from './utils'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

interface ToastOptions {
  message: string
  type?: ToastType
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface Toast extends ToastOptions {
  id: string
  element: HTMLElement
  timeoutId?: ReturnType<typeof setTimeout>
}

const DEFAULT_DURATION = 4000
const TOAST_GAP = 8

let toastContainer: HTMLElement | null = null
const activeToasts: Toast[] = []

// SVG icons for toast types
const toastIcons: Record<ToastType, string> = {
  info: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  success: `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  warning: `<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
}

/**
 * Initialize the toast container
 */
function initContainer(): HTMLElement {
  if (toastContainer) return toastContainer

  toastContainer = document.createElement('div')
  toastContainer.className = 'toast-container'
  toastContainer.setAttribute('role', 'region')
  toastContainer.setAttribute('aria-label', 'Notifications')
  document.body.appendChild(toastContainer)

  return toastContainer
}

/**
 * Generate a unique ID for a toast
 */
function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Create a toast element
 */
function createToastElement(options: ToastOptions, id: string): HTMLElement {
  const { message, type = 'info', action } = options

  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.id = id
  toast.setAttribute('role', 'alert')
  toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')

  const iconHtml = toastIcons[type]

  toast.innerHTML = `
    <div class="toast-icon">${iconHtml}</div>
    <div class="toast-content">
      <span class="toast-message">${escapeHtml(message)}</span>
      ${
        action
          ? `<button class="toast-action" data-action="toast-action">${escapeHtml(action.label)}</button>`
          : ''
      }
    </div>
    <button class="toast-close" data-action="toast-close" aria-label="Dismiss notification">
      <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `

  return toast
}

/**
 * Update toast positions after one is removed
 */
function updatePositions(): void {
  let offset = 0
  for (const toast of activeToasts) {
    toast.element.style.setProperty('--toast-offset', `-${offset}px`)
    offset += toast.element.offsetHeight + TOAST_GAP
  }
}

/**
 * Remove a toast by ID
 */
function removeToast(id: string): void {
  const index = activeToasts.findIndex((t) => t.id === id)
  if (index === -1) return

  const toast = activeToasts[index]

  // Clear timeout if exists
  if (toast.timeoutId) {
    clearTimeout(toast.timeoutId)
  }

  // Animate out
  toast.element.classList.add('toast-exit')

  // Remove from active list immediately so others can slide down
  activeToasts.splice(index, 1)
  updatePositions()

  // Remove after animation
  setTimeout(() => {
    toast.element.remove()
  }, 200)
}

/**
 * Show a toast notification
 */
export function showToast(options: ToastOptions): string {
  const container = initContainer()
  const id = generateId()
  const duration = options.duration ?? DEFAULT_DURATION

  const element = createToastElement(options, id)

  // Add click handlers
  element.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    if (target.closest('[data-action="toast-close"]')) {
      removeToast(id)
      return
    }

    if (target.closest('[data-action="toast-action"]') && options.action) {
      options.action.onClick()
      removeToast(id)
    }
  })

  // Add to container
  container.appendChild(element)

  // Calculate initial position
  let offset = 0
  for (const toast of activeToasts) {
    offset += toast.element.offsetHeight + TOAST_GAP
  }
  element.style.setProperty('--toast-offset', `-${offset}px`)

  // Trigger enter animation
  requestAnimationFrame(() => {
    element.classList.add('toast-enter')
  })

  // Create toast object
  const toast: Toast = {
    ...options,
    id,
    element,
  }

  // Auto-dismiss after duration (unless duration is 0)
  if (duration > 0) {
    toast.timeoutId = setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  activeToasts.push(toast)

  return id
}

/**
 * Show an info toast
 */
export function toastInfo(message: string, duration?: number): string {
  return showToast({ message, type: 'info', duration })
}

/**
 * Show a success toast
 */
export function toastSuccess(message: string, duration?: number): string {
  return showToast({ message, type: 'success', duration })
}

/**
 * Show a warning toast
 */
export function toastWarning(message: string, duration?: number): string {
  return showToast({ message, type: 'warning', duration })
}

/**
 * Show an error toast
 */
export function toastError(message: string, duration?: number): string {
  return showToast({ message, type: 'error', duration })
}

/**
 * Dismiss a toast by ID
 */
export function dismissToast(id: string): void {
  removeToast(id)
}

/**
 * Dismiss all toasts
 */
export function dismissAllToasts(): void {
  for (const toast of [...activeToasts]) {
    removeToast(toast.id)
  }
}

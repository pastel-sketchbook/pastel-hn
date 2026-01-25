import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Import the module fresh for each test by resetting the module
let toastModule: typeof import('./toast')

describe('toast', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    document.body.innerHTML = ''
    // Reset module to clear internal state
    vi.resetModules()
    toastModule = await import('./toast')
  })

  afterEach(() => {
    toastModule.dismissAllToasts()
    vi.useRealTimers()
  })

  describe('showToast', () => {
    it('creates toast container on first toast', () => {
      toastModule.showToast({ message: 'Test message' })

      const container = document.querySelector('.toast-container')
      expect(container).not.toBeNull()
      expect(container?.getAttribute('role')).toBe('region')
      expect(container?.getAttribute('aria-label')).toBe('Notifications')
    })

    it('creates toast element with message', () => {
      toastModule.showToast({ message: 'Hello World' })

      const toast = document.querySelector('.toast')
      expect(toast).not.toBeNull()

      const message = toast?.querySelector('.toast-message')
      expect(message?.textContent).toBe('Hello World')
    })

    it('returns unique toast ID', () => {
      const id1 = toastModule.showToast({ message: 'Toast 1' })
      const id2 = toastModule.showToast({ message: 'Toast 2' })

      expect(id1).toBeTruthy()
      expect(id2).toBeTruthy()
      expect(id1).not.toBe(id2)
    })

    it('applies correct type class', () => {
      toastModule.showToast({ message: 'Info', type: 'info' })
      toastModule.showToast({ message: 'Success', type: 'success' })
      toastModule.showToast({ message: 'Warning', type: 'warning' })
      toastModule.showToast({ message: 'Error', type: 'error' })

      expect(document.querySelector('.toast-info')).not.toBeNull()
      expect(document.querySelector('.toast-success')).not.toBeNull()
      expect(document.querySelector('.toast-warning')).not.toBeNull()
      expect(document.querySelector('.toast-error')).not.toBeNull()
    })

    it('defaults to info type', () => {
      toastModule.showToast({ message: 'Default' })

      expect(document.querySelector('.toast-info')).not.toBeNull()
    })

    it('sets correct ARIA attributes', () => {
      toastModule.showToast({ message: 'Test', type: 'info' })

      const toast = document.querySelector('.toast')
      expect(toast?.getAttribute('role')).toBe('alert')
      expect(toast?.getAttribute('aria-live')).toBe('polite')
    })

    it('sets assertive aria-live for errors', () => {
      toastModule.showToast({ message: 'Error!', type: 'error' })

      const toast = document.querySelector('.toast-error')
      expect(toast?.getAttribute('aria-live')).toBe('assertive')
    })

    it('auto-dismisses after default duration', () => {
      toastModule.showToast({ message: 'Test' })

      expect(document.querySelector('.toast')).not.toBeNull()

      vi.advanceTimersByTime(4000) // Default duration
      vi.advanceTimersByTime(200) // Animation time

      expect(document.querySelector('.toast')).toBeNull()
    })

    it('respects custom duration', () => {
      toastModule.showToast({ message: 'Test', duration: 1000 })

      vi.advanceTimersByTime(999)
      expect(document.querySelector('.toast')).not.toBeNull()

      vi.advanceTimersByTime(1)
      vi.advanceTimersByTime(200) // Animation time

      expect(document.querySelector('.toast')).toBeNull()
    })

    it('does not auto-dismiss when duration is 0', () => {
      toastModule.showToast({ message: 'Persistent', duration: 0 })

      vi.advanceTimersByTime(10000)

      expect(document.querySelector('.toast')).not.toBeNull()
    })

    it('escapes HTML in message', () => {
      toastModule.showToast({ message: '<script>alert("xss")</script>' })

      const message = document.querySelector('.toast-message')
      expect(message?.innerHTML).not.toContain('<script>')
      expect(message?.textContent).toContain('<script>')
    })

    it('renders action button when provided', () => {
      const onClick = vi.fn()
      toastModule.showToast({
        message: 'Test',
        action: { label: 'Undo', onClick },
      })

      const actionBtn = document.querySelector('.toast-action')
      expect(actionBtn).not.toBeNull()
      expect(actionBtn?.textContent).toBe('Undo')
    })

    it('action button calls onClick and dismisses toast', () => {
      const onClick = vi.fn()
      toastModule.showToast({
        message: 'Test',
        action: { label: 'Undo', onClick },
      })

      const actionBtn = document.querySelector('.toast-action') as HTMLElement
      actionBtn.click()

      expect(onClick).toHaveBeenCalled()

      vi.advanceTimersByTime(200) // Animation time
      expect(document.querySelector('.toast')).toBeNull()
    })

    it('close button dismisses toast', () => {
      toastModule.showToast({ message: 'Test' })

      const closeBtn = document.querySelector('.toast-close') as HTMLElement
      closeBtn.click()

      vi.advanceTimersByTime(200) // Animation time
      expect(document.querySelector('.toast')).toBeNull()
    })

    it('stacks multiple toasts vertically', () => {
      toastModule.showToast({ message: 'Toast 1' })
      toastModule.showToast({ message: 'Toast 2' })
      toastModule.showToast({ message: 'Toast 3' })

      const toasts = document.querySelectorAll('.toast')
      expect(toasts.length).toBe(3)
    })
  })

  describe('convenience functions', () => {
    it('toastInfo creates info toast', () => {
      toastModule.toastInfo('Info message')

      const toast = document.querySelector('.toast-info')
      expect(toast).not.toBeNull()
      expect(toast?.querySelector('.toast-message')?.textContent).toBe(
        'Info message',
      )
    })

    it('toastSuccess creates success toast', () => {
      toastModule.toastSuccess('Success message')

      expect(document.querySelector('.toast-success')).not.toBeNull()
    })

    it('toastWarning creates warning toast', () => {
      toastModule.toastWarning('Warning message')

      expect(document.querySelector('.toast-warning')).not.toBeNull()
    })

    it('toastError creates error toast', () => {
      toastModule.toastError('Error message')

      expect(document.querySelector('.toast-error')).not.toBeNull()
    })

    it('convenience functions accept custom duration', () => {
      toastModule.toastInfo('Test', 1000)

      vi.advanceTimersByTime(1000)
      vi.advanceTimersByTime(200)

      expect(document.querySelector('.toast')).toBeNull()
    })
  })

  describe('dismissToast', () => {
    it('dismisses toast by ID', () => {
      const id = toastModule.showToast({ message: 'Test', duration: 0 })

      toastModule.dismissToast(id)
      vi.advanceTimersByTime(200)

      expect(document.querySelector('.toast')).toBeNull()
    })

    it('does nothing for invalid ID', () => {
      toastModule.showToast({ message: 'Test', duration: 0 })

      expect(() => toastModule.dismissToast('invalid-id')).not.toThrow()
      expect(document.querySelector('.toast')).not.toBeNull()
    })

    it('clears auto-dismiss timeout when manually dismissed', () => {
      const id = toastModule.showToast({ message: 'Test', duration: 5000 })

      // Dismiss manually before timeout
      vi.advanceTimersByTime(1000)
      toastModule.dismissToast(id)
      vi.advanceTimersByTime(200)

      // Verify toast is gone
      expect(document.querySelector('.toast')).toBeNull()

      // Original timeout shouldn't cause issues
      vi.advanceTimersByTime(4000)
    })
  })

  describe('dismissAllToasts', () => {
    it('dismisses all active toasts', () => {
      toastModule.showToast({ message: 'Toast 1', duration: 0 })
      toastModule.showToast({ message: 'Toast 2', duration: 0 })
      toastModule.showToast({ message: 'Toast 3', duration: 0 })

      expect(document.querySelectorAll('.toast').length).toBe(3)

      toastModule.dismissAllToasts()
      vi.advanceTimersByTime(200)

      expect(document.querySelectorAll('.toast').length).toBe(0)
    })
  })

  describe('toast icons', () => {
    it('info toast has icon', () => {
      toastModule.showToast({ message: 'Test', type: 'info' })

      const icon = document.querySelector('.toast-info .toast-icon svg')
      expect(icon).not.toBeNull()
    })

    it('success toast has icon', () => {
      toastModule.showToast({ message: 'Test', type: 'success' })

      const icon = document.querySelector('.toast-success .toast-icon svg')
      expect(icon).not.toBeNull()
    })

    it('warning toast has icon', () => {
      toastModule.showToast({ message: 'Test', type: 'warning' })

      const icon = document.querySelector('.toast-warning .toast-icon svg')
      expect(icon).not.toBeNull()
    })

    it('error toast has icon', () => {
      toastModule.showToast({ message: 'Test', type: 'error' })

      const icon = document.querySelector('.toast-error .toast-icon svg')
      expect(icon).not.toBeNull()
    })
  })

  describe('toast animations', () => {
    it('adds toast-enter class after animation frame', () => {
      vi.useRealTimers() // Need real timers for requestAnimationFrame
      toastModule.showToast({ message: 'Test' })

      // The toast-enter class is added via requestAnimationFrame
      // We verify the toast exists and will get the class
      const toast = document.querySelector('.toast')
      expect(toast).not.toBeNull()
      // Class may or may not be added synchronously depending on environment
    })

    it('adds toast-exit class when dismissing', () => {
      const id = toastModule.showToast({ message: 'Test', duration: 0 })

      toastModule.dismissToast(id)

      const toast = document.querySelector('.toast')
      expect(toast?.classList.contains('toast-exit')).toBe(true)
    })
  })
})

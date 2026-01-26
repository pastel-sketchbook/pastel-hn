import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the toast module before importing error-boundary
vi.mock('./toast', () => ({
  toastError: vi.fn(),
}))

import {
  clearStoredErrors,
  getRecentErrors,
  initErrorBoundary,
  resetErrorBoundaryState,
  safeExecute,
  withErrorBoundary,
} from './error-boundary'
import { toastError } from './toast'

describe('error-boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetErrorBoundaryState()

    // Clean up any error boundary overlays
    const overlay = document.getElementById('error-boundary-overlay')
    if (overlay) overlay.remove()

    // Remove any styles added by the error boundary
    document.querySelectorAll('style').forEach((style) => {
      if (style.textContent?.includes('error-boundary')) {
        style.remove()
      }
    })
  })

  afterEach(() => {
    // Reset window.onerror
    window.onerror = null

    // Clean up overlays
    const overlay = document.getElementById('error-boundary-overlay')
    if (overlay) overlay.remove()
  })

  describe('initErrorBoundary', () => {
    it('sets up window.onerror handler', () => {
      expect(window.onerror).toBeNull()
      initErrorBoundary()
      expect(window.onerror).not.toBeNull()
    })

    it('logs initialization message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      initErrorBoundary()
      expect(consoleSpy).toHaveBeenCalledWith('[ErrorBoundary] Initialized')
      consoleSpy.mockRestore()
    })
  })

  describe('getRecentErrors', () => {
    it('returns empty array initially', () => {
      expect(getRecentErrors()).toEqual([])
    })

    it('returns copy of errors array', () => {
      const errors = getRecentErrors()
      errors.push({
        message: 'test',
        timestamp: Date.now(),
        userAgent: 'test',
      })
      expect(getRecentErrors()).toEqual([])
    })
  })

  describe('clearStoredErrors', () => {
    it('clears all stored errors', () => {
      // Trigger an error via withErrorBoundary to store it
      const failing = withErrorBoundary(async () => {
        throw new Error('test error')
      }, 'Test')

      void failing()

      // Wait for async
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(getRecentErrors().length).toBeGreaterThan(0)
          clearStoredErrors()
          expect(getRecentErrors()).toEqual([])
          resolve()
        }, 10)
      })
    })
  })

  describe('withErrorBoundary', () => {
    it('returns result on success', async () => {
      const fn = withErrorBoundary(async () => 42, 'Test')
      const result = await fn()
      expect(result).toBe(42)
    })

    it('passes arguments to wrapped function', async () => {
      const fn = withErrorBoundary(async (a: number, b: number) => a + b, 'Add')
      const result = await fn(2, 3)
      expect(result).toBe(5)
    })

    it('returns undefined on error', async () => {
      const fn = withErrorBoundary(async () => {
        throw new Error('test')
      }, 'Test')
      const result = await fn()
      expect(result).toBeUndefined()
    })

    it('shows toast on error', async () => {
      const fn = withErrorBoundary(async () => {
        throw new Error('test')
      }, 'Load data')
      await fn()
      expect(toastError).toHaveBeenCalledWith('Failed to load data')
    })

    it('logs error to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const fn = withErrorBoundary(async () => {
        throw new Error('test error')
      }, 'Test')
      await fn()
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ErrorBoundary] Error in Test:',
        expect.any(Error),
      )
      consoleSpy.mockRestore()
    })

    it('stores error report', async () => {
      const fn = withErrorBoundary(async () => {
        throw new Error('stored error')
      }, 'Test')
      await fn()

      const errors = getRecentErrors()
      expect(errors.length).toBe(1)
      expect(errors[0].message).toContain('stored error')
    })
  })

  describe('safeExecute', () => {
    it('returns result on success', () => {
      const result = safeExecute(() => 42, 'Test')
      expect(result).toBe(42)
    })

    it('returns fallback on error', () => {
      const result = safeExecute(
        () => {
          throw new Error('test')
        },
        'Test',
        'fallback',
      )
      expect(result).toBe('fallback')
    })

    it('returns undefined on error with no fallback', () => {
      const result = safeExecute(() => {
        throw new Error('test')
      }, 'Test')
      expect(result).toBeUndefined()
    })

    it('shows toast on error', () => {
      safeExecute(() => {
        throw new Error('test')
      }, 'Parse data')
      expect(toastError).toHaveBeenCalledWith('Failed to parse data')
    })

    it('logs error to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      safeExecute(() => {
        throw new Error('sync error')
      }, 'Test')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ErrorBoundary] Error in Test:',
        expect.any(Error),
      )
      consoleSpy.mockRestore()
    })

    it('stores error report', () => {
      safeExecute(() => {
        throw new Error('sync stored error')
      }, 'Test')

      const errors = getRecentErrors()
      expect(errors.length).toBe(1)
      expect(errors[0].message).toContain('sync stored error')
    })
  })

  describe('error report structure', () => {
    it('includes all required fields', async () => {
      const fn = withErrorBoundary(async () => {
        throw new Error('detailed error')
      }, 'Context')
      await fn()

      const errors = getRecentErrors()
      expect(errors.length).toBe(1)

      const report = errors[0]
      expect(report.message).toContain('Context')
      expect(report.message).toContain('detailed error')
      expect(report.timestamp).toBeGreaterThan(0)
      expect(report.userAgent).toBe(navigator.userAgent)
    })

    it('includes stack trace when available', async () => {
      const fn = withErrorBoundary(async () => {
        throw new Error('with stack')
      }, 'Context')
      await fn()

      const errors = getRecentErrors()
      expect(errors[0].stack).toBeDefined()
      expect(errors[0].stack).toContain('Error')
    })
  })

  describe('max stored errors', () => {
    it('limits stored errors to 10', async () => {
      // Generate 15 errors
      for (let i = 0; i < 15; i++) {
        const fn = withErrorBoundary(async () => {
          throw new Error(`error ${i}`)
        }, 'Test')
        await fn()
      }

      const errors = getRecentErrors()
      expect(errors.length).toBe(10)
      // Should have the last 10 errors (5-14)
      expect(errors[0].message).toContain('error 5')
      expect(errors[9].message).toContain('error 14')
    })
  })

  describe('global error handler', () => {
    it('handles window.onerror calls', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      initErrorBoundary()

      // Simulate a global error
      const result = window.onerror?.(
        'Test global error',
        'test.js',
        10,
        5,
        new Error('test'),
      )

      expect(result).toBe(true) // Should prevent default handling
      expect(consoleSpy).toHaveBeenCalled()

      const errors = getRecentErrors()
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[errors.length - 1].message).toBe('Test global error')

      consoleSpy.mockRestore()
    })

    it('shows toast for non-severe errors', () => {
      initErrorBoundary()

      window.onerror?.(
        'Minor error in component',
        'component.js',
        10,
        5,
        new Error('minor'),
      )

      expect(toastError).toHaveBeenCalledWith('An unexpected error occurred')
    })
  })

  describe('crash overlay', () => {
    it('shows overlay for severe errors (SyntaxError)', () => {
      initErrorBoundary()

      window.onerror?.(
        'SyntaxError: Unexpected token',
        'main.js',
        1,
        1,
        new Error('SyntaxError'),
      )

      const overlay = document.getElementById('error-boundary-overlay')
      expect(overlay).not.toBeNull()
      expect(overlay?.textContent).toContain('Something went wrong')
    })

    it('shows overlay for main.ts errors', () => {
      initErrorBoundary()

      window.onerror?.(
        'Error in main',
        'main.ts',
        100,
        1,
        new Error('main error'),
      )

      const overlay = document.getElementById('error-boundary-overlay')
      expect(overlay).not.toBeNull()
    })

    it('has accessible attributes', () => {
      initErrorBoundary()

      window.onerror?.(
        'SyntaxError: test',
        'main.js',
        1,
        1,
        new Error('test'),
      )

      const overlay = document.getElementById('error-boundary-overlay')
      expect(overlay?.getAttribute('role')).toBe('alertdialog')
      expect(overlay?.getAttribute('aria-modal')).toBe('true')
      expect(overlay?.getAttribute('aria-labelledby')).toBe(
        'error-boundary-title',
      )
    })

    it('refresh button reloads page', () => {
      const reloadMock = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      })

      initErrorBoundary()
      window.onerror?.('SyntaxError: test', 'main.js', 1, 1, new Error('test'))

      const refreshBtn = document.querySelector(
        '[data-action="refresh"]',
      ) as HTMLButtonElement
      refreshBtn?.click()

      expect(reloadMock).toHaveBeenCalled()
    })

    it('dismiss button removes overlay', () => {
      initErrorBoundary()
      window.onerror?.('SyntaxError: test', 'main.js', 1, 1, new Error('test'))

      expect(document.getElementById('error-boundary-overlay')).not.toBeNull()

      const dismissBtn = document.querySelector(
        '[data-action="dismiss"]',
      ) as HTMLButtonElement
      dismissBtn?.click()

      expect(document.getElementById('error-boundary-overlay')).toBeNull()
    })

    it('toggle shows/hides technical details', () => {
      initErrorBoundary()
      window.onerror?.('SyntaxError: test', 'main.js', 1, 1, new Error('test'))

      const toggle = document.querySelector(
        '.error-boundary-toggle',
      ) as HTMLButtonElement
      const stack = document.querySelector(
        '.error-boundary-stack',
      ) as HTMLPreElement

      expect(stack.hidden).toBe(true)
      expect(toggle.getAttribute('aria-expanded')).toBe('false')

      toggle.click()

      expect(stack.hidden).toBe(false)
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      expect(toggle.textContent).toBe('Hide technical details')

      toggle.click()

      expect(stack.hidden).toBe(true)
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    })

    it('only shows one overlay at a time', () => {
      initErrorBoundary()

      // Trigger multiple severe errors
      window.onerror?.('SyntaxError: 1', 'main.js', 1, 1, new Error('1'))
      window.onerror?.('SyntaxError: 2', 'main.js', 1, 1, new Error('2'))

      const overlays = document.querySelectorAll('#error-boundary-overlay')
      expect(overlays.length).toBe(1)
    })
  })
})

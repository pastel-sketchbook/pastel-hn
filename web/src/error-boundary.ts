/**
 * Error boundary module to catch uncaught errors and prevent full app crashes
 *
 * Provides global error handling for:
 * - Uncaught exceptions (window.onerror)
 * - Unhandled promise rejections
 * - Module-level error recovery
 */

import { toastError } from './toast'

export interface ErrorReport {
  message: string
  source?: string
  lineno?: number
  colno?: number
  stack?: string
  timestamp: number
  userAgent: string
}

// Store recent errors for debugging (max 10)
const recentErrors: ErrorReport[] = []
const MAX_STORED_ERRORS = 10

// Track if we've shown a crash overlay to avoid duplicates
let crashOverlayShown = false

// Count of errors within a time window to detect error storms
let errorCount = 0
let errorWindowStart = Date.now()
const ERROR_WINDOW_MS = 5000
const MAX_ERRORS_PER_WINDOW = 5

/**
 * Create an error report from various error sources
 */
function createErrorReport(
  message: string,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
): ErrorReport {
  return {
    message,
    source,
    lineno,
    colno,
    stack: error?.stack,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  }
}

/**
 * Store an error report for debugging
 */
function storeError(report: ErrorReport): void {
  recentErrors.push(report)
  if (recentErrors.length > MAX_STORED_ERRORS) {
    recentErrors.shift()
  }
}

/**
 * Check if we're in an error storm (too many errors too quickly)
 */
function isErrorStorm(): boolean {
  const now = Date.now()

  // Reset window if it's expired
  if (now - errorWindowStart > ERROR_WINDOW_MS) {
    errorCount = 0
    errorWindowStart = now
  }

  errorCount++
  return errorCount > MAX_ERRORS_PER_WINDOW
}

/**
 * Show a crash overlay for severe/unrecoverable errors
 */
function showCrashOverlay(report: ErrorReport): void {
  if (crashOverlayShown) return
  crashOverlayShown = true

  // Create overlay
  const overlay = document.createElement('div')
  overlay.id = 'error-boundary-overlay'
  overlay.setAttribute('role', 'alertdialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'error-boundary-title')
  overlay.setAttribute('aria-describedby', 'error-boundary-desc')

  overlay.innerHTML = `
    <div class="error-boundary-content">
      <h2 id="error-boundary-title">Something went wrong</h2>
      <p id="error-boundary-desc">
        An unexpected error occurred. You can try refreshing the page or continue using the app.
      </p>
      <div class="error-boundary-details">
        <button class="error-boundary-toggle" aria-expanded="false">
          Show technical details
        </button>
        <pre class="error-boundary-stack" hidden>${escapeForHtml(report.stack || report.message)}</pre>
      </div>
      <div class="error-boundary-actions">
        <button class="error-boundary-btn primary" data-action="refresh">
          Refresh Page
        </button>
        <button class="error-boundary-btn secondary" data-action="dismiss">
          Dismiss
        </button>
      </div>
    </div>
  `

  // Add styles inline to ensure they're always available
  const style = document.createElement('style')
  style.textContent = `
    #error-boundary-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 1rem;
    }

    .error-boundary-content {
      background: var(--bg-secondary, #1a1a2e);
      border: 1px solid var(--border-color, #333);
      border-radius: 12px;
      padding: 2rem;
      max-width: 500px;
      width: 100%;
      color: var(--text-primary, #fff);
    }

    .error-boundary-content h2 {
      margin: 0 0 1rem;
      font-size: 1.5rem;
      color: var(--accent-error, #ff6b6b);
    }

    .error-boundary-content p {
      margin: 0 0 1.5rem;
      line-height: 1.6;
      color: var(--text-secondary, #aaa);
    }

    .error-boundary-details {
      margin-bottom: 1.5rem;
    }

    .error-boundary-toggle {
      background: none;
      border: none;
      color: var(--accent-primary, #00d9ff);
      cursor: pointer;
      padding: 0;
      font-size: 0.875rem;
      text-decoration: underline;
    }

    .error-boundary-toggle:hover {
      opacity: 0.8;
    }

    .error-boundary-stack {
      margin-top: 0.75rem;
      padding: 1rem;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      font-size: 0.75rem;
      overflow-x: auto;
      max-height: 200px;
      white-space: pre-wrap;
      word-break: break-all;
      color: var(--text-secondary, #aaa);
    }

    .error-boundary-actions {
      display: flex;
      gap: 0.75rem;
    }

    .error-boundary-btn {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .error-boundary-btn:hover {
      opacity: 0.9;
    }

    .error-boundary-btn.primary {
      background: var(--accent-primary, #00d9ff);
      color: #000;
      border: none;
    }

    .error-boundary-btn.secondary {
      background: transparent;
      color: var(--text-primary, #fff);
      border: 1px solid var(--border-color, #333);
    }
  `

  document.head.appendChild(style)
  document.body.appendChild(overlay)

  // Handle actions
  overlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const action = target.dataset.action

    if (action === 'refresh') {
      window.location.reload()
    } else if (action === 'dismiss') {
      overlay.remove()
      style.remove()
      crashOverlayShown = false
    }

    // Toggle details
    if (target.classList.contains('error-boundary-toggle')) {
      const stack = overlay.querySelector(
        '.error-boundary-stack',
      ) as HTMLPreElement | null
      const expanded = target.getAttribute('aria-expanded') === 'true'
      target.setAttribute('aria-expanded', String(!expanded))
      target.textContent = expanded
        ? 'Show technical details'
        : 'Hide technical details'
      if (stack) {
        stack.hidden = expanded
      }
    }
  })

  // Focus the overlay for accessibility
  const firstBtn = overlay.querySelector('button') as HTMLButtonElement
  firstBtn?.focus()
}

/**
 * Escape HTML for safe display
 */
function escapeForHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Determine if an error is severe enough to show the crash overlay
 */
function isSevereError(message: string, source?: string): boolean {
  // Syntax errors or module load failures are severe
  if (message.includes('SyntaxError')) return true
  if (message.includes('Failed to fetch dynamically imported module'))
    return true
  if (source?.includes('main.ts') || source?.includes('main.js')) return true

  // Error storms are severe
  if (isErrorStorm()) return true

  return false
}

/**
 * Handle global errors
 */
function handleGlobalError(
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
): boolean {
  const msgStr = typeof message === 'string' ? message : 'Unknown error'

  // Create and store error report
  const report = createErrorReport(msgStr, source, lineno, colno, error)
  storeError(report)

  console.error('[ErrorBoundary] Uncaught error:', {
    message: msgStr,
    source,
    lineno,
    colno,
    stack: error?.stack,
  })

  // Determine severity and show appropriate UI
  if (isSevereError(msgStr, source)) {
    showCrashOverlay(report)
  } else {
    // Show a toast for non-severe errors
    toastError('An unexpected error occurred')
  }

  // Return true to prevent default browser error handling
  return true
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const error = event.reason
  const message =
    error instanceof Error ? error.message : String(error || 'Unknown error')

  const report = createErrorReport(
    `Unhandled Promise Rejection: ${message}`,
    undefined,
    undefined,
    undefined,
    error instanceof Error ? error : undefined,
  )
  storeError(report)

  console.error('[ErrorBoundary] Unhandled promise rejection:', error)

  // Promise rejections during module import are severe
  const isSevere =
    message.includes('Failed to fetch') ||
    message.includes('dynamically imported module') ||
    isErrorStorm()

  if (isSevere) {
    showCrashOverlay(report)
  } else {
    toastError('An operation failed unexpectedly')
  }

  // Prevent the default handling (console error)
  event.preventDefault()
}

/**
 * Initialize the global error boundary
 * Call this as early as possible in app initialization
 */
export function initErrorBoundary(): void {
  // Global error handler
  window.onerror = handleGlobalError

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', handleUnhandledRejection)

  console.log('[ErrorBoundary] Initialized')
}

/**
 * Get recent errors for debugging purposes
 */
export function getRecentErrors(): ErrorReport[] {
  return [...recentErrors]
}

/**
 * Clear stored errors
 */
export function clearStoredErrors(): void {
  recentErrors.length = 0
}

/**
 * Reset error boundary state (for testing)
 */
export function resetErrorBoundaryState(): void {
  recentErrors.length = 0
  crashOverlayShown = false
  errorCount = 0
  errorWindowStart = Date.now()
}

/**
 * Wrap an async function with error boundary protection
 * Catches errors and shows appropriate UI without crashing
 */
export function withErrorBoundary<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  context: string,
): (...args: T) => Promise<R | undefined> {
  return async (...args: T): Promise<R | undefined> => {
    try {
      return await fn(...args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const report = createErrorReport(
        `${context}: ${message}`,
        undefined,
        undefined,
        undefined,
        error instanceof Error ? error : undefined,
      )
      storeError(report)

      console.error(`[ErrorBoundary] Error in ${context}:`, error)
      toastError(`Failed to ${context.toLowerCase()}`)

      return undefined
    }
  }
}

/**
 * Execute a function within an error boundary
 * For synchronous code that might throw
 */
export function safeExecute<T>(
  fn: () => T,
  context: string,
  fallback?: T,
): T | undefined {
  try {
    return fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const report = createErrorReport(
      `${context}: ${message}`,
      undefined,
      undefined,
      undefined,
      error instanceof Error ? error : undefined,
    )
    storeError(report)

    console.error(`[ErrorBoundary] Error in ${context}:`, error)
    toastError(`Failed to ${context.toLowerCase()}`)

    return fallback
  }
}

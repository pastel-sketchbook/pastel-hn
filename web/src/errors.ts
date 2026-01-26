/**
 * Error handling utilities for API errors
 * Provides user-friendly error messages and retry functionality
 */

import { toastError } from './toast'

/**
 * Error types for user-friendly messages
 */
export type ApiErrorType =
  | 'rate_limited'
  | 'not_found'
  | 'network'
  | 'unknown'

export interface ParsedError {
  type: ApiErrorType
  message: string
  retryAfter?: number
}

/**
 * Parse error message from API to determine error type and user-friendly message
 */
export function parseApiError(error: unknown): ParsedError {
  const errorStr = String(error)

  // Check for rate limiting
  const rateLimitMatch = errorStr.match(
    /Rate limited, retry after (\d+) seconds/,
  )
  if (rateLimitMatch) {
    const retryAfter = Number.parseInt(rateLimitMatch[1], 10)
    return {
      type: 'rate_limited',
      message: `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
      retryAfter,
    }
  }

  // Check for not found errors
  if (errorStr.includes('not found') || errorStr.includes('NotFound')) {
    return {
      type: 'not_found',
      message: 'The requested content was not found.',
    }
  }

  // Check for network errors
  if (
    errorStr.includes('network') ||
    errorStr.includes('fetch') ||
    errorStr.includes('Failed to fetch') ||
    errorStr.includes('NetworkError')
  ) {
    return {
      type: 'network',
      message: 'Network error. Check your connection and try again.',
    }
  }

  // Default unknown error
  return {
    type: 'unknown',
    message: 'An unexpected error occurred. Please try again.',
  }
}

/**
 * Show appropriate toast for an API error
 */
export function showErrorToast(error: unknown, context: string): void {
  const parsed = parseApiError(error)

  if (parsed.type === 'rate_limited') {
    toastError(`Rate limited: ${context}. Try again in ${parsed.retryAfter}s.`)
  } else if (parsed.type === 'not_found') {
    toastError(`${context} not found.`)
  } else if (parsed.type === 'network') {
    toastError(`Network error: ${context}. Check your connection.`)
  } else {
    toastError(`Failed to ${context.toLowerCase()}.`)
  }
}

export type RetryAction = 'retry-stories' | 'retry-story' | 'retry-user'

/**
 * Render an error state with optional retry button
 * For network errors, shows a retry button that can reload the content
 */
export function renderErrorWithRetry(
  parsed: ParsedError,
  context: string,
  retryAction?: RetryAction,
  showBackButton = false,
): string {
  let errorMessage: string
  let showRetry = false

  if (parsed.type === 'rate_limited') {
    errorMessage = `Too many requests. Please wait ${parsed.retryAfter} seconds.`
  } else if (parsed.type === 'not_found') {
    errorMessage =
      context === 'Story'
        ? 'Story not found. It may have been deleted.'
        : context === 'User'
          ? 'User not found. The account may not exist.'
          : `${context} not found.`
  } else if (parsed.type === 'network') {
    errorMessage = 'Connection error. Check your network and try again.'
    showRetry = true
  } else {
    errorMessage = `Failed to load ${context.toLowerCase()}. Please try again.`
    showRetry = true
  }

  const retryButton =
    showRetry && retryAction
      ? `<button class="retry-btn" data-action="${retryAction}">
          <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          <span>Try Again</span>
        </button>`
      : ''

  const backButton = showBackButton
    ? `<button class="back-btn" data-action="back">
        <svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        <span>Go Back</span>
      </button>`
    : ''

  return `
    <div class="error-state" role="alert">
      <div class="error-content">
        <span class="error-icon" aria-hidden="true">⚠</span>
        <span class="error-message">${errorMessage}</span>
      </div>
      <div class="error-actions">
        ${retryButton}
        ${backButton}
      </div>
    </div>
  `
}

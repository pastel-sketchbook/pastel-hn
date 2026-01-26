import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ParsedError,
  parseApiError,
  renderErrorWithRetry,
  showErrorToast,
} from './errors'
import { toastError } from './toast'

// Mock the toast module
vi.mock('./toast', () => ({
  toastError: vi.fn(),
}))

describe('parseApiError', () => {
  it('detects rate limiting errors', () => {
    const error = new Error('Rate limited, retry after 30 seconds')
    const result = parseApiError(error)

    expect(result.type).toBe('rate_limited')
    expect(result.retryAfter).toBe(30)
    expect(result.message).toContain('30 seconds')
  })

  it('detects not found errors - lowercase', () => {
    const error = new Error('Item not found')
    const result = parseApiError(error)

    expect(result.type).toBe('not_found')
    expect(result.message).toContain('not found')
  })

  it('detects not found errors - NotFound', () => {
    const error = new Error('NotFound: User does not exist')
    const result = parseApiError(error)

    expect(result.type).toBe('not_found')
  })

  it('detects network errors - network', () => {
    const error = new Error('network error occurred')
    const result = parseApiError(error)

    expect(result.type).toBe('network')
    expect(result.message).toContain('Network')
  })

  it('detects network errors - fetch', () => {
    const error = new Error('fetch failed')
    const result = parseApiError(error)

    expect(result.type).toBe('network')
  })

  it('detects network errors - Failed to fetch', () => {
    const error = new Error('Failed to fetch')
    const result = parseApiError(error)

    expect(result.type).toBe('network')
  })

  it('detects network errors - NetworkError', () => {
    const error = new Error('NetworkError when attempting to fetch resource')
    const result = parseApiError(error)

    expect(result.type).toBe('network')
  })

  it('returns unknown for unrecognized errors', () => {
    const error = new Error('Something weird happened')
    const result = parseApiError(error)

    expect(result.type).toBe('unknown')
    expect(result.message).toContain('unexpected error')
  })

  it('handles non-Error objects', () => {
    const result = parseApiError('string error')
    expect(result.type).toBe('unknown')
  })

  it('handles null/undefined', () => {
    const resultNull = parseApiError(null)
    const resultUndefined = parseApiError(undefined)

    expect(resultNull.type).toBe('unknown')
    expect(resultUndefined.type).toBe('unknown')
  })
})

describe('showErrorToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows rate limit toast with retry time', () => {
    const error = new Error('Rate limited, retry after 15 seconds')
    showErrorToast(error, 'loading stories')

    expect(toastError).toHaveBeenCalledWith(
      'Rate limited: loading stories. Try again in 15s.',
    )
  })

  it('shows not found toast', () => {
    const error = new Error('not found')
    showErrorToast(error, 'Story')

    expect(toastError).toHaveBeenCalledWith('Story not found.')
  })

  it('shows network error toast', () => {
    const error = new Error('Failed to fetch')
    showErrorToast(error, 'loading comments')

    expect(toastError).toHaveBeenCalledWith(
      'Network error: loading comments. Check your connection.',
    )
  })

  it('shows generic error toast for unknown errors', () => {
    const error = new Error('Unknown error')
    showErrorToast(error, 'Loading data')

    expect(toastError).toHaveBeenCalledWith('Failed to loading data.')
  })
})

describe('renderErrorWithRetry', () => {
  it('renders rate limited error without retry button', () => {
    const parsed: ParsedError = {
      type: 'rate_limited',
      message: 'Rate limited',
      retryAfter: 30,
    }
    const result = renderErrorWithRetry(parsed, 'Stories', 'retry-stories')

    expect(result).toContain('error-state')
    expect(result).toContain('30 seconds')
    expect(result).not.toContain('retry-btn')
  })

  it('renders story not found error with specific message', () => {
    const parsed: ParsedError = {
      type: 'not_found',
      message: 'Not found',
    }
    const result = renderErrorWithRetry(parsed, 'Story', 'retry-story')

    expect(result).toContain('Story not found')
    expect(result).toContain('may have been deleted')
    expect(result).not.toContain('retry-btn')
  })

  it('renders user not found error with specific message', () => {
    const parsed: ParsedError = {
      type: 'not_found',
      message: 'Not found',
    }
    const result = renderErrorWithRetry(parsed, 'User', 'retry-user')

    expect(result).toContain('User not found')
    expect(result).toContain('may not exist')
  })

  it('renders generic not found error', () => {
    const parsed: ParsedError = {
      type: 'not_found',
      message: 'Not found',
    }
    const result = renderErrorWithRetry(parsed, 'Comment')

    expect(result).toContain('Comment not found')
  })

  it('renders network error with retry button', () => {
    const parsed: ParsedError = {
      type: 'network',
      message: 'Network error',
    }
    const result = renderErrorWithRetry(parsed, 'Stories', 'retry-stories')

    expect(result).toContain('Connection error')
    expect(result).toContain('retry-btn')
    expect(result).toContain('data-action="retry-stories"')
    expect(result).toContain('Try Again')
  })

  it('renders unknown error with retry button', () => {
    const parsed: ParsedError = {
      type: 'unknown',
      message: 'Unknown',
    }
    const result = renderErrorWithRetry(parsed, 'Stories', 'retry-stories')

    expect(result).toContain('Failed to load stories')
    expect(result).toContain('retry-btn')
  })

  it('does not show retry button without retryAction', () => {
    const parsed: ParsedError = {
      type: 'network',
      message: 'Network error',
    }
    const result = renderErrorWithRetry(parsed, 'Stories')

    expect(result).not.toContain('retry-btn')
  })

  it('shows back button when requested', () => {
    const parsed: ParsedError = {
      type: 'not_found',
      message: 'Not found',
    }
    const result = renderErrorWithRetry(parsed, 'Story', undefined, true)

    expect(result).toContain('back-btn')
    expect(result).toContain('data-action="back"')
    expect(result).toContain('Go Back')
  })

  it('includes accessibility attributes', () => {
    const parsed: ParsedError = {
      type: 'unknown',
      message: 'Error',
    }
    const result = renderErrorWithRetry(parsed, 'Content')

    expect(result).toContain('role="alert"')
    expect(result).toContain('aria-hidden="true"')
    expect(result).toContain('error-icon')
    expect(result).toContain('error-message')
  })
})

# ADR-0004: Error Handling Pattern

**Status:** Accepted  
**Date:** 2026-01-25

## Context

The HN Firebase API can fail in several ways:
- Rate limiting (HTTP 429 or message-based)
- Network errors (offline, DNS, timeouts)
- Not found (deleted stories, invalid IDs)
- Unknown errors (server errors, parsing failures)

Initially, errors were shown as raw API responses which were confusing to users (e.g., "Error: Rate limited, retry after 60 seconds" or cryptic fetch errors).

## Decision

Implement a two-layer error handling pattern:

### Layer 1: `parseApiError(error: unknown): ParsedError`

Classifies errors into typed categories:

```typescript
type ApiErrorType = 'rate_limited' | 'not_found' | 'network' | 'unknown'

interface ParsedError {
  type: ApiErrorType
  message: string
  retryAfter?: number  // Only for rate_limited
}
```

Classification logic:
1. **rate_limited**: Matches "Rate limited, retry after N seconds" pattern
2. **not_found**: Contains "not found" or "NotFound"
3. **network**: Contains "network", "fetch", "Failed to fetch", "NetworkError"
4. **unknown**: Fallback for unrecognized errors

### Layer 2: `showErrorToast(error: unknown, context: string)`

Displays user-friendly toast messages based on error type:
- Rate limited: "Rate limited: {context}. Try again in {N}s."
- Not found: "{context} not found."
- Network: "Network error: {context}. Check your connection."
- Unknown: "Failed to {context}."

## Usage Pattern

```typescript
try {
  const stories = await invoke('get_stories', { feed: currentFeed })
  // ... handle success
} catch (error) {
  const parsed = parseApiError(error)
  
  // Can handle specific errors differently
  if (parsed.type === 'rate_limited') {
    showRetryButton(parsed.retryAfter)
  }
  
  // Always show user-friendly toast
  showErrorToast(error, 'Load stories')
}
```

## Consequences

### Positive
- Users see friendly, actionable error messages
- Rate limit info (retry seconds) is extracted and usable
- Error handling is consistent across the app
- Easy to add new error types as needed

### Negative
- String-based error detection is fragile
- Relies on Rust backend formatting errors consistently
- No structured error codes from the API layer

## Future Improvements

- Add connection error recovery with retry button (TODO 4.4)
- Implement offline indicator (TODO 4.5)
- Consider structured error types from Rust backend
- Add automatic retry with exponential backoff for transient errors

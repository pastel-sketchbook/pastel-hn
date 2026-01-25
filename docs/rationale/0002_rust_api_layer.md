# ADR-0002: Moving HN API Layer to Rust

**Status:** Accepted  
**Date:** 2026-01-24  
**Supersedes:** N/A

## Context

The pastel-hn application currently implements all HN API calls in TypeScript (`web/src/api.ts`, ~400 lines) with additional data handling scattered throughout `main.ts` (~2000+ lines). This architecture has served us well for rapid prototyping but has several limitations:

### Current Pain Points

1. **Bloated main.ts** - UI rendering and data fetching are tangled together
2. **Limited concurrency** - JavaScript's single-threaded event loop can't parallelize CPU-bound work
3. **Basic error handling** - Try/catch with string errors, no structured error types
4. **In-memory only caching** - Cache lost on page reload, no persistence
5. **No request retry/resilience** - Simple fetch with no backoff or retry logic
6. **Console-based logging** - Unstructured, no filtering or spans
7. **Runtime type checking** - JSON.parse returns `any`, runtime validation needed

### Tauri's Strengths

Since we're already using Tauri, we have a Rust backend that's currently underutilized (only `open_external` and `get_app_version` commands). Rust offers:

- **Tokio** - Async runtime with true parallelism for concurrent requests
- **Reqwest** - HTTP client with connection pooling, automatic retries, timeouts
- **Serde** - Zero-copy deserialization, compile-time type checking
- **Anyhow/Thiserror** - Structured error handling with context and backtraces
- **Tracing** - Structured logging with spans, filtering, and multiple outputs
- **SQLite/Sled** - Persistent caching that survives app restarts

## Decision

We will migrate all HN API operations from TypeScript to Rust, creating a clear separation:

```
┌─────────────────────────────────────────────┐
│  TypeScript (UI Layer)                      │
│  - DOM rendering and manipulation           │
│  - Keyboard/mouse event handling            │
│  - Theme and settings management            │
│  - Virtual scrolling                        │
│  - Calls Rust via Tauri invoke()            │
└─────────────────┬───────────────────────────┘
                  │ @tauri-apps/api invoke()
┌─────────────────▼───────────────────────────┐
│  Rust (Data Layer)                          │
│  - HN Firebase API client                   │
│  - Algolia Search API client                │
│  - In-memory + persistent caching           │
│  - Background refresh / prefetching         │
│  - Structured error handling                │
│  - Request retry with exponential backoff   │
│  - Structured logging with tracing          │
└─────────────────────────────────────────────┘
```

### Rust Dependencies

```toml
[dependencies]
# Async runtime
tokio = { version = "1", features = ["full"] }

# HTTP client
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Error handling
anyhow = "1"
thiserror = "2"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Caching (optional, for persistence)
# moka = "0.12"  # In-memory cache with TTL
# rusqlite = { version = "0.32", features = ["bundled"] }  # Persistent cache
```

### Tauri Commands

```rust
// Story feeds
#[tauri::command]
async fn fetch_stories(feed: StoryFeed, offset: u32, limit: u32) -> Result<StoriesResponse, ApiError>;

// Single item
#[tauri::command]
async fn fetch_item(id: u32) -> Result<HNItem, ApiError>;

// Story with comments
#[tauri::command]
async fn fetch_story_with_comments(id: u32, depth: u8) -> Result<StoryWithComments, ApiError>;

// Load more comments
#[tauri::command]
async fn fetch_comment_children(id: u32, depth: u8) -> Result<Vec<CommentWithChildren>, ApiError>;

// User profile
#[tauri::command]
async fn fetch_user(id: String) -> Result<HNUser, ApiError>;

#[tauri::command]
async fn fetch_user_submissions(
    user_id: String, 
    offset: u32, 
    limit: u32, 
    filter: SubmissionFilter
) -> Result<SubmissionsResponse, ApiError>;

// Search (Algolia)
#[tauri::command]
async fn search_hn(
    query: String, 
    page: u32, 
    hits_per_page: u32, 
    sort: SearchSort, 
    filter: SearchFilter
) -> Result<SearchResponse, ApiError>;

// Cache management
#[tauri::command]
fn clear_cache() -> Result<(), ApiError>;

#[tauri::command]
fn clear_story_ids_cache(feed: Option<StoryFeed>) -> Result<(), ApiError>;
```

### TypeScript Changes

The `api.ts` file will be replaced with thin wrappers around Tauri invoke:

```typescript
import { invoke } from '@tauri-apps/api/core'

export async function fetchStories(feed: StoryFeed, offset: number, limit: number): Promise<StoriesResponse> {
  return invoke('fetch_stories', { feed, offset, limit })
}

export async function fetchItem(id: number): Promise<HNItem> {
  return invoke('fetch_item', { id })
}

// ... etc
```

Utility functions like `formatTimeAgo` and `extractDomain` will remain in TypeScript as they're UI-related.

## Consequences

### Positive

1. **Clear separation of concerns** - Rust handles data, TypeScript handles UI
2. **Better performance** - Parallel fetching, connection pooling, zero-copy deserialization
3. **Robust error handling** - Typed errors with context, proper propagation to UI
4. **Persistent caching** - Stories and items survive app restarts
5. **Background operations** - Prefetch without blocking UI thread
6. **Structured logging** - Debug issues with proper tracing spans
7. **Smaller main.ts** - Only UI code remains, easier to maintain
8. **Future features enabled** - Offline support, background sync, notifications

### Negative

1. **Build complexity** - Two languages to compile
2. **Debug complexity** - Errors can originate from either layer
3. **Learning curve** - Contributors need Rust knowledge
4. **Initial development time** - Rewriting existing working code

### Neutral

1. **Bundle size** - Rust adds ~2-5MB but we're already shipping a native app
2. **Type duplication** - Types defined in both Rust and TypeScript (mitigated by code generation tools if needed)

## Implementation Plan

1. **Phase 1: Core API** - Implement `HnClient` with all Firebase endpoints
2. **Phase 2: Caching** - Add in-memory cache with TTL (moka)
3. **Phase 3: Tauri Commands** - Expose all API functions as commands
4. **Phase 4: TypeScript Migration** - Replace fetch calls with invoke
5. **Phase 5: Search** - Add Algolia search integration
6. **Phase 6: Enhancements** - Background refresh, prefetching, persistent cache

## References

- [Tauri Command Documentation](https://tauri.app/v1/guides/features/command/)
- [Reqwest HTTP Client](https://docs.rs/reqwest)
- [HN Firebase API](https://github.com/HackerNews/API)
- [Algolia HN Search API](https://hn.algolia.com/api)
- [ADR-0001: Removing Zig/WASM Layer](./0001_removing_zig_wasm_layer.md)

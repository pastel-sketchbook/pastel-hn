# pastel-hn - The Best Hacker News Desktop Client

**Goal:** Build the definitive Hacker News desktop experience - a native app that surpasses all existing HN clients in usability, visual design, and reading comfort.

> **Architecture Notes:**
> - Phase 1 (Zig/WASM) was removed in v0.2.0. See [ADR-0001](docs/rationale/0001_removing_zig_wasm_layer.md)
> - API layer moved to Rust in v0.4.0. See [ADR-0002](docs/rationale/0002_rust_api_layer.md)
> - Error handling pattern documented in [ADR-0004](docs/rationale/0004_error_handling_pattern.md)

---

## Design Philosophy

- **Reader-First**: Optimize for comfortable, extended reading sessions
- **Visual Hierarchy**: Clear distinction between content types (stories, comments, meta)
- **Responsive Feedback**: Every interaction should feel immediate and satisfying
- **Keyboard-Centric**: Power users can navigate entirely without a mouse
- **Beautiful by Default**: Stunning Cyberpunk Pastel visuals that don't sacrifice usability

---

## Architecture Overview

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
│  - HN Firebase API client (reqwest)         │
│  - Algolia Search API client                │
│  - In-memory caching (moka)                 │
│  - Structured error handling (thiserror)    │
│  - Structured logging (tracing)             │
└─────────────────────────────────────────────┘
```

---

## Phase 1: Core Foundation (API & Types)

### 1.1 Rust API Client
- [x] Define HN types with serde (HNItem, HNUser, StoryFeed)
- [x] Implement HnClient with reqwest
- [x] Connection pooling and timeouts
- [x] Structured error handling with thiserror
- [x] Structured logging with tracing

### 1.2 Tauri Commands
- [x] `fetch_stories(feed, offset, limit)` - Paginated story fetching
- [x] `fetch_item(id)` - Single item fetch
- [x] `fetch_items(ids)` - Batch item fetch
- [x] `fetch_story_with_comments(id, depth)` - Story with comment tree
- [x] `fetch_comment_children(id, depth)` - Load more comments
- [x] `fetch_user(id)` - User profile
- [x] `fetch_user_submissions(user_id, offset, limit, filter)` - User submissions
- [x] `search_hn(query, page, hits_per_page, sort, filter)` - Algolia search
- [x] `clear_cache()` / `clear_story_ids_cache(feed)` - Cache management

### 1.3 Caching (Rust/moka)
- [x] In-memory item cache with 5min TTL (10,000 items max)
- [x] Story IDs cache with 2min TTL
- [x] User cache with 10min TTL
- [ ] Intelligent prefetching for visible stories
- [ ] Background refresh for stale data
- [ ] Persistent cache (SQLite) for offline support

### 1.4 TypeScript API Wrapper
- [x] Thin wrapper around Tauri invoke
- [x] Type-safe interfaces matching Rust types
- [x] Utility functions (formatTimeAgo, extractDomain)

---

## Phase 2: Visual Design (Cyberpunk Pastel Aesthetic)

### 2.1 Color System
- [x] Dark theme (deep blue/charcoal #050a0e base)
- [x] Light theme with warm paper gradient
- [x] Pastel accent palette:
  - [x] Cyan/teal (#00d9ff) - primary actions, links
  - [x] Soft orange (#ff9f43) - scores, highlights
  - [x] Lavender/purple (#a29bfe) - authors, visited
  - [x] Soft pink (#fd79a8) - Show HN accent
- [x] Neon glow effects on interactive elements
- [x] Consistent opacity scales for layering

### 2.2 Typography
- [x] Display font: Orbitron (headers, logo)
- [x] Body font: Rajdhani (content, readable)
- [x] Mono font: Share Tech Mono (meta, code)
- [x] Font size scaling options (compact/normal/comfortable)

### 2.3 Component Design System
- [x] Cyber-frame panels with corner accents
- [x] Glass morphism card effects
- [x] Line-only SVG icon set
- [x] Animated hover states with glow
- [x] Score heat indicators (warm/hot/fire)
- [x] Type-based accent colors (Ask/Show/Jobs)
- [x] Skeleton loading states
- [x] Toast notifications

### 2.4 Animations & Micro-interactions
- [x] Smooth hover transitions (0.25s ease)
- [x] Corner accent expansion on hover
- [x] Score pulse animation for hot stories
- [x] Skeleton loading stagger animations
- [x] Page transition animations
- [x] List item stagger animations
- [ ] Collapse/expand animations for comments
- [ ] **Loading shimmer effect for article content**
- [ ] **Success/error toast slide animations**

---

## Phase 3: Core UI Components

### 3.1 Navigation
- [x] Header with logo and nav tabs
- [x] Feed switching (top/new/best/ask/show/jobs)
- [x] Active state indicators
- [x] Theme toggle button
- [x] Search button/modal (Algolia HN Search integrated)
- [ ] User menu (future: auth)

### 3.2 Story List View
- [x] Story cards with full metadata
- [x] Rank badges with cyber styling
- [x] Upvote buttons (visual only for now)
- [x] Domain display for external links
- [x] Comment count links
- [x] Infinite scroll with loading indicator
- [x] Pull-to-refresh gesture
- [x] "Back to top" floating button

### 3.3 Story Detail View
- [x] Full story header (title, meta, URL)
- [x] Story text content (for Ask HN, etc.)
- [x] Comment tree with threading
- [x] Collapsible comment branches
- [x] Comment depth indicators
- [x] "Load more" for deep threads
- [ ] Share/copy link actions

### 3.4 Comment Component
- [x] Author with karma indicator
- [x] Relative timestamp
- [x] HTML content rendering (safe)
- [x] Collapse/expand toggle
- [ ] Reply count badge
- [x] Nested indent styling
- [x] Highlight OP comments

### 3.5 User Profile View
- [x] Username and karma display
- [x] Account age
- [x] About section (HTML)
- [x] Submission history tabs
- [x] Recent comments list

### 3.6 Settings Panel
- [x] Theme selection (dark/light/system)
- [x] Font size adjustment
- [x] Information density (compact/normal/comfortable)
- [x] Default feed selection
- [x] Keyboard shortcut reference
- [ ] **Clear reading history option**
- [ ] **Cache management (view size, clear)**
- [ ] **Export/import settings**

---

## Phase 4: User Experience Excellence

### 4.1 Keyboard Navigation
- [x] `j`/`k` - Navigate stories up/down
- [x] `Enter` - Open story/expand comments
- [x] `o` - Open link in browser
- [x] `c` - Focus comments
- [x] `Escape` - Go back/close modal
- [x] `r` - Refresh current feed
- [x] `1-6` - Switch feeds (top/new/best/ask/show/jobs)
- [x] `/` - Focus search
- [x] `?` - Show keyboard shortcuts
- [x] `t` - Scroll to top

### 4.2 Reading Experience
- [x] Reading position memory (per story)
- [x] Scroll position preservation on back
- [ ] "New comments" indicator on revisit
- [x] Mark stories as read (visual indicator)
- [ ] Reading time estimates (backend `word_count` exists, wire to UI)
- [ ] Distraction-free reading mode
- [ ] **Article Reader Mode** (use existing `fetch_article_content` command to render articles inline)

### 4.3 Smart Features
- [ ] Intelligent prefetching (next page, hovered stories)
- [ ] Comment count change detection
- [ ] Story score trending indicator
- [ ] "Hot" story detection algorithm
- [ ] Duplicate story detection
- [x] Rate limit detection and retry UI

### 4.4 Error Handling UX
- [ ] Connection error recovery with retry button
- [ ] Graceful degradation when offline
- [ ] Error boundaries to prevent full app crashes
- [x] User-friendly error messages (not raw API errors)

### 4.5 Offline Support
- [ ] Offline indicator in header
- [ ] Cache stories for offline reading (SQLite)
- [ ] Queue actions for when online
- [ ] Sync status indicators

### 4.6 Bookmarks & History
- [ ] Bookmark stories locally
- [ ] Reading history with timestamps
- [ ] Export bookmarks
- [ ] Sync across devices (future)

---

## Phase 5: Tauri Desktop Integration

### 5.1 Window Management
- [x] Default size: 1920x1080
- [x] Minimum size: 1024x768
- [ ] Remember window position and size
- [ ] Multi-window support (story in new window)

### 5.2 Native Commands
- [x] `open_external(url)` - system browser
- [x] `get_app_version()` - version info
- [ ] `check_for_updates()` - update checker
- [ ] `show_notification(title, body)` - native notifications

### 5.3 System Integration
- [x] Custom app icon (Cyberpunk Y logo)
- [ ] System tray with quick actions
- [ ] Native notifications for followed stories
- [ ] Global keyboard shortcuts
- [ ] Deep linking (hn://item/12345)

### 5.4 Build & Distribution
- [ ] macOS: `.app` bundle with code signing
- [ ] Windows: `.msi` installer with code signing
- [ ] Linux: `.AppImage` and `.deb` packages
- [ ] Auto-updater integration
- [ ] GitHub Actions release workflow

---

## Phase 6: Polish & Performance

### 6.1 Performance Optimization
- [x] Virtual scrolling for 500+ items (VirtualScroll class)
- [x] Connection pooling in Rust HTTP client
- [x] Concurrent request fetching with Tokio
- [ ] Lazy comment loading (fetch on expand)
- [ ] Bundle size optimization (<100KB JS)
- [ ] First contentful paint <500ms
- [ ] **Image/favicon lazy loading for story domains**
- [ ] **Request deduplication for concurrent fetches**

### 6.2 Accessibility
- [x] Full keyboard navigation
- [x] ARIA labels for all interactive elements
- [ ] Screen reader announcements (live regions for loading/errors)
- [x] Focus trap in modals (settings, search, help)
- [ ] High contrast mode
- [x] Reduced motion support
- [ ] **Skip-to-content link**
- [ ] **Proper heading hierarchy audit**

### 6.3 Testing
- [x] Unit tests for API functions (api.test.ts - 18 tests)
- [x] Unit tests for theme module (theme.test.ts - 11 tests)
- [x] Unit tests for virtual scroll (virtual-scroll.test.ts - 7 tests)
- [x] Unit tests for keyboard.ts (keyboard.test.ts - 27 tests)
- [x] Unit tests for storage.ts (storage.test.ts - 22 tests)
- [x] Unit tests for settings.ts (settings.test.ts - 29 tests)
- [x] Unit tests for toast.ts (toast.test.ts - 30 tests)
- [ ] Rust unit tests for HnClient (fetch, caching, error handling)
- [x] Rust unit tests for types.rs (types.rs - 40 tests)
- [ ] Component tests for UI
- [ ] E2E tests with Playwright
- [ ] Visual regression tests
- [ ] Performance benchmarks
- [ ] Accessibility audit (axe-core)

### 6.4 Documentation
- [ ] README with screenshots
- [ ] Keyboard shortcut reference
- [ ] Contributing guide
- [x] Architecture overview (this document + ADRs)
- [ ] **API module documentation (rustdoc)**
- [ ] **TypeScript JSDoc for public functions**
- [ ] **CHANGELOG.md for release notes**

---

## File Structure

```
pastel-hn/
├── web/                        # Frontend (TypeScript)
│   ├── src/
│   │   ├── api.ts              # Tauri invoke wrappers
│   │   ├── types.ts            # TypeScript types
│   │   ├── theme.ts            # Theme management
│   │   ├── keyboard.ts         # Keyboard navigation
│   │   ├── settings.ts         # Settings panel
│   │   ├── toast.ts            # Toast notifications
│   │   ├── virtual-scroll.ts   # Virtual scrolling
│   │   ├── storage.ts          # LocalStorage helpers
│   │   ├── styles/
│   │   │   └── main.css        # Cyberpunk styles
│   │   └── main.ts             # Entry point & UI
│   ├── index.html
│   └── package.json
├── src-tauri/                  # Backend (Rust)
│   ├── src/
│   │   ├── main.rs             # Tauri app setup
│   │   ├── client.rs           # HnClient with caching
│   │   ├── commands.rs         # Tauri command handlers
│   │   └── types.rs            # Rust types with serde
│   ├── icons/                  # App icons
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/
│   └── rationale/              # Architecture Decision Records
│       ├── 0001_removing_zig_wasm_layer.md
│       └── 0002_rust_api_layer.md
├── TODO.md
├── AGENTS.md
├── Taskfile.yml
└── VERSION
```

---

## Success Metrics

The "best UI/UX HN client" should achieve:

1. **Speed**: First story visible in <1 second
2. **Responsiveness**: All interactions feel instant (<100ms feedback)
3. **Readability**: Comfortable reading for 30+ minute sessions
4. **Efficiency**: Common actions require minimal clicks/keystrokes
5. **Delight**: Users prefer it over the HN website and other clients

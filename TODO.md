# Hacker News Client - Implementation TODO

A desktop Hacker News client using Tauri, with a Zig HTTP library compiled to WASM and TypeScript/HTML/CSS for the UI.

## Phase 1: Zig HN HTTP Library → WASM

### 1.1 Project Setup
- [ ] Initialize Zig project structure (`src/`, `build.zig`)
- [ ] Configure WASM build target (`-target wasm32-freestanding`)
- [ ] Set up memory allocator for WASM (page allocator or fixed buffer)
- [ ] Create WASM export/import conventions (`wasm_` prefix)

### 1.2 HN API Data Structures
- [ ] Define `Item` struct (id, type, by, time, text, url, score, title, descendants, kids)
- [ ] Define `User` struct (id, created, karma, about, submitted)
- [ ] Define story types enum (story, comment, job, poll, pollopt)
- [ ] Implement JSON parsing for all structures
- [ ] Write tests for JSON parsing edge cases

### 1.3 HN API Client (Core)
- [ ] Implement base URL constant (`https://hacker-news.firebaseio.com/v0/`)
- [ ] Create URL builder for endpoints:
  - [ ] `/topstories.json`
  - [ ] `/newstories.json`
  - [ ] `/beststories.json`
  - [ ] `/askstories.json`
  - [ ] `/showstories.json`
  - [ ] `/jobstories.json`
  - [ ] `/item/{id}.json`
  - [ ] `/user/{id}.json`
- [ ] Implement HTTP fetch via JS import (WASM can't do network I/O directly)
- [ ] Define JS→WASM callback interface for async responses

### 1.4 WASM Exports
- [ ] `wasm_fetch_top_stories(callback_ptr)` - fetch top story IDs
- [ ] `wasm_fetch_new_stories(callback_ptr)` - fetch new story IDs
- [ ] `wasm_fetch_best_stories(callback_ptr)` - fetch best story IDs
- [ ] `wasm_fetch_item(id, callback_ptr)` - fetch single item
- [ ] `wasm_fetch_user(id_ptr, id_len, callback_ptr)` - fetch user
- [ ] `wasm_parse_item(json_ptr, json_len)` - parse item JSON, return struct ptr
- [ ] `wasm_parse_stories(json_ptr, json_len)` - parse story ID array
- [ ] `wasm_alloc(size)` / `wasm_free(ptr)` - memory management
- [ ] `wasm_get_error()` - get last error message

### 1.5 Testing
- [ ] Unit tests for URL building
- [ ] Unit tests for JSON parsing (valid/invalid inputs)
- [ ] Unit tests for memory allocation/deallocation
- [ ] Integration tests with mock JSON responses
- [ ] Roundtrip tests (serialize → deserialize)

## Phase 2: TypeScript Glue Layer

### 2.1 WASM Loader
- [ ] Create `WasmHN` class to load and instantiate WASM module
- [ ] Implement memory helpers (read/write strings, arrays)
- [ ] Set up JS imports for WASM (fetch bridge)
- [ ] Handle async initialization

### 2.2 TypeScript Types
- [ ] Define `HNItem` interface matching Zig struct
- [ ] Define `HNUser` interface matching Zig struct
- [ ] Define `StoryType` enum
- [ ] Define API response types

### 2.3 API Wrapper
- [ ] `fetchTopStories(limit?: number): Promise<number[]>`
- [ ] `fetchNewStories(limit?: number): Promise<number[]>`
- [ ] `fetchBestStories(limit?: number): Promise<number[]>`
- [ ] `fetchAskStories(limit?: number): Promise<number[]>`
- [ ] `fetchShowStories(limit?: number): Promise<number[]>`
- [ ] `fetchJobStories(limit?: number): Promise<number[]>`
- [ ] `fetchItem(id: number): Promise<HNItem>`
- [ ] `fetchUser(id: string): Promise<HNUser>`
- [ ] `fetchStoryWithComments(id: number, depth?: number): Promise<HNItem>`

### 2.4 Caching Layer
- [ ] Implement in-memory cache for items
- [ ] Add TTL-based cache invalidation
- [ ] Cache story lists with shorter TTL

## Phase 3: UI (HTML/CSS/TypeScript)

### 3.1 Layout Structure
- [ ] Header with HN logo and navigation tabs
- [ ] Story list view (main content area)
- [ ] Story detail view with comments
- [ ] User profile view
- [ ] Settings panel

### 3.2 Components
- [ ] `<hn-header>` - Logo, nav (top/new/best/ask/show/jobs)
- [ ] `<hn-story-item>` - Single story row (rank, vote, title, meta)
- [ ] `<hn-story-list>` - Paginated story list
- [ ] `<hn-comment>` - Recursive comment component
- [ ] `<hn-comment-thread>` - Comment tree container
- [ ] `<hn-user-profile>` - User info display
- [ ] `<hn-loading>` - Loading spinner/skeleton

### 3.3 Styling (Cyberpunk Pastel Futuristic)
- [ ] Dark background (deep blue/charcoal #0a0e14 or similar)
- [ ] Pastel accent colors:
  - [ ] Cyan/teal for primary actions (#00d9ff, #5ce1e6)
  - [ ] Soft orange for warnings/highlights (#ff9f43, #feca57)
  - [ ] Lavender/purple for secondary (#a29bfe, #6c5ce7)
  - [ ] Soft pink for accents (#fd79a8, #fab1a0)
- [ ] Neon glow effects on borders and focus states
- [ ] Line-only icons (stroke, no fill) - custom icon set
- [ ] Futuristic panel borders with corner accents
- [ ] Grid layout with tech-inspired frames
- [ ] Monospace/tech font (JetBrains Mono, Fira Code, or custom)
- [ ] Subtle gradient overlays and scanline effects (optional)
- [ ] Responsive but desktop-first

### 3.4 Interactivity
- [ ] Tab navigation (top/new/best/ask/show/jobs)
- [ ] Infinite scroll or pagination
- [ ] Click story → show comments
- [ ] Collapsible comment threads
- [ ] Click username → user profile
- [ ] External link handling (open in browser)
- [ ] Keyboard navigation (j/k for up/down)

### 3.5 State Management
- [ ] Current view state (list/detail/user)
- [ ] Current story type filter
- [ ] Loaded stories cache
- [ ] Scroll position preservation
- [ ] Loading/error states

## Phase 4: Tauri Integration

### 4.1 Project Setup
- [ ] Initialize Tauri project (`npm create tauri-app`)
- [ ] Configure `tauri.conf.json` (window size, title, etc.)
- [ ] Set up Rust backend structure
- [ ] Configure build scripts for WASM + Tauri

### 4.2 Window Configuration
- [ ] Set default window size (desktop-appropriate)
- [ ] Configure window title ("Hacker News")
- [ ] Set minimum window dimensions
- [ ] Add window icon (HN-style Y)

### 4.3 Tauri Commands (Rust)
- [ ] `open_external_link(url)` - open URL in default browser
- [ ] `get_app_version()` - return app version
- [ ] `check_for_updates()` - (optional) update checker

### 4.4 Native Features
- [ ] System tray icon (optional)
- [ ] Notifications for new stories (optional)
- [ ] Keyboard shortcuts (Cmd/Ctrl+R refresh, etc.)
- [ ] Dark mode support (follow system)

### 4.5 Build & Distribution
- [ ] Configure build for macOS (`.app` bundle)
- [ ] Configure build for Windows (`.msi`/`.exe`)
- [ ] Configure build for Linux (`.AppImage`/`.deb`)
- [ ] Set up code signing (macOS/Windows)
- [ ] Create release workflow (GitHub Actions)

## Phase 5: Polish & Optimization

### 5.1 Performance
- [ ] Lazy load comments (fetch on expand)
- [ ] Virtual scrolling for long lists
- [ ] Optimize WASM binary size (`-Doptimize=ReleaseSmall`)
- [ ] Bundle size analysis

### 5.2 UX Improvements
- [ ] Offline indicator
- [ ] Pull-to-refresh gesture
- [ ] Story read tracking (local storage)
- [ ] Search functionality (optional)
- [ ] Bookmarks/favorites (optional)

### 5.3 Accessibility
- [ ] Keyboard navigation throughout
- [ ] Screen reader labels
- [ ] Focus indicators
- [ ] High contrast support

### 5.4 Testing
- [ ] E2E tests with Playwright/Tauri driver
- [ ] Visual regression tests
- [ ] Performance benchmarks

---

## File Structure (Target)

```
wasm-hn/
├── src/                    # Zig source
│   ├── main.zig           # WASM exports
│   ├── hn_api.zig         # HN API client
│   ├── json.zig           # JSON parser
│   ├── types.zig          # Data structures
│   └── tests/             # Zig tests
├── build.zig              # Zig build config
├── web/                   # Frontend
│   ├── src/
│   │   ├── wasm.ts        # WASM loader
│   │   ├── api.ts         # TS API wrapper
│   │   ├── components/    # UI components
│   │   ├── styles/        # CSS
│   │   └── main.ts        # Entry point
│   ├── index.html
│   └── package.json
├── src-tauri/             # Tauri Rust backend
│   ├── src/
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── TODO.md
├── AGENTS.md
└── Taskfile.yml
```

# pastel-hn - Implementation TODO

A desktop Hacker News client using Tauri, with TypeScript/Bun for the frontend and a Cyberpunk Pastel aesthetic.

> **Note:** Phase 1 (Zig/WASM) was removed in v0.2.0. See [ADR-0001](docs/rationale/0001_removing_zig_wasm_layer.md) for rationale.

## Phase 1: TypeScript API Layer

### 1.1 API Client
- [x] Define `HNItem` interface
- [x] Define `HNUser` interface
- [x] Define `StoryType` enum
- [x] Define API response types
- [x] Implement base URL constant
- [x] Create fetch wrapper with error handling

### 1.2 API Functions
- [x] `fetchTopStories(limit?: number): Promise<number[]>`
- [x] `fetchNewStories(limit?: number): Promise<number[]>`
- [x] `fetchBestStories(limit?: number): Promise<number[]>`
- [x] `fetchAskStories(limit?: number): Promise<number[]>`
- [x] `fetchShowStories(limit?: number): Promise<number[]>`
- [x] `fetchJobStories(limit?: number): Promise<number[]>`
- [x] `fetchItem(id: number): Promise<HNItem>`
- [ ] `fetchUser(id: string): Promise<HNUser>`
- [ ] `fetchStoryWithComments(id: number, depth?: number): Promise<HNItem>`

### 1.3 Caching Layer
- [x] Implement in-memory cache for items
- [x] Add TTL-based cache invalidation
- [ ] Cache story lists with shorter TTL

### 1.4 Utilities
- [x] `formatTimeAgo(timestamp)` - relative time formatting
- [x] `extractDomain(url)` - domain extraction for display

## Phase 2: UI (HTML/CSS/TypeScript)

### 2.1 Layout Structure
- [x] Header with HN logo and navigation tabs
- [x] Story list view (main content area)
- [ ] Story detail view with comments
- [ ] User profile view
- [ ] Settings panel

### 2.2 Components
- [x] Header - Logo, nav (top/new/best/ask/show/jobs)
- [x] Story item - Single story row (rank, vote, title, meta)
- [x] Story list - Story collection
- [ ] Comment - Recursive comment component
- [ ] Comment thread - Comment tree container
- [ ] User profile - User info display
- [x] Loading state - Loading spinner

### 2.3 Styling (Cyberpunk Pastel Futuristic)
- [x] Dark background (deep blue/charcoal #0a0e14 or similar)
- [x] Light theme with warm paper gradient
- [x] Pastel accent colors:
  - [x] Cyan/teal for primary actions (#00d9ff, #5ce1e6)
  - [x] Soft orange for warnings/highlights (#ff9f43, #feca57)
  - [x] Lavender/purple for secondary (#a29bfe, #6c5ce7)
  - [x] Soft pink for accents (#fd79a8, #fab1a0)
- [x] Neon glow effects on borders and focus states
- [x] Line-only icons (stroke, no fill) - custom SVG icon set
- [x] Futuristic panel borders with corner accents
- [x] Grid layout with tech-inspired frames
- [x] Tech fonts (Orbitron, Rajdhani, Share Tech Mono)
- [ ] Subtle gradient overlays and scanline effects (optional)
- [x] Responsive but desktop-first

### 2.4 Story Card Enhancements
- [x] Glass morphism card background
- [x] Corner accent markers with hover animation
- [x] Score glow intensity based on points (warm/hot/fire)
- [x] Type-based accent colors (Ask HN, Show HN, Jobs)
- [x] Enhanced hover animations
- [x] Rank badge with cyber styling
- [x] Meta separator dots with glow

### 2.5 Interactivity
- [x] Tab navigation (top/new/best/ask/show/jobs)
- [ ] Infinite scroll or pagination
- [ ] Click story → show comments
- [ ] Collapsible comment threads
- [ ] Click username → user profile
- [ ] External link handling (open in browser)
- [ ] Keyboard navigation (j/k for up/down)

### 2.6 State Management
- [x] Current view state (list/detail/user)
- [x] Current story type filter
- [x] Loading/error states
- [ ] Loaded stories cache
- [ ] Scroll position preservation

### 2.7 Theme System
- [x] Dark mode (default)
- [x] Light mode with paper gradient
- [x] Theme toggle in header
- [x] Persist preference to localStorage
- [x] Respect system preference

## Phase 3: Tauri Integration

### 3.1 Project Setup
- [x] Initialize Tauri project
- [x] Configure `tauri.conf.json` (window size, title, etc.)
- [x] Set up Rust backend structure
- [x] Configure build scripts

### 3.2 Window Configuration
- [x] Set default window size (1920x1080)
- [x] Configure window title ("Hacker News | Cyberpunk Edition")
- [x] Set minimum window dimensions (1024x768)
- [ ] Add window icon (HN-style Y with pastel colors)

### 3.3 Tauri Commands (Rust)
- [x] `open_external_link(url)` - open URL in default browser
- [x] `get_app_version()` - return app version
- [ ] `check_for_updates()` - (optional) update checker

### 3.4 Native Features
- [ ] System tray icon (optional)
- [ ] Notifications for new stories (optional)
- [ ] Keyboard shortcuts (Cmd/Ctrl+R refresh, etc.)
- [x] Dark mode support (follow system)

### 3.5 Build & Distribution
- [ ] Configure build for macOS (`.app` bundle)
- [ ] Configure build for Windows (`.msi`/`.exe`)
- [ ] Configure build for Linux (`.AppImage`/`.deb`)
- [ ] Set up code signing (macOS/Windows)
- [ ] Create release workflow (GitHub Actions)

## Phase 4: Polish & Optimization

### 4.1 Performance
- [ ] Lazy load comments (fetch on expand)
- [ ] Virtual scrolling for long lists
- [ ] Bundle size analysis

### 4.2 UX Improvements
- [ ] Offline indicator
- [ ] Pull-to-refresh gesture
- [ ] Story read tracking (local storage)
- [ ] Search functionality (optional)
- [ ] Bookmarks/favorites (optional)

### 4.3 Accessibility
- [ ] Keyboard navigation throughout
- [ ] Screen reader labels
- [ ] Focus indicators
- [ ] High contrast support

### 4.4 Testing
- [ ] E2E tests with Playwright/Tauri driver
- [ ] Visual regression tests
- [ ] Performance benchmarks

---

## File Structure

```
pastel-hn/
├── web/                    # Frontend
│   ├── src/
│   │   ├── api.ts          # HN API client
│   │   ├── types.ts        # TypeScript types
│   │   ├── theme.ts        # Theme management
│   │   ├── styles/         # CSS
│   │   │   └── main.css    # Cyberpunk styles
│   │   └── main.ts         # Entry point
│   ├── index.html
│   └── package.json
├── src-tauri/              # Tauri Rust backend
│   ├── src/
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/
│   └── rationale/          # Architecture Decision Records
│       └── 0001_removing_zig_wasm_layer.md
├── TODO.md
├── AGENTS.md
├── Taskfile.yml
└── VERSION
```

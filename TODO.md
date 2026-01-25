# pastel-hn - The Best Hacker News Desktop Client

**Goal:** Build the definitive Hacker News desktop experience - a native app that surpasses all existing HN clients in usability, visual design, and reading comfort.

> **Note:** Phase 1 (Zig/WASM) was removed in v0.2.0. See [ADR-0001](docs/rationale/0001_removing_zig_wasm_layer.md) for rationale.

---

## Design Philosophy

- **Reader-First**: Optimize for comfortable, extended reading sessions
- **Visual Hierarchy**: Clear distinction between content types (stories, comments, meta)
- **Responsive Feedback**: Every interaction should feel immediate and satisfying
- **Keyboard-Centric**: Power users can navigate entirely without a mouse
- **Beautiful by Default**: Stunning Cyberpunk Pastel visuals that don't sacrifice usability

---

## Phase 1: Core Foundation (API & Types)

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
- [x] `fetchUser(id: string): Promise<HNUser>`
- [x] `fetchStoryWithComments(id: number, depth?: number): Promise<StoryWithComments>`

### 1.3 Caching & Performance
- [x] Implement in-memory cache for items
- [x] Add TTL-based cache invalidation
- [ ] Cache story lists with shorter TTL
- [ ] Intelligent prefetching for visible stories
- [ ] Background refresh for stale data

### 1.4 Utilities
- [x] `formatTimeAgo(timestamp)` - relative time formatting
- [x] `extractDomain(url)` - domain extraction for display

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
- [ ] Font size scaling options (compact/normal/comfortable)

### 2.3 Component Design System
- [x] Cyber-frame panels with corner accents
- [x] Glass morphism card effects
- [x] Line-only SVG icon set
- [x] Animated hover states with glow
- [x] Score heat indicators (warm/hot/fire)
- [x] Type-based accent colors (Ask/Show/Jobs)
- [ ] Skeleton loading states
- [ ] Toast notifications

### 2.4 Animations & Micro-interactions
- [x] Smooth hover transitions (0.25s ease)
- [x] Corner accent expansion on hover
- [x] Score pulse animation for hot stories
- [ ] Page transition animations
- [ ] List item stagger animations
- [ ] Collapse/expand animations for comments

---

## Phase 3: Core UI Components

### 3.1 Navigation
- [x] Header with logo and nav tabs
- [x] Feed switching (top/new/best/ask/show/jobs)
- [x] Active state indicators
- [x] Theme toggle button
- [ ] Search button/modal
- [ ] User menu (future: auth)

### 3.2 Story List View
- [x] Story cards with full metadata
- [x] Rank badges with cyber styling
- [x] Upvote buttons (visual only for now)
- [x] Domain display for external links
- [x] Comment count links
- [x] Infinite scroll with loading indicator
- [x] Pull-to-refresh gesture
- [ ] "Back to top" floating button

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
- [ ] Theme selection (dark/light/system)
- [ ] Font size adjustment
- [ ] Information density (compact/normal/comfortable)
- [ ] Default feed selection
- [ ] Keyboard shortcut reference

---

## Phase 4: User Experience Excellence

### 4.1 Keyboard Navigation
- [x] `j`/`k` - Navigate stories up/down
- [x] `Enter` - Open story/expand comments
- [x] `o` - Open link in browser
- [ ] `c` - Focus comments
- [x] `Escape` - Go back/close modal
- [x] `r` - Refresh current feed
- [x] `1-6` - Switch feeds (top/new/best/ask/show/jobs)
- [ ] `/` - Focus search
- [x] `?` - Show keyboard shortcuts

### 4.2 Reading Experience
- [x] Reading position memory (per story)
- [x] Scroll position preservation on back
- [ ] "New comments" indicator on revisit
- [x] Mark stories as read (visual indicator)
- [ ] Reading time estimates
- [ ] Distraction-free reading mode

### 4.3 Smart Features
- [ ] Intelligent prefetching (next page, hovered stories)
- [ ] Comment count change detection
- [ ] Story score trending indicator
- [ ] "Hot" story detection algorithm
- [ ] Duplicate story detection

### 4.4 Offline Support
- [ ] Offline indicator in header
- [ ] Cache stories for offline reading
- [ ] Queue actions for when online
- [ ] Sync status indicators

### 4.5 Bookmarks & History
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
- [x] `open_external_link(url)` - system browser
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
- [ ] Virtual scrolling for 500+ items
- [ ] Lazy comment loading (fetch on expand)
- [ ] Image lazy loading (user avatars, if added)
- [ ] Bundle size optimization (<100KB JS)
- [ ] First contentful paint <500ms

### 6.2 Accessibility
- [ ] Full keyboard navigation
- [ ] ARIA labels for all interactive elements
- [ ] Screen reader announcements
- [ ] Focus trap in modals
- [ ] High contrast mode
- [ ] Reduced motion support

### 6.3 Testing
- [ ] Unit tests for API functions
- [ ] Component tests for UI
- [ ] E2E tests with Playwright
- [ ] Visual regression tests
- [ ] Performance benchmarks
- [ ] Accessibility audit (axe-core)

### 6.4 Documentation
- [ ] README with screenshots
- [ ] Keyboard shortcut reference
- [ ] Contributing guide
- [ ] Architecture overview

---

## File Structure

```
pastel-hn/
├── web/                        # Frontend
│   ├── src/
│   │   ├── api.ts              # HN API client
│   │   ├── types.ts            # TypeScript types
│   │   ├── theme.ts            # Theme management
│   │   ├── keyboard.ts         # Keyboard navigation
│   │   ├── storage.ts          # LocalStorage helpers
│   │   ├── components/         # UI components (future)
│   │   ├── styles/
│   │   │   └── main.css        # Cyberpunk styles
│   │   └── main.ts             # Entry point
│   ├── index.html
│   └── package.json
├── src-tauri/                  # Tauri Rust backend
│   ├── src/
│   │   └── main.rs
│   ├── icons/                  # App icons
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/
│   └── rationale/              # Architecture Decision Records
│       └── 0001_removing_zig_wasm_layer.md
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

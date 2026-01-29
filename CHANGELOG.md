# Changelog

All notable changes to pastel-hn will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fixed 8 subtle bugs in zen mode, theme, and view transition interactions
- Light mode zen background now uses proper light tint (`rgba(255,255,255,0.02)`)
- Removed inline skeleton width to prevent race conditions during async loading
- Fixed animation duration mismatch for view-fade-out (0.2s)
- Added theme/high contrast callbacks to refresh virtual scroll on changes
- Fixed window decorations race condition on startup (checks fullscreen state)
- Disabled view transitions when in zen mode to prevent layout thrashing

### Changed
- **BREAKING**: Updated theme storage key from `wasm-hn-theme` to `pastel-hn-theme`
  - User theme preferences will reset to system default on first launch after update
  - High contrast key also updated from `wasm-hn-high-contrast` to `pastel-hn-high-contrast`

## [0.14.6] - 2026-01-27

### Added
- Comprehensive test coverage for UI components (navigation, story-detail, user-profile - 119 tests)
- Visual regression tests with Playwright (21 tests for themes, modals, zen mode, responsive layouts)
- Performance benchmarks measuring FCP, TTFS, and interaction timing
- Accessibility audit tests using axe-core for WCAG 2.1 AA compliance (16 tests)

### Changed
- Excluded color-contrast from accessibility modal tests (Cyberpunk Pastel aesthetic trade-off)

## [0.14.5] - 2026-01-27

### Added
- `test:rust` and `test:all` tasks in Taskfile
- E2E tests included in `check:all` task

### Fixed
- Help modal Escape key handler (added id attribute)

## [0.14.4] - 2026-01-26

### Changed
- Clarified test scripts in package.json

### Fixed
- Context menu hiding when clicking its buttons

## [0.14.3] - 2026-01-26

### Added
- Background refresh for stale cache data with "new stories available" banner
- Vim-style keyboard navigation in article/detail view (`j`/`k` scrolling, `g`/`G` jump)

### Fixed
- Correct scroll container for keyboard navigation
- Key `7` now works for Saved feed navigation

## [0.14.2] - 2026-01-26

### Added
- Vim-style keyboard navigation for story list

### Fixed
- Preserve zen mode when navigating back to list
- Skip re-fetch when returning to cached list

## [0.14.1] - 2026-01-25

### Added
- Deep linking support (`pastelhn://` protocol for items, users, feeds)
- Global keyboard shortcuts (`Cmd+Shift+H` show, `Cmd+Shift+R` refresh)

### Fixed
- System tray icon loading on macOS

## [0.14.0] - 2026-01-25

### Added
- System tray with quick actions (feeds, refresh, search)
- Native notifications for followed stories
- Follow button on story detail view
- Background polling for followed story updates
- Followed stories storage API

### Known Issues
- Tray icon not visible on macOS due to Tauri v2.6+ bug (#13770)

## [0.13.7] - 2026-01-25

### Added
- Screen reader navigation improvements (focus-visible, ARIA dialog/tablist patterns)

## [0.13.6] - 2026-01-25

### Added
- Proper heading hierarchy for accessibility

## [0.13.5] - 2026-01-24

### Added
- High contrast mode for accessibility (WCAG AAA compliant)

## [0.13.4] - 2026-01-24

### Added
- Request deduplication to prevent concurrent duplicate API calls

## [0.13.3] - 2026-01-24

### Added
- Favicon lazy loading for story domains
- JSDoc documentation for TypeScript modules

### Fixed
- Favicon lazy loading robustness

## [0.13.2] - 2026-01-24

### Changed
- Optimized bundle size (128KB → 106KB, 17% reduction)

## [0.13.1] - 2026-01-24

### Changed
- Split main.ts into focused modules for better maintainability

## [0.13.0] - 2026-01-23

### Added
- Duplicate story detection across feeds

## [0.12.1] - 2026-01-23

### Added
- Error boundary to catch uncaught errors and prevent full app crashes

## [0.12.0] - 2026-01-23

### Added
- Settings export/import functionality
- Cache management in settings panel (view size, clear)
- Export bookmarks as JSON
- Tauri native file dialog for exports

### Fixed
- Export download reliability with SaveResult type

## [0.11.2] - 2026-01-22

### Added
- Export bookmarks feature in settings

## [0.11.1] - 2026-01-22

### Added
- Offline indicator in header
- Graceful degradation for bookmarks when offline

## [0.11.0] - 2026-01-22

### Added
- Bookmark stories locally with dedicated Saved feed (`7` key)
- Story score trending indicators (rising/hot badges)
- New comments indicator badge on story list

## [0.10.5] - 2026-01-21

### Changed
- Modularized codebase (extracted zen-mode, help-modal, search, pull-refresh, animations, etc.)

## [0.10.4] - 2026-01-21

### Fixed
- E2E test selectors and zen mode transition timing

## [0.10.3] - 2026-01-21

### Added
- E2E tests for user profile, settings, search, share/copy, accessibility

### Fixed
- Heading hierarchy for accessibility

## [0.10.2] - 2026-01-21

### Fixed
- Exit zen mode when navigating back to list
- Fullscreen exit delay for macOS reliability

## [0.10.1] - 2026-01-20

### Fixed
- Non-null assertion in share-copy test

## [0.10.0] - 2026-01-20

### Added
- Share/copy link buttons in story detail view (HN link, article link, share)
- Context menu on text selection for "Explain This" and "Draft Reply" in zen mode
- Skip-to-content link for keyboard accessibility
- ARIA live region for screen reader announcements
- Screen reader announcements for story/user profile loading and errors
- Unit tests for copilot-client.ts and client.rs

## [0.9.1] - 2026-01-19

### Changed
- AI assistant is now restricted to zen mode only for a more focused experience

### Added
- Unit tests for copilot-client.ts (32 tests)
- Unit tests for Rust HnClient (16 tests)

## [0.9.0] - 2026-01-19

### Added
- **GitHub Copilot AI Assistant** for reading enhancement
  - Summarize articles with AI
  - Analyze discussion threads for key insights
  - Explain selected text or concepts
  - Draft reply suggestions for comments
  - Free-form Q&A about stories
- Collapsible AI assistant panel in story detail view
- Keyboard shortcut `a` to toggle assistant panel
- Markdown rendering for AI responses
- CopilotService backend with session management

## [0.8.7] - 2025-01-23

### Fixed
- Screenshot table layout in README

## [0.8.6] - 2025-01-23

### Added
- `b` shortcut to navigate back without exiting zen mode

## [0.8.5] - 2025-01-22

### Fixed
- Reduced gap between theme and settings buttons in header

## [0.8.4] - 2025-01-22

### Fixed
- Increased settings button left margin in header

## [0.8.3] - 2025-01-22

### Changed
- Increased article body font size by 2px for all density modes

## [0.8.2] - 2025-01-21

### Fixed
- Removed max-width constraint from article reader for better readability

## [0.8.1] - 2025-01-21

### Added
- Lazy comment loading (fetch on expand with depth=1)
- Improved article reader

## [0.8.0] - 2025-01-20

### Added
- **Intelligent Prefetching** for instant navigation
  - Prefetch next page of stories while scrolling
  - Prefetch hovered stories for instant detail view
- Reading time estimates for articles and text posts
- Reply count badges on comments
- Enhanced article loading with better skeleton states

## [0.7.14] - 2025-01-19

### Fixed
- Increased comment card background opacity for better visibility

## [0.7.13] - 2025-01-19

### Fixed
- Changed fully transparent backgrounds to 2% opacity

### Changed
- Bundle identifier changed to org.pastelhn.desktop

## [0.7.12] - 2025-01-18

### Fixed
- Zen mode decoration race condition
- Added detail view glow effects

## [0.7.11] - 2025-01-18

### Added
- Playwright E2E test suite

### Changed
- Excluded e2e directory from vitest test runner

## [0.7.10] - 2025-01-17

### Fixed
- Zen mode story cards now use correct light theme colors

## [0.7.9] - 2025-01-17

### Added
- Breathing glow animations to story cards and comments

## [0.7.8] - 2025-01-16

### Added
- `Cmd+Q` / `Ctrl+Q` keyboard shortcut to quit app

## [0.7.7] - 2025-01-16

### Fixed
- Increased story card opacity in zen mode for better readability

## [0.7.6] - 2025-01-15

### Changed
- Improved comment collapse animations and zen mode consistency

## [0.7.5] - 2025-01-15

### Fixed
- Window decorations now visible on startup

## [0.7.4] - 2025-01-14

### Added
- Dark mode styling for zen mode badge

## [0.7.3] - 2025-01-14

### Fixed
- Story detail width now matches list view in normal and zen modes

## [0.7.2] - 2025-01-13

### Added
- **Zen Mode** for distraction-free reading
- Window state plugin to remember window position and size
- Virtual scroll improvements for zen mode

### Changed
- Improved comment collapse/expand animations
- Increased story rank font size
- More subtle theme/settings button borders in light mode

## [0.7.0] - 2025-01-12

### Added
- Enhanced Zen mode with fullscreen, badge indicator, and theme toggle

## [0.6.0] - 2025-01-11

### Added
- **Zen Mode** (initial implementation) for distraction-free reading with `z` key
- Reading time estimates for stories and articles
- Smooth collapse/expand animations for comments
- Focus trap in modals for accessibility
- Keyboard shortcut reference in settings panel
- Connection error recovery with retry button
- Clear reading history option in settings
- New pastel gradient app icon with 3D beveled edges

## [0.5.0] - 2025-01-08

### Added
- **Algolia Search Integration** for searching HN stories and comments
- Search modal with keyboard shortcut `/`
- Search results with story and comment types
- Sort by relevance or date
- Filter by stories, comments, or all

## [0.4.0] - 2025-01-05

### Changed
- **Migrated API layer to Rust** for better performance
  - HnClient with reqwest HTTP client
  - In-memory caching with moka (5min TTL, 10K items max)
  - Story IDs cache with 2min TTL
  - User cache with 10min TTL
  - Connection pooling and timeouts
  - Structured error handling with thiserror
  - Structured logging with tracing

### Added
- Tauri commands for all API operations
- Batch item fetching for improved performance
- Comment tree fetching with depth control

## [0.3.0] - 2025-01-02

### Added
- **User Profile View** with karma, account age, and about section
- Submission history tabs (all/stories/comments)
- Recent comments list with pagination
- Click on username to view profile

## [0.2.0] - 2024-12-28

### Removed
- Zig/WASM layer (see ADR-0001 for rationale)

### Changed
- Simplified architecture to TypeScript + Tauri only
- Direct HN API calls from TypeScript

## [0.1.0] - 2024-12-20

### Added
- Initial release with core Hacker News browsing functionality
- All HN feeds: top/new/best/ask/show/jobs
- Story list with infinite scroll
- Story detail view with threaded comments
- Collapsible comment branches
- Dark and light themes with Cyberpunk Pastel aesthetic
- Full keyboard navigation (j/k/Enter/Escape/1-6)
- Virtual scrolling for large lists
- Mark stories as read
- Reading position memory
- Native Tauri desktop app for macOS/Windows/Linux

[0.14.6]: https://github.com/anomalyco/pastel-hn/compare/v0.14.5...v0.14.6
[0.14.5]: https://github.com/anomalyco/pastel-hn/compare/v0.14.4...v0.14.5
[0.14.4]: https://github.com/anomalyco/pastel-hn/compare/v0.14.3...v0.14.4
[0.14.3]: https://github.com/anomalyco/pastel-hn/compare/v0.14.2...v0.14.3
[0.14.2]: https://github.com/anomalyco/pastel-hn/compare/v0.14.1...v0.14.2
[0.14.1]: https://github.com/anomalyco/pastel-hn/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/anomalyco/pastel-hn/compare/v0.13.7...v0.14.0
[0.13.7]: https://github.com/anomalyco/pastel-hn/compare/v0.13.6...v0.13.7
[0.13.6]: https://github.com/anomalyco/pastel-hn/compare/v0.13.5...v0.13.6
[0.13.5]: https://github.com/anomalyco/pastel-hn/compare/v0.13.4...v0.13.5
[0.13.4]: https://github.com/anomalyco/pastel-hn/compare/v0.13.3...v0.13.4
[0.13.3]: https://github.com/anomalyco/pastel-hn/compare/v0.13.2...v0.13.3
[0.13.2]: https://github.com/anomalyco/pastel-hn/compare/v0.13.1...v0.13.2
[0.13.1]: https://github.com/anomalyco/pastel-hn/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/anomalyco/pastel-hn/compare/v0.12.1...v0.13.0
[0.12.1]: https://github.com/anomalyco/pastel-hn/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/anomalyco/pastel-hn/compare/v0.11.2...v0.12.0
[0.11.2]: https://github.com/anomalyco/pastel-hn/compare/v0.11.1...v0.11.2
[0.11.1]: https://github.com/anomalyco/pastel-hn/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/anomalyco/pastel-hn/compare/v0.10.5...v0.11.0
[0.10.5]: https://github.com/anomalyco/pastel-hn/compare/v0.10.4...v0.10.5
[0.10.4]: https://github.com/anomalyco/pastel-hn/compare/v0.10.3...v0.10.4
[0.10.3]: https://github.com/anomalyco/pastel-hn/compare/v0.10.2...v0.10.3
[0.10.2]: https://github.com/anomalyco/pastel-hn/compare/v0.10.1...v0.10.2
[0.10.1]: https://github.com/anomalyco/pastel-hn/compare/v0.10.0...v0.10.1
[0.10.0]: https://github.com/anomalyco/pastel-hn/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/anomalyco/pastel-hn/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/anomalyco/pastel-hn/compare/v0.8.7...v0.9.0
[0.8.7]: https://github.com/anomalyco/pastel-hn/compare/v0.8.6...v0.8.7
[0.8.6]: https://github.com/anomalyco/pastel-hn/compare/v0.8.5...v0.8.6
[0.8.5]: https://github.com/anomalyco/pastel-hn/compare/v0.8.4...v0.8.5
[0.8.4]: https://github.com/anomalyco/pastel-hn/compare/v0.8.3...v0.8.4
[0.8.3]: https://github.com/anomalyco/pastel-hn/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/anomalyco/pastel-hn/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/anomalyco/pastel-hn/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/anomalyco/pastel-hn/compare/v0.7.14...v0.8.0
[0.7.14]: https://github.com/anomalyco/pastel-hn/compare/v0.7.13...v0.7.14
[0.7.13]: https://github.com/anomalyco/pastel-hn/compare/v0.7.12...v0.7.13
[0.7.12]: https://github.com/anomalyco/pastel-hn/compare/v0.7.11...v0.7.12
[0.7.11]: https://github.com/anomalyco/pastel-hn/compare/v0.7.10...v0.7.11
[0.7.10]: https://github.com/anomalyco/pastel-hn/compare/v0.7.9...v0.7.10
[0.7.9]: https://github.com/anomalyco/pastel-hn/compare/v0.7.8...v0.7.9
[0.7.8]: https://github.com/anomalyco/pastel-hn/compare/v0.7.7...v0.7.8
[0.7.7]: https://github.com/anomalyco/pastel-hn/compare/v0.7.6...v0.7.7
[0.7.6]: https://github.com/anomalyco/pastel-hn/compare/v0.7.5...v0.7.6
[0.7.5]: https://github.com/anomalyco/pastel-hn/compare/v0.7.4...v0.7.5
[0.7.4]: https://github.com/anomalyco/pastel-hn/compare/v0.7.3...v0.7.4
[0.7.3]: https://github.com/anomalyco/pastel-hn/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/anomalyco/pastel-hn/compare/v0.7.0...v0.7.2
[0.7.0]: https://github.com/anomalyco/pastel-hn/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/anomalyco/pastel-hn/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/anomalyco/pastel-hn/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/anomalyco/pastel-hn/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/anomalyco/pastel-hn/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/anomalyco/pastel-hn/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/anomalyco/pastel-hn/releases/tag/v0.1.0

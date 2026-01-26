# Changelog

All notable changes to pastel-hn will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Share/copy link buttons in story detail view (HN link, article link, share)
- Context menu on text selection for "Explain This" and "Draft Reply" in zen mode
- Skip-to-content link for keyboard accessibility
- ARIA live region for screen reader announcements
- Screen reader announcements for story/user profile loading and errors

### Changed
- Updated TODO.md with completed accessibility items

## [0.9.1] - 2025-01-25

### Changed
- AI assistant is now restricted to zen mode only for a more focused experience

### Added
- Unit tests for copilot-client.ts (32 tests)
- Unit tests for Rust HnClient (16 tests)

## [0.9.0] - 2025-01-24

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

[Unreleased]: https://github.com/anomalyco/pastel-hn/compare/v0.9.1...HEAD
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

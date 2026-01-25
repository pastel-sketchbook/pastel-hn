# ROLES AND EXPERTISE

This codebase operates with two distinct but complementary roles:

## Implementor Role

You are a senior TypeScript and Tauri engineer who practices Kent Beck's Test-Driven Development (TDD) and Tidy First principles. You will implement changes in this repository with discipline, incrementalism, and correctness-first mindset.

**Responsibilities:**
- Write failing tests first (Red → Green → Refactor)
- Implement minimal code to pass tests
- Follow commit conventions (struct, feat, fix, refactor, chore)
- Separate structural changes from behavioral changes
- Ensure correct API handling and data transformation
- Maintain clarity and type safety
- Use proper error handling with typed errors

## Reviewer Role

You are a senior TypeScript and Tauri engineer who evaluates changes for quality, correctness, and adherence to project standards. You review all changes before they are merged.

**Responsibilities:**
- Provide a comprehensive review with grade (A-F) and recommended actions
- Verify tests exist for new logic and demonstrate edge case coverage
- Confirm API correctness for HN data fetching
- Ensure errors are handled gracefully
- Validate TypeScript types are correct and complete
- Check that changes follow "Tidy First" separation
- Run tests to verify code health
- Assess performance implications of changes

# SCOPE OF THIS REPOSITORY

This repository contains `pastel-hn`, the best UI/UX Hacker News desktop client:

**Goal:** Build the definitive Hacker News desktop experience - a native app that surpasses all existing HN clients in usability, visual design, and reading comfort. We aim to make browsing Hacker News a delightful, distraction-free experience with a unique Cyberpunk Pastel aesthetic.

**Design Philosophy:**
- **Reader-First**: Optimize for comfortable, extended reading sessions
- **Visual Hierarchy**: Clear distinction between content types (stories, comments, meta)
- **Responsive Feedback**: Every interaction should feel immediate and satisfying
- **Keyboard-Centric**: Power users can navigate entirely without a mouse
- **Beautiful by Default**: Stunning visuals that don't sacrifice usability

**Tech Stack:**
- **TypeScript + Bun**: Frontend application and API client (Bun for runtime & package management)
- **HTML/CSS**: UI with Cyberpunk Pastel aesthetic
- **Tauri**: Desktop shell for macOS, Windows, Linux (minimal Rust backend)

**Core Features:**
- All HN feeds: top/new/best/ask/show/jobs with instant switching
- Threaded comment views with smart collapsing
- Story and comment detail views
- User profiles with submission history
- Dark/light themes with Cyberpunk styling
- Native desktop integration (system browser, notifications)

**UX Differentiators:**
- Smooth animations and micro-interactions
- Intelligent prefetching for instant navigation
- Reading position memory across sessions
- Customizable information density
- Keyboard shortcuts for all actions
- Offline reading support (planned)

> **Note:** This project originally included a Zig/WASM layer which was removed in v0.2.0.
> See [ADR-0001](docs/rationale/0001_removing_zig_wasm_layer.md) for the rationale.

# CORE DEVELOPMENT PRINCIPLES

- Always follow the TDD micro-cycle: Red → Green → (Tidy / Refactor).
- Change behavior and structure in separate, clearly identified commits.
- Keep each change the smallest meaningful step forward.
- **Correctness First**: API operations and data transformations must be explicitly tested.
- **Clarity**: Code should be readable and maintainable; complex logic should be well-commented.

# COMMIT CONVENTIONS

Use the following prefixes:
- struct: structural / tidying change only (no behavioral impact, tests unchanged).
- feat: new behavior covered by new tests.
- fix: defect fix covered by a failing test first.
- refactor: behavior-preserving code improvement.
- chore: tooling / config / documentation.

# TASK NAMING CONVENTION

Use colon (`:`) as a separator in task names, not hyphens. For example:
- `build:web`
- `build:tauri`
- `dev:web`
- `test:web`

# RELEASE WORKFLOW

When directed by human feedback to perform a release, the implementor executes the appropriate release task based on semantic versioning:

**Release Tasks (Taskfile):**
- `task release:patch` - For bug fixes and patches (e.g., 0.1.0 → 0.1.1)
- `task release:minor` - For new features and backward-compatible changes (e.g., 0.1.0 → 0.2.0)
- `task release:major` - For breaking changes (e.g., 0.1.0 → 1.0.0)

**Release Process:**
1. Run the appropriate release task (patch/minor/major) per human direction
2. The task automatically:
   - Formats code
   - Bumps version in VERSION file
   - Creates a commit with message `chore: bump version to X.Y.Z`
   - Creates an annotated git tag `vX.Y.Z`
3. After completion, push the tag: `git push --tags`

**When to Release:**
- **Patch**: Bug fixes, correctness improvements, documentation updates.
- **Minor**: New functions, new features, backward-compatible enhancements.
- **Major**: Breaking API changes, removal of features, significant architectural changes.

# TIDY FIRST (STRUCTURAL) CHANGES

Structural changes are safe reshaping steps. Examples for this codebase:
- Splitting large functions into smaller, focused utilities
- Reorganizing test modules for clarity
- Extracting magic numbers into named constants
- Refactoring API functions into a dedicated module
- Adding helper functions for data transformation

Perform structural changes before introducing new behavior that depends on them.

# BEHAVIORAL CHANGES

Behavioral changes add new capabilities. Examples:
- Adding new API endpoint support (e.g., /askstories)
- Implementing comment fetching with depth control
- Adding caching layer
- Supporting new story types

A behavioral commit:
1. Adds a failing test (unit test for new functionality).
2. Implements minimal code to pass it.
3. Follows with a structural commit if the new logic is messy.

# TEST-DRIVEN DEVELOPMENT IN THIS REPO

1. **Unit Tests (TypeScript)**: Focus on:
   - API wrapper functions
   - Data transformation functions
   - Cache behavior
   - Utility functions (formatTimeAgo, extractDomain, etc.)

2. **Integration Tests**:
   - Mock API responses
   - Full flow from API to UI

3. **E2E Tests (Tauri)**:
   - Window behavior
   - Navigation flows
   - External link handling

# WRITING TESTS

## TypeScript Tests
- Use Vitest
- Mock fetch for API tests
- Test async behavior with proper awaits
- Name tests by behavior: `fetches top stories correctly`, `caches items with TTL`

Example:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { fetchItem } from './api'

describe('fetchItem', () => {
  it('returns parsed item for valid id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 123, title: 'Test' })
    }))
    
    const item = await fetchItem(123)
    expect(item.id).toBe(123)
    expect(item.title).toBe('Test')
  })
})
```

# API DESIGN GUIDELINES

## TypeScript API
- **Promise-based**: All API calls return Promises
- **Type-safe**: Full TypeScript types for all data structures
- **Error handling**: Proper error propagation with typed errors
- **Caching**: In-memory cache with TTL for items

## Function Signatures
- Keep function signatures simple and focused
- Use optional parameters with sensible defaults
- Return typed objects, not raw JSON

# HN API REFERENCE

Base URL: `https://hacker-news.firebaseio.com/v0/`

**Endpoints:**
- `/topstories.json` - Top 500 story IDs
- `/newstories.json` - Newest 500 story IDs
- `/beststories.json` - Best 500 story IDs
- `/askstories.json` - Ask HN story IDs
- `/showstories.json` - Show HN story IDs
- `/jobstories.json` - Job story IDs
- `/item/{id}.json` - Single item (story, comment, etc.)
- `/user/{id}.json` - User profile

**Item Fields:**
- `id`: unique integer ID
- `type`: "story", "comment", "job", "poll", "pollopt"
- `by`: username of author
- `time`: Unix timestamp
- `text`: HTML content (comments, Ask HN)
- `url`: URL (stories)
- `score`: points
- `title`: title (stories)
- `descendants`: total comment count
- `kids`: array of child comment IDs

# TYPESCRIPT-SPECIFIC GUIDELINES

## API Client
- Use native `fetch()` for HTTP requests
- Parse responses with `response.json()`
- Transform raw API responses to typed interfaces
- Handle missing optional fields gracefully

## UI Components
- Keep components small and focused
- Use template literals for HTML generation
- Escape user-generated content to prevent XSS
- Minimal dependencies

## Styling
- Use CSS custom properties for theming
- Support dark and light themes
- Use the Cyberpunk Pastel aesthetic consistently

# TAURI-SPECIFIC GUIDELINES

## Commands
- Keep Rust commands minimal
- Primary logic in TypeScript
- Use for native-only features (open links, notifications)

## Configuration
- Sensible window defaults (1024x768 minimum)
- Proper app metadata
- Security: disable unnecessary APIs

# CODE REVIEW CHECKLIST

- Are there tests for the new logic?
- Are errors handled gracefully?
- Does the change maintain API correctness?
- Does the change follow "Tidy First" separation?
- Is the TypeScript properly typed?
- Is the CSS following the design system?
- Is user content properly escaped?

# OUT OF SCOPE / ANTI-PATTERNS

- Server-side rendering (this is a client app)
- Heavy UI frameworks (keep it simple)
- Storing user credentials (read-only HN client)
- Untyped API responses

# DOCUMENTATION CONVENTION

## Rationale & Design Documents

Store rationale-related documentation in `docs/rationale/` with a **`000n_`** numeric prefix.

**Rationale docs include:**
- Design decisions and alternatives considered
- API design explanations
- Performance trade-offs
- Architecture Decision Records (ADRs)

**Example:**
```
docs/rationale/
├── 0001_removing_zig_wasm_layer.md
├── 0002_tauri_vs_electron.md
└── 0003_caching_strategy.md
```

## Status & Summary Files

Do **not** commit status or summary files (e.g., `PROGRESS.md`, `IMPLEMENTATION_PLAN.md`). These are transient and belong in conversation threads, not the repository.

**Exception:** `TODO.md` is acceptable as a high-level roadmap.

# SUMMARY MANTRA

Fetch stories. Parse JSON. Render cleanly. TDD every step.

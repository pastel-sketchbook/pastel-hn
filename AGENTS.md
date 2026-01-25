# ROLES AND EXPERTISE

This codebase operates with two distinct but complementary roles:

## Implementor Role

You are a senior Zig systems and WebAssembly engineer who practices Kent Beck's Test-Driven Development (TDD) and Tidy First principles. You will implement changes in this repository with discipline, incrementalism, and correctness-first mindset.

**Responsibilities:**
- Write failing tests first (Red → Green → Refactor)
- Implement minimal code to pass tests
- Follow commit conventions (struct, feat, fix, refactor, chore)
- Separate structural changes from behavioral changes
- Ensure correct JSON parsing and HTTP handling
- Maintain clarity and safety in low-level operations
- Use proper error handling without panics in production paths

## Reviewer Role

You are a senior Zig systems and WebAssembly engineer who evaluates changes for quality, correctness, and adherence to project standards. You review all changes before they are merged.

**Responsibilities:**
- Provide a comprehensive review with grade (A-F) and recommended actions
- Verify tests exist for new logic and demonstrate edge case coverage
- Confirm API correctness for HN data fetching
- Ensure errors are handled gracefully without panicking
- Validate JSON parsing and memory management
- Check that changes follow "Tidy First" separation
- Run tests to verify code health
- Assess performance implications of changes

# SCOPE OF THIS REPOSITORY

This repository contains `wasm-hn`, a Hacker News desktop client:

**Goal:** Build a native desktop Hacker News reader with a Cyberpunk futuristic aesthetic featuring pastel tones and line-only icons.

**Tech Stack:**
- **Zig → WASM**: Core HN API client library compiled to WebAssembly
- **TypeScript + Bun**: Glue layer between WASM and UI (Bun for runtime & package management)
- **HTML/CSS**: Frontend UI matching classic HN design
- **Tauri**: Desktop shell for macOS, Windows, Linux

**Features:**
- Fetches stories, comments, and user data from HN Firebase API
- Displays top/new/best/ask/show/jobs story feeds
- Renders threaded comment views
- Opens external links in system browser
- Minimal, fast, native desktop experience

# CORE DEVELOPMENT PRINCIPLES

- Always follow the TDD micro-cycle: Red → Green → (Tidy / Refactor).
- Change behavior and structure in separate, clearly identified commits.
- Keep each change the smallest meaningful step forward.
- **Correctness First**: JSON parsing and API operations must be explicitly tested and verified.
- **Clarity**: Code should be readable and maintainable; algorithms should be well-commented.

# COMMIT CONVENTIONS

Use the following prefixes:
- struct: structural / tidying change only (no behavioral impact, tests unchanged).
- feat: new behavior covered by new tests.
- fix: defect fix covered by a failing test first.
- refactor: behavior-preserving code improvement.
- chore: tooling / config / documentation.

# TASK NAMING CONVENTION

Use colon (`:`) as a separator in task names, not hyphens. For example:
- `build:wasm` (not `build-wasm`)
- `build:tauri`
- `dev:web`
- `test:zig`

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
- Refactoring JSON parsing into a dedicated module
- Adding helper functions for URL building

Perform structural changes before introducing new behavior that depends on them.

# BEHAVIORAL CHANGES

Behavioral changes add new capabilities. Examples:
- Adding new API endpoint support (e.g., /askstories)
- Implementing comment fetching with depth control
- Adding caching layer in TypeScript
- Supporting new story types

A behavioral commit:
1. Adds a failing test (unit test for new functionality).
2. Implements minimal code to pass it.
3. Follows with a structural commit if the new logic is messy.

# TEST-DRIVEN DEVELOPMENT IN THIS REPO

1. **Unit Tests (Zig)**: Focus on core functions:
   - JSON parsing correctness (valid/invalid inputs)
   - URL building for all endpoints
   - Memory allocation/deallocation

2. **Unit Tests (TypeScript)**: Focus on:
   - WASM loading and memory helpers
   - API wrapper functions
   - Cache behavior

3. **Integration Tests**:
   - Mock API responses
   - Full flow from WASM to UI

4. **E2E Tests (Tauri)**:
   - Window behavior
   - Navigation flows
   - External link handling

# WRITING TESTS

## Zig Tests
- Use `test` blocks with Zig's built-in testing framework
- Name tests by behavior: `parses_story_json_correctly`, `builds_item_url`
- Test edge cases: empty arrays, missing fields, malformed JSON
- Focus on the contract (input/output) rather than internal state

Example:
```zig
test "parse story item with all fields" {
    const json = 
        \\{"id":123,"type":"story","title":"Test","url":"https://example.com"}
    ;
    const item = try parseItem(json);
    try std.testing.expectEqual(@as(u32, 123), item.id);
    try std.testing.expectEqualStrings("story", item.type);
}
```

## TypeScript Tests
- Use Vitest or Jest
- Mock WASM module for unit tests
- Test async behavior with proper awaits

# API DESIGN GUIDELINES

## Zig/WASM Exports
- **Strongly Typed Returns**: Use optional types (`?T`) for fallible operations
- **Simple Signatures**: Keep function signatures simple and focused
- **WASM Exports**: All exported functions should have `wasm_` prefix
- **No Panics**: All operations return `?T` or error instead of panicking

## TypeScript API
- **Promise-based**: All API calls return Promises
- **Type-safe**: Full TypeScript types for all data structures
- **Error handling**: Proper error propagation with typed errors

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

# ZIG-SPECIFIC GUIDELINES

## Error Handling
- **Optional Types**: Use `?T` for operations that may fail
- **No Unwrap in Prod**: Avoid `.?` operator in production paths
- **Explicit Handling**: Use `if (result) |value|` for safe unwrapping

## Memory Management
- **Stack Allocation**: Prefer fixed-size buffers where possible
- **WASM Memory**: Use `wasm_alloc` and `wasm_free` for dynamic allocation
- **No Leaks**: All allocations must be paired with deallocations
- **Buffer Safety**: Check bounds before array access

## JSON Parsing
- Handle missing optional fields gracefully
- Validate field types before access
- Limit recursion depth for nested structures

# TYPESCRIPT-SPECIFIC GUIDELINES

## WASM Integration
- Load WASM asynchronously
- Provide typed wrappers for all exports
- Handle memory copying between JS and WASM

## UI Components
- Keep components small and focused
- Use custom elements or simple functions
- Minimal dependencies

# TAURI-SPECIFIC GUIDELINES

## Commands
- Keep Rust commands minimal
- Primary logic in WASM/TypeScript
- Use for native-only features (open links, notifications)

## Configuration
- Sensible window defaults (800x600 minimum)
- Proper app metadata
- Security: disable unnecessary APIs

# CODE REVIEW CHECKLIST

- Are there tests for the new logic?
- Is JSON parsing correct for all field types?
- Are errors handled gracefully without panicking?
- Does the change maintain API correctness?
- Does the change follow "Tidy First" separation?
- Is the WASM binary size reasonable?
- Is the TypeScript properly typed?

# OUT OF SCOPE / ANTI-PATTERNS

- Server-side rendering (this is a client app)
- Heavy UI frameworks (keep it simple)
- Panicking on invalid input (use optional returns)
- Storing user credentials (read-only HN client)

# DOCUMENTATION CONVENTION

## Rationale & Design Documents

Store rationale-related documentation in `docs/rationale/` with a **`000n_`** numeric prefix.

**Rationale docs include:**
- Design decisions and alternatives considered
- API design explanations
- Performance trade-offs

**Example:**
```
docs/rationale/
├── 0001_wasm_fetch_architecture.md
├── 0002_tauri_vs_electron.md
└── 0003_json_parsing_strategy.md
```

## Status & Summary Files

Do **not** commit status or summary files (e.g., `PROGRESS.md`, `IMPLEMENTATION_PLAN.md`). These are transient and belong in Amp threads, not the repository.

**Exception:** `TODO.md` is acceptable as a high-level roadmap.

# SUMMARY MANTRA

Fetch stories. Parse JSON. Render cleanly. TDD every step.

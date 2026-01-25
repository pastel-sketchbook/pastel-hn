# ADR-0003: Tabbed Story Detail View with Reader Mode

**Status:** Accepted  
**Date:** 2026-01-25  
**Supersedes:** N/A

## Context

Users of pastel-hn frequently navigate between a story's external content and its HN comments. The previous design showed comments directly below the story metadata, requiring users to:

1. Click the external link to read the article in their system browser
2. Switch back to pastel-hn to read comments
3. Context-switch repeatedly between browser and app

This workflow is disruptive to the reading experience and contradicts our goal of being the "definitive Hacker News desktop experience."

### User Research Insights

- Many HN stories link to articles that users want to read in full
- Users often read the article first, then check comments for discussion
- Some users prefer to skim comments before deciding to read the full article
- The current flow requires leaving the app, breaking immersion

## Decision

We will implement a **tabbed interface** in the story detail view with two tabs:

1. **Story** (default) - Displays the article content extracted from the external URL
2. **Comments** - Displays the HN comment thread

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back                                                      │
│                                                              │
│  Article Title                                               │
│  example.com  ↗                                              │
│  ★ 342 points · by author · 3 hours ago · 128 comments      │
│                                                              │
│  ┌──────────┐ ┌──────────────────┐                          │
│  │  Story   │ │  Comments (128)  │                          │
│  └──────────┘ └──────────────────┘                          │
│  ═══════════                                                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  [Extracted article content displayed here]         │    │
│  │                                                     │    │
│  │  Article text with proper formatting...             │    │
│  │                                                     │    │
│  │  1,234 words                                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Article Content Extraction

We use Mozilla's Readability algorithm (via the `readability` Rust crate) to extract the main content from web pages. This approach:

- Removes navigation, ads, and other non-content elements
- Preserves article structure (headings, paragraphs, lists, code blocks)
- Provides a clean, distraction-free reading experience
- Works with most news sites, blogs, and documentation

### Implementation Architecture

```
┌─────────────────────────────────────────────┐
│  TypeScript (UI Layer)                      │
│  - Tab switching logic                      │
│  - Loading states and error handling        │
│  - Article content rendering                │
│  - Comment thread rendering                 │
└─────────────────┬───────────────────────────┘
                  │ invoke('fetch_article_content', { url })
┌─────────────────▼───────────────────────────┐
│  Rust (Data Layer)                          │
│  - HTTP fetch of external URL               │
│  - Readability content extraction           │
│  - Structured response with metadata        │
└─────────────────────────────────────────────┘
```

### Rust Dependencies Added

```toml
# Article content extraction
readability = "0.3"
url = "2.5"
```

### New Tauri Command

```rust
#[tauri::command]
async fn fetch_article_content(
    client: State<'_, SharedHnClient>,
    url: String,
) -> Result<ArticleContent, ApiError>;
```

### ArticleContent Response Type

```rust
pub struct ArticleContent {
    pub title: Option<String>,      // Article title (may differ from HN title)
    pub content: String,            // Main content as HTML
    pub text_content: String,       // Plain text version
    pub byline: Option<String>,     // Author if found
    pub excerpt: Option<String>,    // Article summary
    pub site_name: Option<String>,  // Source website name
    pub lang: Option<String>,       // Content language
    pub word_count: usize,          // Estimated word count
}
```

### Content Type Handling

| Story Type | Story Tab Content |
|------------|-------------------|
| External URL | Fetched & extracted article content |
| Ask HN | Story's text field (already available) |
| Show HN with URL | Fetched article content |
| Jobs | Job posting text |
| Failed extraction | "Open in browser" fallback button |

## Consequences

### Positive

1. **Immersive reading** - Users can read articles without leaving the app
2. **Seamless context switching** - One click to switch between article and comments
3. **Clean reading experience** - Readability removes clutter from web pages
4. **Reduced cognitive load** - No need to manage multiple windows/tabs
5. **Consistent styling** - Article content styled with Cyberpunk Pastel aesthetic
6. **Word count visibility** - Users know article length before reading

### Negative

1. **Network dependency** - Requires fetching external content (can fail)
2. **Extraction quality varies** - Some sites may not extract cleanly
3. **No images by default** - Readability may strip some images
4. **JavaScript-rendered content** - Cannot extract content from SPAs
5. **Paywall content** - Cannot access paywalled articles

### Mitigations

- **Graceful degradation** - Show "Open in browser" button on extraction failure
- **Loading states** - Skeleton UI while fetching content
- **Error messaging** - Clear feedback when extraction fails
- **External link preserved** - Users can always open original URL

### Neutral

1. **Additional HTTP request** - One extra request per story (cached by browser)
2. **Memory usage** - Article content stored in memory while viewing

## Alternatives Considered

### 1. Embedded WebView

**Rejected** because:
- Brings in all the clutter we're trying to avoid
- Inconsistent styling with our aesthetic
- Security concerns with arbitrary web content
- Larger memory footprint

### 2. Side-by-Side Split Panel

**Rejected** because:
- Reduces reading width for both content types
- Complex responsive design challenges
- User explicitly requested "traditional navigation, not split panel"
- See previous implementation attempt that was reverted

### 3. External Browser Only

**Rejected** because:
- Status quo - doesn't improve the experience
- Contradicts our goal of being a complete HN client
- Breaks reading flow and immersion

## Future Enhancements

1. **Article caching** - Cache extracted content for offline reading
2. **Reading progress** - Track and restore reading position in articles
3. **Text-to-speech** - Read articles aloud
4. **Font customization** - User-selectable fonts for article content
5. **Image support** - Option to include article images
6. **Estimated read time** - Based on word count and reading speed

## References

- [Mozilla Readability](https://github.com/mozilla/readability)
- [readability-rs crate](https://crates.io/crates/readability)
- [ADR-0002: Rust API Layer](./0002_rust_api_layer.md)

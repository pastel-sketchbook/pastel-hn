# ADR-0010: YouTube Video Embed Support

## Status

Accepted (Implemented in v0.17.0)

## Context

Hacker News stories frequently link to YouTube videos. Currently, pastel-hn handles these URLs the same way as any other external link:

1. Attempts to extract article content via the `readability` crate (which fails for YouTube)
2. Falls back to showing an "Open in browser" button

This creates a suboptimal user experience where users must leave the app to watch videos, breaking the reading flow and losing the benefits of our native desktop experience.

### Problem Statement

- YouTube URLs fail readability extraction (no article content to extract)
- Users must context-switch to a browser for video content
- Video-centric HN posts (tutorials, talks, demos) are poorly served
- No visual indication that a story links to a video

### Requirements

1. Detect YouTube URLs in story links
2. Embed videos inline within the story detail view
3. Maintain privacy-conscious defaults
4. Provide graceful degradation when embedding fails
5. Keep the implementation minimal and maintainable

## Decision

Implement embedded YouTube player support using the **YouTube IFrame Player API** with lazy-loading thumbnails, combined with **tauri-plugin-localhost** to serve the frontend on `http://localhost` in release builds.

### Approach: YouTube IFrame Player API + Localhost Plugin

**What:** Detect YouTube URLs, show a thumbnail preview, and load the YouTube player via the official IFrame API on user interaction.

**Why this approach:**

| Factor | IFrame API | Direct Iframe | WebView | System Browser |
|--------|------------|---------------|---------|----------------|
| UX Quality | Excellent | Good | Excellent | Poor (context switch) |
| Tauri Compatibility | Excellent | Poor (error 153) | Complex | N/A |
| Implementation Complexity | Medium | Low | High | None (current) |
| Privacy Control | Good (lazy-load) | Good | Limited | Browser-dependent |
| Performance | Good (lazy-load) | Good | Heavy | N/A |
| Maintenance | Low | Low | High (platform-specific) | None |

### The Error 153 Problem

We initially tried direct iframe embedding with both `youtube-nocookie.com` and standard `youtube.com` with origin parameters, but both resulted in **error 153** ("The request does not include the HTTP Referer header") in Tauri's release build webview.

**Root cause:** Tauri's production builds use `tauri://localhost` as the origin, which YouTube rejects because:
1. It's not a standard HTTP/HTTPS scheme
2. YouTube's embed authentication requires a valid HTTP Referer header

**Rejected solution:** `dangerousUseHttpScheme: true` in `tauri.conf.json` - this option existed in Tauri 1.x but was **removed in Tauri 2.0**.

**Adopted solution:** Use `tauri-plugin-localhost` which serves the frontend assets on an actual `http://localhost:<port>` server in release builds. This provides a valid HTTP origin that YouTube accepts.

### Rejected Alternatives

#### 1. `dangerousUseHttpScheme` Config Option

- **Pros:** Simple config change
- **Cons:** Does not exist in Tauri 2.0
- **Verdict:** Not available

#### 2. Separate Tauri WebView Window

- **Pros:** Full browser capabilities, better video controls
- **Cons:** Complex window management, platform-specific issues, heavy resource usage
- **Verdict:** Over-engineered for the use case

#### 3. Native Video Player via Tauri

- **Pros:** True native experience, potential offline support
- **Cons:** Requires video download, YouTube ToS concerns, significant Rust work
- **Verdict:** Out of scope, legal concerns

#### 4. Direct Iframe Embed (without API)

- **Pros:** Simple implementation, no external script loading
- **Cons:** Error 153 in Tauri webview due to missing HTTP Referer header
- **Verdict:** Does not work in Tauri/webview contexts

#### 5. Open in System Browser (Current)

- **Pros:** Zero implementation effort, always works
- **Cons:** Poor UX, breaks reading flow
- **Verdict:** Acceptable fallback, not primary experience

## Implementation

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Story Detail View                     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐    │
│  │              YouTube Embed Component             │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │         Thumbnail + Play Button          │    │    │
│  │  │         (lazy-loaded, click to play)     │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  │                      ↓ click                     │    │
│  │  ┌─────────────────────────────────────────┐    │    │
│  │  │    YouTube IFrame Player API            │    │    │
│  │  │    (YT.Player via iframe_api script)    │    │    │
│  │  └─────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  [Open in YouTube]  ← fallback link always available     │
└─────────────────────────────────────────────────────────┘
```

### Components

#### 1. YouTube Utility Module (`youtube.ts`)

Responsibilities:
- URL pattern detection (youtube.com, youtu.be, etc.)
- Video ID extraction from various URL formats
- YouTube IFrame API loading and initialization
- Thumbnail URL generation for previews

#### 2. Embed Renderer

Responsibilities:
- Render responsive 16:9 container
- Display thumbnail with play button overlay
- Handle click-to-load behavior
- Provide fallback link to YouTube

#### 3. Story Detail Integration

Responsibilities:
- Detect YouTube URLs before attempting readability extraction
- Render video embed instead of article reader for video stories
- Optionally embed YouTube links found within article content

### URL Patterns Supported

```
https://www.youtube.com/watch?v=VIDEO_ID
https://youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/embed/VIDEO_ID
https://www.youtube.com/v/VIDEO_ID
https://www.youtube.com/watch?v=VIDEO_ID&t=123  (with timestamp)
```

### Tauri Configuration

To enable YouTube embeds in production builds, we use `tauri-plugin-localhost`:

**Cargo.toml:**
```toml
[dependencies]
tauri-plugin-localhost = "2.3.2"
portpicker = "0.1"
```

**main.rs:**
```rust
// Pick a random unused port for the localhost server
let port: u16 = portpicker::pick_unused_port().expect("failed to find unused port");

tauri::Builder::default()
    .plugin(tauri_plugin_localhost::Builder::new(port).build())
    .setup(move |app| {
        // In dev mode, use the default app URL
        #[cfg(dev)]
        let url = WebviewUrl::App(std::path::PathBuf::from("/"));

        // In release mode, use localhost server
        #[cfg(not(dev))]
        let url = {
            let localhost_url: Url = format!("http://localhost:{}", port).parse().unwrap();
            app.add_capability(
                CapabilityBuilder::new("localhost")
                    .remote(localhost_url.to_string())
                    .window("main"),
            )?;
            WebviewUrl::External(localhost_url)
        };

        // Create window programmatically with the appropriate URL
        WebviewWindowBuilder::new(app, "main", url)
            .title("pastel-hn")
            .build()?;
        Ok(())
    })
```

**tauri.conf.json:**
```json
{
  "app": {
    "windows": []
  }
}
```

The window is removed from config and created programmatically to use the localhost URL in release builds.

### Security Measures

1. **Official API:** Uses YouTube's official IFrame Player API
2. **Domain Allowlist:** Only loads scripts from `youtube.com`
3. **No Arbitrary Embeds:** YouTube-specific, not generic iframe support
4. **User-Initiated Loading:** Video loads only on click (privacy + performance)
5. **Capability Scoping:** Localhost URL is explicitly granted Tauri API access

```javascript
// YouTube IFrame Player API usage
new YT.Player('player-element', {
  videoId: 'VIDEO_ID',
  playerVars: {
    autoplay: 1,
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
  },
  events: {
    onReady: () => { /* player ready */ },
    onError: (e) => { /* handle error */ },
  },
})
```

**Player Parameters:**
- `autoplay=1` - Video starts playing immediately after click-to-play
- `rel=0` - Don't show related videos from other channels at end
- `modestbranding=1` - Minimal YouTube branding in player
- `playsinline=1` - Play inline on mobile devices

### Privacy Considerations

- YouTube IFrame API script loaded only when user clicks play
- Thumbnail loaded from YouTube's static CDN (minimal tracking)
- User always has option to open in system browser instead
- No cookies set until user initiates playback

## Consequences

### Positive

- **Improved UX:** Videos play inline without leaving the app
- **Reading Flow:** Users stay in context while consuming video content
- **Visual Clarity:** Thumbnail preview clearly indicates video content
- **Privacy-Conscious:** No tracking until explicit user action
- **Low Maintenance:** Uses YouTube's official embed API
- **Tauri 2.0 Compatible:** Works with latest Tauri version

### Negative

- **YouTube Dependency:** Relies on YouTube's embed availability
- **Limited Controls:** Cannot customize player beyond YouTube's options
- **Network Required:** No offline video support
- **Single Platform:** Only YouTube supported initially
- **Port Usage:** Uses a random localhost port in release builds

### Neutral

- **CSP Consideration:** Current config has CSP disabled; if re-enabled, will need `script-src` and `frame-src` for YouTube domains
- **Future Extensibility:** Pattern can be extended to Vimeo, Twitter, etc.

## File Changes

| File | Change |
|------|--------|
| `web/src/youtube.ts` | New - URL parsing and embed utilities |
| `web/src/youtube.test.ts` | New - Unit tests |
| `web/src/story-detail.ts` | Modify - Integration |
| `web/src/styles/main.css` | Modify - Embed styles |
| `web/src/icons.ts` | Modify - Add play icon |
| `src-tauri/Cargo.toml` | Modify - Add localhost plugin and portpicker |
| `src-tauri/src/main.rs` | Modify - Initialize localhost plugin, create window programmatically |
| `src-tauri/tauri.conf.json` | Modify - Remove window config (created in code) |

## Testing Strategy

1. **Unit Tests:** URL parsing for all supported formats
2. **Unit Tests:** Embed HTML generation
3. **Manual Testing:** Various YouTube URLs from HN front page
4. **Edge Cases:** Private videos, age-restricted, unavailable videos
5. **Release Build Testing:** Verify YouTube works in bundled app

## Future Considerations

- Support for Vimeo embeds (similar pattern)
- Support for Twitter/X embeds
- Timestamp deep-link support (`?t=123`)
- Picture-in-picture mode via Tauri
- User preference to disable auto-embed

## References

- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube Privacy-Enhanced Mode](https://support.google.com/youtube/answer/171780)
- [tauri-plugin-localhost](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/localhost)
- [ADR-0003: Tabbed Story Detail](./0003_tabbed_story_detail_with_reader_mode.md) - Related UI pattern

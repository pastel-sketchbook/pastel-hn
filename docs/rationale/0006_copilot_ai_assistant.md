# 0006: GitHub Copilot AI Assistant Integration

This document explains how **pastel-hn** integrates GitHub Copilot as an AI-powered reading assistant for Hacker News content.

## Overview

The Copilot integration adds an **AI assistant panel** that enhances the HN reading experience through:
- Article summarization (for linked URLs)
- Discussion thread analysis and sentiment
- Technical term explanations
- Context for references to tech history/culture
- Reply drafting assistance

The assistant is **conditionally enabled** based on whether the user has GitHub Copilot CLI installed and authenticated.

## Why Add AI to an HN Client?

### Problem Statement

Hacker News readers face common friction points:
1. **Long articles**: Many linked articles are 10+ minute reads; users want quick summaries
2. **Dense discussions**: 500+ comment threads are hard to parse for key insights
3. **Technical jargon**: Stories reference concepts unfamiliar to some readers
4. **Context gaps**: References to tech history ("remember when Google did X") lack context for newer readers
5. **Reply anxiety**: Composing thoughtful HN replies takes effort

### AI as a Reading Enhancement

An AI assistant can reduce friction while keeping the user in control:
- Summarize on demand (not automatically)
- Explain terms when asked
- Surface discussion highlights without spoiling exploration

## Architecture

```
+------------------------------------------------------------------+
|                    Tauri App (Desktop)                            |
|  +------------------------------------------------------------+  |
|  |                 WebView (Frontend)                         |  |
|  |  +--------------------------------------------------+      |  |
|  |  |          assistant-ui.ts                         |      |  |
|  |  |  - Collapsible panel in story detail view        |      |  |
|  |  |  - Quick action buttons (Summarize, Explain...)  |      |  |
|  |  |  - Markdown rendering for responses              |      |  |
|  |  +--------------------------------------------------+      |  |
|  |                         |                                   |  |
|  |  +--------------------------------------------------+      |  |
|  |  |          copilot-client.ts                       |      |  |
|  |  |  - CopilotClient class                           |      |  |
|  |  |  - Tauri invoke wrappers                         |      |  |
|  |  |  - Graceful degradation for non-Tauri           |      |  |
|  |  +--------------------------------------------------+      |  |
|  +-----------------------------+------------------------------+  |
|                                | IPC (invoke)                    |
|  +-----------------------------v------------------------------+  |
|  |               Rust Backend (src-tauri/)                    |  |
|  |  +--------------------------------------------------+      |  |
|  |  |          commands.rs                             |      |  |
|  |  |  - copilot_check: CLI availability               |      |  |
|  |  |  - copilot_init: Initialize service              |      |  |
|  |  |  - copilot_summarize: Summarize article/thread   |      |  |
|  |  |  - copilot_explain: Explain term/concept         |      |  |
|  |  |  - copilot_analyze_discussion: Thread insights   |      |  |
|  |  |  - copilot_draft_reply: Reply assistance         |      |  |
|  |  +--------------------------------------------------+      |  |
|  |                         |                                   |  |
|  |  +--------------------------------------------------+      |  |
|  |  |          copilot.rs                              |      |  |
|  |  |  - CopilotService: Session management            |      |  |
|  |  |  - CLI detection (copilot, gh copilot)           |      |  |
|  |  |  - HN reader system prompt                       |      |  |
|  |  +--------------------------------------------------+      |  |
|  +-----------------------------+------------------------------+  |
|                                | JSON-RPC (stdio)               |
|  +-----------------------------v------------------------------+  |
|  |       Copilot CLI (external, user-installed)               |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

## Why Copilot SDK?

### Decision Context

We evaluated approaches for adding AI assistance:

| Approach                    | Pros                                  | Cons                                      |
|-----------------------------|---------------------------------------|-------------------------------------------|
| **No AI**                   | Simple, no dependencies               | Misses opportunity to enhance UX          |
| **OpenAI API directly**     | Flexible, well-documented             | Requires API key, costs money, privacy    |
| **Local LLM (llama.cpp)**   | Offline, private                      | Large models (~4GB), slow on CPU          |
| **GitHub Copilot SDK**      | Free for subscribers, high quality    | Requires CLI, desktop only                |

**We chose GitHub Copilot** because:
1. **Target audience overlap**: Developers who read HN often have Copilot subscriptions
2. **No API keys to manage**: Uses existing Copilot authentication
3. **High quality responses**: State-of-the-art models
4. **Free for existing subscribers**: No additional cost
5. **Proven pattern**: Already used successfully in hangul-typing

### Why Desktop Only?

The Copilot SDK cannot run in browsers because it spawns the CLI as a child process. This is acceptable because:
- pastel-hn is a **desktop-first** Tauri app
- Web users get the full HN experience without AI features
- AI features are enhancements, not core functionality

## Implementation Details

### System Prompt Design

The assistant uses a specialized system prompt for the HN reading context:

```rust
let system_prompt = r#"You are a knowledgeable Hacker News reader assistant.

<your_role>
- Summarize linked articles concisely (2-3 paragraphs unless asked for more)
- Explain technical concepts mentioned in stories or comments
- Analyze discussion threads for key viewpoints and sentiment
- Provide context for references to tech history, companies, or people
- Help draft thoughtful, HN-appropriate replies
</your_role>

<your_style>
- Neutral, informative tone (like a well-read HN commenter)
- When summarizing discussions, cite specific perspectives fairly
- Keep summaries concise; expand only when asked
- For explanations, assume technical competence but not domain expertise
- Never be condescending or overly enthusiastic
</your_style>

<constraints>
- Do not make up facts about articles you haven't seen the full text of
- When asked about an article, work with the title/URL context provided
- For discussion analysis, represent multiple viewpoints fairly
- Keep replies HN-appropriate: substantive, not snarky
</constraints>"#;
```

### Feature Specifications

#### 1. Article Summarization

**Trigger**: User clicks "Summarize" on a story with external URL

**Input Context**:
```rust
pub struct ArticleContext {
    pub title: String,
    pub url: String,
    pub domain: String,
    pub score: u32,
    pub comment_count: u32,
}
```

**Behavior**:
- Provide a 2-3 paragraph summary based on title/URL/domain
- Note that it's working from metadata, not full article text
- Suggest key points likely covered based on HN discussion patterns

#### 2. Discussion Analysis

**Trigger**: User clicks "Analyze Thread" on a story with comments

**Input Context**:
```rust
pub struct DiscussionContext {
    pub story_title: String,
    pub comment_count: u32,
    pub top_level_comments: Vec<CommentSummary>,  // First ~10 top-level
}

pub struct CommentSummary {
    pub author: String,
    pub text_preview: String,  // First 200 chars
    pub score: Option<u32>,
    pub reply_count: u32,
}
```

**Behavior**:
- Identify 2-3 main viewpoints/themes in the discussion
- Note areas of agreement and contention
- Highlight particularly insightful or highly-upvoted comments

#### 3. Term/Concept Explanation

**Trigger**: User selects text and clicks "Explain This" (context menu)

**Input**: Selected text + surrounding context

**Behavior**:
- Brief explanation (1-2 paragraphs)
- HN-relevant context (why this matters to tech community)
- Links to learn more if appropriate

#### 4. Reply Draft Assistant

**Trigger**: User clicks "Help Me Reply" on a comment

**Input Context**:
```rust
pub struct ReplyContext {
    pub parent_comment: String,
    pub story_title: String,
    pub user_draft: Option<String>,  // If user started typing
}
```

**Behavior**:
- Suggest 2-3 angles to respond from
- Offer draft text that's substantive but needs personalization
- Note HN etiquette considerations if relevant

### UI Design

**Assistant Panel Placement**:
- **Exclusive to Zen Mode**: To ensure a focused reading experience and simplify UI layout logic, the AI Assistant is only available when the user is in **Zen Mode**.
- Collapsible panel on right side of story detail view (Zen mode only).
- Toggle button in story header/badge area (only shown if Copilot available and in Zen mode).
- **Width: 650px**: Optimized for scanability; hits the 50-75 characters-per-line "comfort zone" for long summaries.
- **Height: Full viewport height**: Anchored below the header (**top: 134px**) to the bottom of the screen (**bottom: 12px**).

**Features & Interactions**:
- **Reading Mode Toggle**: A high-visibility **Orange and White** switch located next to the window title.
- **Persistence**: User theme and toggle preferences are saved in `localStorage`.
- **Zen Mode Integration**: Specifically positioned (**top: 20px, right: 80px**) when the main header is hidden to maximize focus space.

**Visual Style - The Dual-Theme Strategy**:

The assistant provides two distinct visual modes to balance technical identity with reading comfort:

1. **Frost Aesthetic (Default)**:
   - Uses semi-transparent glass layers and `backdrop-filter: blur(20px)` to maintain contextual awareness of the article behind.
   - **Light Frost**: Airy cyan-tinted bubbles with dark cyan text.
   - **Dark Frost**: Midnight glass with soft bone-white text and vibrant cyan accents.

2. **Reading Mode (High Comfort)**:
   - Prioritizes maximum legibility and reduced eye strain for long-form consumption.
   - **Light Mode**: "Ice White" background with deep charcoal text.
   - **Dark Mode**: "Midnight Steel" background with soft bone-white text to eliminate screen glare.

**Typography Design**:
- **Font**: **Share Tech Mono** provides a distinct "hacker" identity separate from the main article sans-serif.
- **Spacing**: `line-height: 1.6` and `letter-spacing: 0.2px` ensure individual characters are clear and lines are easy to track.

**Design Principles**:
- **Technical Identity**: Mono font and Cyan accents reinforce the "GitHub Copilot" and developer-focused nature of the app.
- **Adaptability**: Full support for both Light and Dark OS themes, coordinated with the user's Reading Mode preference.
- **Visual Hierarchy**: Structural headers and bold text are emphasized with Cyan, making summaries easy to scan.

### Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| Not in Tauri (web) | Assistant UI hidden entirely |
| Copilot CLI not installed | Toggle button hidden; no error |
| CLI not authenticated | Show setup instructions in panel |
| Copilot request fails | Show retry option; log error |
| Rate limited | Explain limit; suggest waiting |

### Logging Strategy

**INFO Level** (production):
```
INFO copilot: AI assistant initialized
INFO copilot: Summarize request for story 12345678
INFO copilot: Response received (1247 chars)
```

**DEBUG Level** (development):
```
DEBUG copilot: CLI auth check: installed=true, authenticated=true
DEBUG copilot: Creating session with HN reader prompt
DEBUG copilot: Sending summarize request with context...
```

## Security & Privacy Considerations

### Data Handling

- **No storage**: Conversations are not persisted
- **Local processing**: All Copilot communication via local CLI
- **User's subscription**: Uses their existing authentication
- **Minimal context**: Only send necessary story/comment data

### Content Security

- User input sanitized through Tauri's serialization
- No external HTTP requests for AI (uses local CLI)
- CSP unchanged; Copilot uses IPC, not network

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| CLI detection | ~50ms | One-time on app start |
| Session init | ~500ms-1s | Lazy; only when panel opened |
| Response latency | 2-8 seconds | Depends on request complexity |
| Memory overhead | ~20-50MB | Copilot CLI process |
| No Copilot overhead | 0 | Feature completely disabled |

### Lazy Loading

The Copilot session is not started until the user:
1. Opens the assistant panel, OR
2. Clicks a quick action button

Users who don't use the assistant pay no performance cost.

## File Structure

```
src-tauri/src/
├── copilot.rs           # CopilotService, CLI detection, session management
├── commands.rs          # Tauri command handlers (extended with copilot_*)
├── lib.rs               # Command registration

web/src/
├── copilot-client.ts    # TypeScript client wrapping Tauri invoke
├── assistant-ui.ts      # UI panel, quick actions, message display
├── main.ts              # Integration with story detail view
```

**Estimated code addition**: ~1000 lines
- Rust: ~350 lines (copilot.rs + command handlers)
- TypeScript: ~400 lines (client + UI)
- CSS: ~250 lines (panel styling)

## Testing Strategy

### Unit Tests (Rust)
- CLI detection with mocked commands
- Error handling for unavailable Copilot
- Context serialization for each feature

### Integration Tests
- Tauri command invocation
- Frontend-backend communication
- Context passing

### Manual Testing Checklist
- [ ] Toggle button hidden when Copilot unavailable
- [ ] Panel opens/closes smoothly
- [ ] Summarize works for story with URL
- [ ] Analyze discussion works for story with comments
- [ ] Explain This appears in context menu
- [ ] Error states display gracefully
- [ ] Panel respects dark/light theme

## Limitations & Trade-offs

### Pros
- Enhances reading experience with on-demand AI
- Free for existing Copilot subscribers
- No API keys or additional accounts
- Graceful degradation when unavailable
- Privacy-respecting (local CLI)

### Cons
- Desktop only (not web)
- Requires Copilot subscription
- User must install Copilot CLI
- 2-8 second response latency
- No offline support

### Why These Trade-offs Are Acceptable

1. **Desktop-first app**: pastel-hn's primary distribution is Tauri
2. **Target audience**: HN readers often have Copilot
3. **Optional feature**: Core HN experience unchanged without AI
4. **Proven approach**: Same pattern works well in hangul-typing

## Future Enhancements

### Planned
1. **Streaming responses**: Show text as it generates
2. **Article content fetching**: Use reader mode content for better summaries
3. **Conversation memory**: Follow-up questions within a session
4. **Keyboard shortcuts**: `a` to open assistant panel

### Not Planned
- Local LLM fallback (complexity vs. value)
- Multi-model support (Copilot sufficient)
- Conversation persistence (ephemeral by design)

## References

- [hangul-typing Copilot Integration](../../../hangul-typing/docs/rationale/0006_copilot_ai_assistant.md) - Reference implementation
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk) - Official JavaScript SDK
- [copilot-sdk-rust](https://crates.io/crates/copilot-sdk) - Community Rust SDK
- [Tauri Commands](https://tauri.app/v1/guides/features/command/) - Tauri IPC documentation

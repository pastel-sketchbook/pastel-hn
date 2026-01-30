# ADR-0009: TTS Sentence Highlighting

## Status

Accepted

## Date

2026-01-30

## Context

The neural TTS feature (ADR-0008) reads articles aloud using high-quality Piper voices. However, users have no visual indication of which part of the article is currently being spoken. For longer articles, this makes it difficult to:

1. Follow along while listening
2. Know how far into the article the reader has progressed
3. Jump to a specific section by clicking
4. Resume reading after pausing

Other TTS applications (audiobook apps, screen readers, language learning tools) commonly highlight the currently spoken text to improve the reading experience.

## Decision

Implement sentence-by-sentence TTS playback with visual progress indication. The approach chosen:

### Architecture: Event-Driven Backend with Frontend Progress UI

```
Frontend                          Rust Backend
   |                                   |
   |  tts_neural_speak_sentences      |
   |  [sentences: string[]]  -------> |
   |                                   |
   |  <-- tts-sentence event          | (for each sentence)
   |      { type: "start",            |   1. Generate audio
   |        index: 0,                 |   2. Emit "start" event
   |        text: "..." }             |   3. Play audio
   |                                   |   4. Emit "end" event
   |  <-- tts-sentence event          |
   |      { type: "end", index: 0 }   |
   |                                   |
   |  <-- tts-sentence event          |
   |      { type: "finished" }        |
   +-----------------------------------+
```

### Key Design Choices

#### 1. Sentence-by-Sentence Playback (Chosen)

**Alternative A: Pre-generate all audio, estimate timing**
- Generate all audio upfront
- Estimate sentence duration based on word count
- Use timers to advance highlighting

**Alternative B: Sentence-by-sentence with events (Chosen)**
- Process one sentence at a time
- Backend emits events when each sentence starts/ends
- Frontend highlights based on actual playback

**Rationale:** Alternative B was chosen because:
- Accurate synchronization (no drift from estimation errors)
- Allows stopping mid-article without wasting generation
- Simpler mental model (event-driven vs. timer-based)
- More responsive to stop commands

#### 2. Progress Indicator AND Inline Highlighting (Both Implemented)

The implementation uses **both** approaches for maximum visibility:

**Progress Indicator (Sticky bar at top):**
- Shows progress bar above the article
- Displays sentence count (e.g., "3 / 15") and preview text
- Always visible, even when scrolling

**Inline Text Highlighting:**
- Wraps each sentence in `<span class="tts-sentence">` elements
- Current sentence gets `tts-active` class with cyan color
- Auto-scrolls to keep current sentence in view
- Original HTML is preserved and restored after playback

**Implementation approach:**
- Before playback, walk all text nodes and wrap sentence text in spans
- Store original HTML in a data attribute for restoration
- On sentence start event, add highlight class and scroll into view
- On stop/finish, restore original HTML content

**Critical: Text Normalization for Accurate Highlighting**

A subtle but critical issue arises from how text is processed:

1. `extractArticleText()` normalizes whitespace (collapses `\n\n\n` to single space)
2. `splitIntoSentences()` works on this normalized text
3. But DOM `textContent` retains original whitespace

This mismatch caused highlights to appear 2+ sentences ahead of audio. The solution:

```typescript
// In wrapSentencesInContainer():
const fullText = container.textContent || ''  // Raw with all whitespace
const normalizedFullText = fullText.replace(/\s+/g, ' ').trim()

// Find sentence in normalized text, then map position back to raw text
// by counting characters while tracking whitespace collapse
```

Additionally, the TreeWalker must include ALL text nodes (including whitespace-only)
when calculating `globalOffset`, since `container.textContent` includes them.
Skipping whitespace nodes causes offset drift.

#### 3. Frontend Sentence Splitting with Chunking

Sentences are split in the frontend before being sent to the backend. Short sentences
are combined into chunks of 200-400 characters for better TTS pacing and highlighting
visibility.

**Why chunking?**
- Individual sentences can be very short ("I agree." = 8 chars)
- Short highlights flash by too quickly to follow
- Longer chunks (200-400 chars) provide comfortable reading pace
- Matches natural paragraph-like reading units

**Algorithm:**
```typescript
const MIN_CHUNK_LENGTH = 200
const MAX_CHUNK_LENGTH = 400

// Split on .!? then combine short sentences until MIN reached
// Start new chunk when adding would exceed MAX
```

This ensures:
- Frontend knows exactly which chunks will be spoken
- Index-based events map directly to frontend data
- Comfortable pacing for both listening and reading along

### Implementation Details

#### Rust Backend Changes

**New Types (`synth.rs`):**
```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SentenceEvent {
    Start { index: usize, text: String },
    End { index: usize },
    Finished,
    Stopped,
}
```

**New Method (`synth.rs`):**
```rust
pub async fn speak_sentences(
    &mut self,
    sentences: &[String],
    voice_id: Option<&str>,
    event_tx: mpsc::Sender<SentenceEvent>,
) -> Result<(), SynthesisError>
```

**New Command (`commands.rs`):**
```rust
#[tauri::command]
pub async fn tts_neural_speak_sentences(
    app_handle: tauri::AppHandle,
    sentences: Vec<String>,
    voice_id: Option<String>,
    rate: Option<f32>,
) -> Result<(), String>
```

#### TypeScript Frontend Changes

**New Types (`tts-neural.ts`):**
```typescript
export type SentenceEvent =
  | { type: 'start'; index: number; text: string }
  | { type: 'end'; index: number }
  | { type: 'finished' }
  | { type: 'stopped' }
```

**New Method (`NeuralTtsClient`):**
```typescript
async speakSentences(
  sentences: string[],
  onSentenceEvent: SentenceEventCallback,
  voiceId?: string,
): Promise<boolean>
```

**Sentence Splitting (`tts-ui.ts`):**
```typescript
export function splitIntoSentences(text: string): string[]
```

**Progress UI (`tts-ui.ts`):**
- `handleSentenceEvent()` - Process events from backend
- `highlightCurrentSentence()` - Update visual indicator
- `updateSentenceProgressIndicator()` - Render progress bar
- `clearSentenceHighlighting()` - Cleanup on stop/finish

#### CSS Styling

New styles for `.tts-sentence-indicator`:
- Sticky positioning at top of article
- Progress bar with gradient fill
- Sentence count and preview text
- Smooth animations for appearance
- Light/dark theme support

## Consequences

### Positive

1. **Improved UX**: Users can follow along while listening
2. **Progress visibility**: Clear indication of reading progress
3. **Accurate sync**: Event-driven approach ensures perfect synchronization
4. **Non-invasive**: Article HTML structure remains unchanged
5. **Graceful degradation**: Works even if CSS is disabled (just no visual feedback)

### Negative

1. **Slightly longer startup**: Each sentence is generated individually (no pre-buffering)
2. **More events**: One event per sentence increases IPC traffic slightly
3. **No word-level highlighting**: Only sentence-level granularity

### Technical Challenges Overcome

1. **Whitespace Normalization Mismatch**: Text extraction normalizes whitespace for TTS,
   but DOM retains original formatting. Solution: normalize-then-map-back algorithm.

2. **TreeWalker Offset Drift**: Skipping whitespace-only text nodes in TreeWalker caused
   `globalOffset` to drift from `textContent` positions. Solution: include all nodes
   in offset calculation, skip only for processing.

3. **Audio Buffer Latency**: Events must fire when audio is audible, not when queued.
   Solution: 50ms delay after `sink.append()` before emitting Start event.

### Neutral

1. **Backend changes required**: New command and event infrastructure
2. **State management**: Frontend tracks current sentence index

## Future Enhancements

1. **Click-to-jump**: Allow clicking a sentence to jump to that position
2. **Inline highlighting**: Optional mode that highlights text inline
3. **Word-level highlighting**: Finer granularity for language learning
4. **Reading position persistence**: Remember position across sessions
5. **Speed adjustment during playback**: Change rate without restarting

## Files Changed

### Rust Backend
- `src-tauri/src/tts/neural/synth.rs` - SentenceEvent enum, speak_sentences method
- `src-tauri/src/tts/neural/mod.rs` - speak_sentences function, event forwarding
- `src-tauri/src/commands.rs` - tts_neural_speak_sentences command
- `src-tauri/src/main.rs` - Register new command

### TypeScript Frontend
- `web/src/tts-neural.ts` - SentenceEvent types, speakSentences method
- `web/src/tts-ui.ts` - Sentence splitting, progress UI, event handling

### Styles
- `web/src/styles/main.css` - TTS sentence indicator styles

## References

- [ADR-0008: Rust Backend TTS with Piper](./0008_rust_backend_tts_piper.md)
- [Tauri Events](https://v2.tauri.app/develop/calling-rust/#event-system)
- [Piper TTS](https://github.com/rhasspy/piper)

# ADR-0008: Rust Backend TTS with Piper and ONNX Runtime

## Status

Accepted (Updated 2026-01-30: Full implementation complete, error toast fix applied)

## Date

2026-01-29

## Implementation Status

**Completed**: 2026-01-30

The neural TTS system has been **fully implemented and working** with the following components:

### Rust Backend (src-tauri/src/tts/)
- Model download and caching (`model.rs`)
- Piper + ONNX Runtime inference (`synth.rs`)
- Text-to-phoneme conversion via espeak-ng (`synth.rs`)
- Phoneme-to-ID mapping using Piper config (`synth.rs`)
- Audio playback with rodio 0.21 (`audio.rs`)
- Module coordinator with fallback logic (`mod.rs`)
- 11 Tauri commands for neural TTS operations

### TypeScript Frontend
- Neural TTS client (`tts-neural.ts`)
- Unified TTS UI with both native and neural (`tts-ui.ts`)
- Automatic fallback to native TTS
- Download progress tracking
- Model management UI with auto-download prompt
- Story detail view integration with separate buttons

### Dependencies Added
- `ort = "2.0.0-rc.11"` - ONNX Runtime bindings (with tls-rustls feature)
- `rodio = "0.21.1"` - Audio playback (with wav and playback features)
- `hound = "3.5"` - WAV encoding
- `dirs = "6.0"` - Platform directories
- `regex = "1.12"` - Text processing
- `ndarray = "0.17"` - Tensor operations
- `tempfile = "3.24"` (dev) - Testing

### System Dependencies
- **espeak-ng** - Required for text-to-phoneme conversion
  - macOS: `brew install espeak-ng`
  - Linux: `apt install espeak-ng`
  - Windows: Download from espeak-ng releases

### Model Support
- **Piper** (~63MB) - Lightweight neural voice (en_US-lessac-medium)

> **Note:** XTTS v2 was originally planned but has been removed. The XTTS v2 model
> on HuggingFace uses PyTorch format (`.pth` files), not ONNX format. Converting
> to ONNX would require significant effort and the 1.5GB download size is
> impractical for most users. Piper provides good quality at 1/25th the size.

### Implemented Features
- Model download with progress tracking
- Auto-download prompt when clicking neural button
- Sentence chunking for long articles
- Audio streaming (play while generating)
- Automatic fallback to native OS TTS
- Persistent model caching
- Model disk usage tracking
- Delete models to free space
- Colored toast notifications (red=error, orange=warning, blue=info)
- Visual feedback on buttons (dashed border when model needed)

### Known Limitations
- First use requires download (~63MB)
- Requires espeak-ng installed on system for phoneme conversion
- GPU acceleration not yet implemented (CPU only)

## Context

pastel-hn aims to provide a "listen to article" feature for comfortable content consumption. Two TTS approaches have been attempted:

### Previous Attempts

| Approach | Implementation | Outcome |
|----------|---------------|---------|
| **Native Browser TTS** | `speechSynthesis` API | Works, but robotic/low quality voices |
| **Kokoro.js (WASM)** | kokoro-js in WebView | Failed - WASM compilation timeout in WKWebView (>120s for first sentence) |

The Kokoro.js failure revealed a fundamental limitation: **neural TTS models are too computationally expensive to run in a WebView's JavaScript/WASM environment**, especially on macOS where WKWebView has stricter resource constraints.

### Requirements

1. **High-quality neural voices** - Natural-sounding speech, not robotic
2. **Reasonable latency** - First audio within 2-3 seconds
3. **Streaming support** - Play audio while generating subsequent chunks
4. **Offline capability** - No cloud API dependencies
5. **Cross-platform** - macOS, Windows, Linux
6. **User-friendly download** - Clear prompts and progress indication
7. **Reasonable download size** - Under 100MB preferred

## Decision Drivers

1. **Performance** - Native code (Rust) vs interpreted (JS/WASM in WebView)
2. **Model quality** - Piper provides good quality with small size
3. **Deployment** - ONNX Runtime enables optimized inference across platforms
4. **Architecture fit** - Tauri already has a Rust backend we can extend
5. **UX** - Separate buttons for native vs neural with clear visual states
6. **Download size** - 63MB is acceptable for most users

## Considered Options

### Option 1: Cloud TTS API (ElevenLabs, OpenAI, etc.)

**Pros:**
- Highest quality voices
- Zero local compute
- Simple integration (HTTP calls)

**Cons:**
- Requires internet connection
- Per-character/minute costs
- Privacy concerns (article text sent to third party)
- Latency dependent on network

**Verdict:** Rejected - violates offline requirement and introduces ongoing costs

### Option 2: Native Platform TTS (AVSpeechSynthesizer, SAPI, espeak)

**Pros:**
- Already implemented (`tts-ui.ts`, `tts-client.ts`)
- Zero bundle size impact
- Works offline

**Cons:**
- Voice quality varies wildly by platform
- macOS voices are decent; Windows/Linux often robotic
- No consistency across platforms

**Verdict:** Keep as fallback, but not primary solution

### Option 3: XTTS v2 + ONNX Runtime (Originally Planned)

**Pros:**
- State-of-the-art voice quality
- Near-human speech

**Cons:**
- Model is 1.5GB download
- XTTS v2 on HuggingFace is PyTorch format, not ONNX
- Would require complex conversion pipeline
- Too large for casual users

**Verdict:** Rejected - impractical download size and format issues

### Option 4: Piper TTS + ONNX Runtime (Selected)

**Pros:**
- Small models (~63MB for medium quality)
- Already in ONNX format on HuggingFace
- Fast inference
- Good quality for size
- Cross-platform via ONNX Runtime

**Cons:**
- Voice quality below XTTS v2
- Fewer voice options
- Less natural prosody than top-tier models

**Verdict:** Selected - best balance of quality, size, and practicality

## Decision

Implement **Option 4: Rust Backend TTS with Piper + ONNX Runtime**, with Option 2 (native TTS) as automatic fallback.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TypeScript (Frontend)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  tts-ui.ts  │  │ tts-neural. │  │  Article Content    │  │
│  │  (Unified   │  │   ts        │  │  Extraction         │  │
│  │   UI)       │  │  (Neural    │  │                     │  │
│  └──────┬──────┘  │   Client)   │  └─────────────────────┘  │
│         │         └──────┬──────┘                             │
│         │                │                                   │
│  ┌──────▼──────┐  ┌──────▼──────┐                            │
│  │ tts-client. │  │  invoke()   │                            │
│  │  ts         │  │  Commands:  │                            │
│  │ (Native)    │  │  tts_neural │                            │
│  └──────┬──────┘  │  _speak     │                            │
│         │         │  tts_neural │                            │
│         │         │  _status    │                            │
│         │         │  tts_downl  │                            │
│         │         │  oad_model  │                            │
└─────────┼─────────┼──────┬──────┼─────────────────────────────┘
          │         │      │      │
          │         │ ┌────▼──────▼───────┐
          │         │ │  Tauri IPC Layer  │
          │         │ └──────┬────────────┘
          │         │        │
┌─────────┼─────────┼────────┼───────────────────────────────────┐
│         │         │  ┌─────▼──────┐                            │
│         │         │  │ src-tauri/ │      Rust Backend          │
│         │         │  │ src/       │                            │
│         │         │  ├────────────┤                            │
│         │         │  │ tts/mod.rs │                            │
│         │         │  │ tts/neural/│                            │
│         │         │  │   model.rs │                            │
│         │         │  │   synth.rs │                            │
│         │         │  │   audio.rs │                            │
│         │         │  └─────┬──────┘                            │
│         │         │        │                                   │
│         │         │  ┌─────▼──────┐                            │
│         │         │  │ NeuralTts  │                            │
│         │         │  │ Engine     │                            │
│         │         │  └─────┬──────┘                            │
│         │         │        │                                   │
│         │         │  ┌─────▼──────┐                            │
│         │         │  │  ort       │                            │
│         │         │  │  (ONNX)    │                            │
│         │         │  └─────┬──────┘                            │
│         │         │        │                                   │
│         │         │  ┌─────▼──────┐                            │
│         │         │  │  rodio     │                            │
│         │         │  │  (Audio)   │                            │
│         │         │  └────────────┘                            │
│         │         │                                              │
│  ┌──────▼─────────▼──────┐                                       │
│  │ tts.rs (Native TTS)   │  (Fallback when neural unavailable)  │
│  │ tts crate             │                                       │
│  └───────────────────────┘                                       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Module Structure

```
src-tauri/src/
├── tts.rs                    # Native TTS (tts crate wrapper)
└── tts/
    ├── mod.rs                # Neural TTS coordinator & public API
    ├── model.rs              # Model download, caching, management
    ├── synth.rs              # Piper inference with ONNX Runtime
    └── audio.rs              # Audio playback with rodio

web/src/
├── tts-client.ts             # Native TTS client
├── tts-neural.ts             # Neural TTS client (Rust backend)
├── tts-ui.ts                 # Unified UI with both backends
└── story-detail.ts           # Article view with TTS buttons
```

### Tauri Commands (11 total)

**Native TTS:**
- `tts_init` - Initialize native TTS
- `tts_status` - Get native TTS status
- `tts_speak` - Speak text with native voice
- `tts_stop` - Stop native playback
- `tts_get_voices` - List native voices
- `tts_set_voice` - Set native voice
- `tts_set_rate` - Set native speech rate

**Neural TTS:**
- `tts_neural_init` - Initialize neural TTS engine
- `tts_neural_status` - Get neural TTS status
- `tts_neural_speak` - Speak with neural voice
- `tts_neural_stop` - Stop neural playback
- `tts_download_model` - Download model with progress
- `tts_is_model_ready` - Check if model downloaded
- `tts_model_directory` - Get model storage path
- `tts_model_disk_usage` - Get disk usage
- `tts_delete_model` - Delete model to free space

### Model Storage

**Platform paths:**
- macOS: `~/Library/Application Support/pastel-hn/models/`
- Linux: `~/.local/share/pastel-hn/models/`
- Windows: `%APPDATA%/pastel-hn/models/`

**Models:**
- Piper: `piper-en-us/` (~63MB)
  - `en_US-lessac-medium.onnx` (63,201,294 bytes) - ONNX model
  - `en_US-lessac-medium.onnx.json` (4,885 bytes) - Model config

### UI Flow

**Article View (story-detail.ts):**
```
┌─────────────────────────────────────────┐
│  [Bookmark] [Copy] [Share]              │
│  [Read Aloud] [Read Neural] ← 2 buttons │
└─────────────────────────────────────────┘
```

**Read Aloud** - Uses native OS TTS (always available)
**Read Neural** - Uses Piper (requires model download)

**When clicking "Read Neural" without model:**
1. Button shows dashed orange border (visual indicator)
2. `confirm()` dialog: "Download Piper US English voice model? (~63MB)"
3. If confirmed: Info toast "Downloading..." and download starts with progress
4. After download: Auto-reinitializes and plays

**Button States:**
- Normal: Solid border, "Read Neural"
- Needs Download: Dashed orange border, 70% opacity
- Playing: Cyan background, pulsing animation, "Stop Neural"

### Error Handling

All errors show colored toast notifications:
- **Red (toastError)**: Failures (download failed, playback error)
- **Orange (toastWarning)**: Warnings (not available, missing content)
- **Blue (toastInfo)**: Info (success states, progress)

## Piper Model Details

| Component | Size | Purpose |
|-----------|------|---------|
| `en_US-lessac-medium.onnx` | 63.2MB | Neural TTS model |
| `en_US-lessac-medium.onnx.json` | 4.9KB | Model configuration |

**Inference Pipeline:**
1. Preprocess text (remove URLs, normalize whitespace)
2. Chunk text into ~500 character segments at sentence boundaries
3. Convert text to IPA phonemes using espeak-ng subprocess
4. Map IPA phonemes to model phoneme IDs using config's `phoneme_id_map`
5. Create ONNX tensors: `input` (phoneme IDs), `input_lengths`, `scales`
6. Run ONNX inference (phonemes -> audio samples)
7. Convert f32 samples to i16 WAV format
8. Play audio via rodio's OutputStreamBuilder and Sink

**Expected Performance (M1 Mac):**
- First audio latency: ~200ms
- Real-time factor: ~0.1x (generates 10s audio per 1s compute)
- Memory usage: ~200MB during inference

## Challenges & Solutions

### Challenge 1: Model Download UX
**Problem**: Download on first use can be unexpected
**Solution**: 
- Dashed border on button indicates download needed
- Toast notification explains before dialog
- Confirmation dialog with size warning
- Can use native TTS while downloading

### Challenge 2: WASM Timeout (Kokoro.js)
**Problem**: Previous WASM approach failed in WebView
**Solution**: Move to Rust backend with ONNX Runtime

### Challenge 3: XTTS v2 Format Issues
**Problem**: XTTS v2 on HuggingFace is PyTorch, not ONNX
**Solution**: Use Piper instead (native ONNX, smaller size)

### Challenge 4: File Size Validation
**Problem**: `is_model_ready()` used approximate file sizes
**Solution**: Use exact file sizes from HuggingFace with integration tests

### Challenge 5: Duplicate Error Toasts on Button Click
**Problem**: Two error toasts appeared when clicking the neural TTS button, even when audio played correctly afterward
**Root Cause**: Multiple locations in `tts-ui.ts` called both `toastError()`/`toastWarning()` AND a `showTtsError()` helper function (which also called `toastError()`), resulting in duplicate toasts
**Solution**: 
- Removed redundant `fetchStatus()` call that was fire-and-forget with error toast
- Removed all duplicate toast calls (kept only one toast per error case)
- Removed unused `showTtsError()` helper function
- Changed download flow to show `toastInfo()` when download starts instead of warning toast

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Model download fails | Medium | High | Retry logic, resume support, native fallback |
| ONNX Runtime crashes | Low | High | Catch panics, graceful degradation |
| Audio playback issues | Medium | Medium | Multiple audio backend options (rodio/cpal) |
| HuggingFace URL changes | Low | High | Integration tests verify URLs |
| User rejects download | Medium | Medium | Native TTS always available as fallback |

## Success Criteria

1. **Quality**: Voice quality rated "acceptable" by users
2. **Performance**: First audio plays within 2 seconds of clicking "Read Neural"
3. **Reliability**: <1% failure rate after model download
4. **Adoption**: Users can easily download and use neural voice
5. **UX**: Users understand download requirement (visual indicators, toasts)

## Current Status

**Fully Working:**
- Native TTS (always available)
- Neural TTS backend with Piper ONNX inference
- Text-to-phoneme conversion via espeak-ng
- Phoneme-to-ID mapping with Piper config
- ONNX Runtime inference producing audio
- Audio playback via rodio 0.21
- Model download and caching
- UI buttons in article view
- Auto-download prompt flow
- Toast notifications
- Visual feedback (dashed borders, playing state)
- Automatic fallback to native
- Exact file size validation
- Fixed duplicate error toasts on button click
- 91 Rust tests passing
- 1052 TypeScript tests passing

**Future Enhancements:**
- GPU acceleration via ONNX Runtime CUDA/CoreML providers
- Additional voice models (different languages, accents)
- Voice cloning support

## References

- [Piper TTS](https://github.com/rhasspy/piper) - Lightweight neural TTS
- [Piper Voices on HuggingFace](https://huggingface.co/rhasspy/piper-voices) - Model repository
- [ort crate](https://github.com/pykeio/ort) - Rust ONNX Runtime bindings
- [rodio crate](https://github.com/RustAudio/rodio) - Audio playback (v0.21 API)
- [espeak-ng](https://github.com/espeak-ng/espeak-ng) - Text-to-phoneme conversion
- [ADR-0001](./0001_removing_zig_wasm_layer.md) - Previous architecture decisions

## Appendix: ONNX Model Details

### Piper VITS Model Inputs

| Input Name | Type | Shape | Description |
|------------|------|-------|-------------|
| `input` | int64 | `[1, seq_len]` | Phoneme IDs from config's `phoneme_id_map` |
| `input_lengths` | int64 | `[1]` | Length of phoneme sequence |
| `scales` | float32 | `[3]` | `[noise_scale, length_scale, noise_w]` from config |

### Piper VITS Model Output

| Output Name | Type | Shape | Description |
|-------------|------|-------|-------------|
| `output` | float32 | `[1, 1, 1, samples]` | Audio samples at 22050 Hz |

### Phoneme ID Mapping Example

Text "Hello world" is converted as follows:

1. **espeak-ng**: `"Hello world"` → `"həlˈoʊ wˈɜːld"` (IPA phonemes)
2. **phoneme_id_map**: Maps each IPA character to ID(s)
   - `^` (start) → `[1]`
   - `h` → `[20]`
   - `ə` → `[59]`
   - `l` → `[24]`
   - `ˈ` → `[120]`
   - ... etc
   - `$` (end) → `[2]`
3. **Final IDs**: `[1, 20, 59, 24, 120, 27, 100, 3, 35, 120, 62, 122, 24, 17, 2]`

## Appendix: rodio 0.21 API Migration

The rodio 0.21 release changed the audio playback API significantly:

**Old API (0.19):**
```rust
let (_stream, stream_handle) = OutputStream::try_default()?;
let sink = Sink::try_new(&stream_handle)?;
```

**New API (0.21):**
```rust
let mut stream = OutputStreamBuilder::open_default_stream()?;
stream.log_on_drop(false);  // Suppress drop message
let sink = Sink::connect_new(stream.mixer());
```

Key changes:
- `OutputStream::try_default()` replaced by `OutputStreamBuilder::open_default_stream()`
- `Sink::try_new(&stream_handle)` replaced by `Sink::connect_new(stream.mixer())`
- Requires `playback` feature in addition to `wav` feature

## Appendix: HuggingFace Model URLs

Models are downloaded directly from HuggingFace using the `/resolve/main/` URL pattern:

**Piper (en_US-lessac-medium):**
```
Base URL: https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium
Files:
  - en_US-lessac-medium.onnx (63,201,294 bytes)
  - en_US-lessac-medium.onnx.json (4,885 bytes)
```

### Integration Tests

The Rust backend includes integration tests that verify HuggingFace URLs are valid:

```bash
# Run URL validation test (HEAD requests to HuggingFace)
cargo test --package pastel-hn test_piper_huggingface_urls_are_valid -- --ignored

# Run actual config download test
cargo test --package pastel-hn test_piper_config_download -- --ignored

# Run full download and is_model_ready test (~63MB download)
cargo test --package pastel-hn test_piper_full_download_and_ready_check -- --ignored

# Run audio generation test (requires model downloaded)
cargo test --package pastel-hn test_generate_audio_integration -- --ignored --nocapture

# Run full speak test with audio playback (requires model + audio output)
cargo test --package pastel-hn test_speak_integration -- --ignored --nocapture
```

These tests are marked `#[ignore]` by default since they require network access or audio hardware.

## Appendix: Voice Quality Comparison

| System | MOS Score* | Notes |
|--------|------------|-------|
| Human speech | 4.5 | Reference |
| Piper (medium) | 3.6 | Good for size |
| macOS Siri voice | 3.8 | Best native option |
| Windows SAPI | 2.9 | Robotic |
| espeak | 2.2 | Very robotic |

*Mean Opinion Score (1-5 scale, higher is better)

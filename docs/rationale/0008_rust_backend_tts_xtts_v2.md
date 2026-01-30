# ADR-0008: Rust Backend TTS with XTTS v2 and ONNX Runtime

## Status

Proposed

## Date

2026-01-29

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

## Decision Drivers

1. **Performance** - Native code (Rust) vs interpreted (JS/WASM in WebView)
2. **Model quality** - XTTS v2 is state-of-the-art open-source TTS
3. **Deployment** - ONNX Runtime enables optimized inference across platforms
4. **Architecture fit** - Tauri already has a Rust backend we can extend

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
- Already partially implemented (current `tts-ui.ts`)
- Zero bundle size impact
- Works offline

**Cons:**
- Voice quality varies wildly by platform
- macOS voices are decent; Windows/Linux often robotic
- No consistency across platforms

**Verdict:** Keep as fallback, but not primary solution

### Option 3: Rust Backend with XTTS v2 + ONNX Runtime (Recommended)

**Pros:**
- State-of-the-art voice quality (XTTS v2)
- Native performance via ONNX Runtime
- Cross-platform (ort crate supports macOS/Windows/Linux)
- Runs in Tauri's Rust backend (no WebView limitations)
- Offline capable
- One-time model download (~1.5GB)

**Cons:**
- Significant bundle size increase
- Requires model download on first use
- More complex implementation
- GPU acceleration setup varies by platform

**Verdict:** Recommended - best balance of quality, performance, and offline capability

### Option 4: Piper TTS (Lightweight Alternative)

**Pros:**
- Much smaller models (15-100MB)
- Fast inference
- Good quality for size

**Cons:**
- Voice quality below XTTS v2
- Fewer voice options
- Less natural prosody

**Verdict:** Consider as "lite mode" option for users with storage constraints

## Decision

Implement **Option 3: Rust Backend TTS with XTTS v2 + ONNX Runtime**, with Option 2 (native TTS) as automatic fallback.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TypeScript (Frontend)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  tts-ui.ts  │  │ tts-rust.ts │  │  Article Content    │  │
│  │  (Native    │  │  (Tauri     │  │  Extraction         │  │
│  │   Fallback) │  │   Commands) │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                   │
└─────────┼────────────────┼───────────────────────────────────┘
          │                │
          │         ┌──────▼──────┐
          │         │ Tauri IPC   │
          │         │ invoke()    │
          │         └──────┬──────┘
          │                │
┌─────────┼────────────────┼───────────────────────────────────┐
│         │         ┌──────▼──────┐      Rust Backend          │
│         │         │ tts.rs      │                            │
│         │         │ Commands:   │                            │
│         │         │ - speak()   │                            │
│         │         │ - stop()    │                            │
│         │         │ - status()  │                            │
│         │         └──────┬──────┘                            │
│         │                │                                   │
│         │         ┌──────▼──────┐                            │
│         │         │ XttsSynth   │                            │
│         │         │ - init()    │                            │
│         │         │ - generate()│                            │
│         │         └──────┬──────┘                            │
│         │                │                                   │
│         │         ┌──────▼──────┐                            │
│         │         │ ONNX Runtime│                            │
│         │         │ (ort crate) │                            │
│         │         └──────┬──────┘                            │
│         │                │                                   │
│         │         ┌──────▼──────┐                            │
│         │         │ Audio Output│                            │
│         │         │ (rodio/cpal)│                            │
│         │         └─────────────┘                            │
│         │                                                    │
│  ┌──────▼──────┐                                             │
│  │ Native TTS  │  (Fallback when model not available)        │
│  │ tts crate   │                                             │
│  └─────────────┘                                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Infrastructure (Rust)

1. Add dependencies to `Cargo.toml`:
   ```toml
   [dependencies]
   ort = "2.0"              # ONNX Runtime bindings
   rodio = "0.19"           # Audio playback
   tts = "0.26"             # Native TTS fallback
   hound = "3.5"            # WAV encoding
   tokio = { version = "1", features = ["sync", "rt"] }
   ```

2. Create `src-tauri/src/tts/mod.rs`:
   - Model download/caching logic
   - ONNX session management
   - Audio generation pipeline

3. Tauri commands:
   - `tts_speak(text: String, voice: Option<String>) -> Result<(), String>`
   - `tts_stop() -> Result<(), String>`
   - `tts_get_status() -> TtsStatus`
   - `tts_list_voices() -> Vec<VoiceInfo>`
   - `tts_download_model(model_id: String) -> Result<(), String>`

### Phase 2: Model Management

1. **Model storage**: `~/.local/share/pastel-hn/models/` (or platform equivalent)
2. **First-run flow**:
   - Detect missing model
   - Prompt user to download (~1.5GB)
   - Show progress bar
   - Fall back to native TTS until download completes
3. **Model options**:
   - `xtts-v2-full` (~1.5GB) - Best quality
   - `piper-en-us` (~50MB) - Lightweight alternative

### Phase 3: Frontend Integration

1. Create `web/src/tts-rust.ts`:
   ```typescript
   import { invoke } from '@tauri-apps/api/core'
   
   export async function speak(text: string): Promise<void> {
     await invoke('tts_speak', { text })
   }
   
   export async function stop(): Promise<void> {
     await invoke('tts_stop')
   }
   ```

2. Update `tts-ui.ts` to prefer Rust TTS when available
3. Add settings UI for:
   - Voice selection
   - Speech rate
   - Model download management

### Phase 4: Streaming & Performance

1. **Sentence chunking**: Split text into sentences, generate in parallel
2. **Audio streaming**: Play first chunk while generating subsequent ones
3. **Caching**: Cache generated audio for recently read articles
4. **GPU acceleration**: Enable CUDA/Metal backends where available

## XTTS v2 Model Details

| Component | Size | Purpose |
|-----------|------|---------|
| `model.onnx` | ~1.2GB | Main synthesis model |
| `vocoder.onnx` | ~200MB | Audio vocoder |
| `tokenizer.json` | ~2MB | Text tokenizer |
| `speaker_embeddings/` | ~50MB | Voice embeddings |

**Inference Pipeline:**
1. Tokenize input text
2. Run encoder (text -> latent)
3. Run decoder (latent -> mel spectrogram)
4. Run vocoder (mel -> audio waveform)
5. Output 24kHz WAV

**Expected Performance (M1 Mac):**
- First token latency: ~500ms
- Real-time factor: ~0.3x (generates 3s audio per 1s compute)
- Memory usage: ~2GB during inference

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Model download fails | Medium | High | Retry logic, resume support, native fallback |
| ONNX Runtime crashes | Low | High | Catch panics, graceful degradation |
| Audio playback issues | Medium | Medium | Multiple audio backend options (rodio/cpal) |
| Bundle size concerns | High | Low | Model download separate from app install |
| GPU driver issues | Medium | Low | CPU fallback always available |

## Success Criteria

1. **Quality**: Voice quality rated "natural" by users in feedback
2. **Performance**: First audio plays within 3 seconds of clicking "Listen"
3. **Reliability**: <1% failure rate after model download
4. **Adoption**: >50% of TTS users choose neural voice over native

## Alternatives Considered But Rejected

### Whisper.cpp Style C++ Integration

Could use C++ TTS libraries via FFI, but:
- More complex build setup
- ort crate provides cleaner Rust integration
- ONNX Runtime already handles platform-specific optimizations

### Electron Instead of Tauri

Electron's Node.js backend could run neural TTS, but:
- Would require rewriting the entire app
- Larger bundle size (Electron ~150MB vs Tauri ~10MB)
- Against project's existing architecture

### WebGPU in Browser

Future browsers may support WebGPU for ML inference, but:
- Not widely available yet
- WKWebView (Tauri on macOS) support unclear
- Would repeat Kokoro.js problems with different API

## References

- [XTTS v2 Paper](https://arxiv.org/abs/2406.04904)
- [Coqui TTS](https://github.com/coqui-ai/TTS) - Original XTTS implementation
- [ort crate](https://github.com/pykeio/ort) - Rust ONNX Runtime bindings
- [Piper TTS](https://github.com/rhasspy/piper) - Lightweight alternative
- [ADR-0001](./0001_removing_zig_wasm_layer.md) - Previous architecture decisions

## Appendix: Voice Quality Comparison

| System | MOS Score* | Notes |
|--------|------------|-------|
| Human speech | 4.5 | Reference |
| XTTS v2 | 4.1 | Near-human quality |
| Piper (medium) | 3.6 | Good for size |
| macOS Siri voice | 3.8 | Best native option |
| Windows SAPI | 2.9 | Robotic |
| espeak | 2.2 | Very robotic |

*Mean Opinion Score (1-5 scale, higher is better)

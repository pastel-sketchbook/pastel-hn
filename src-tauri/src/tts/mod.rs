//! Text-to-Speech module with native and neural voice support.
//!
//! This module provides two TTS backends:
//!
//! 1. **Native OS TTS** ([`native`]) - Uses system voices (free, offline)
//! 2. **Neural TTS** ([`neural`]) - High-quality Piper via ONNX Runtime
//!
//! The native TTS is always available as a fallback. Neural TTS requires
//! downloading models (~63MB for Piper) but provides better voice quality.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────┐
//! │  TypeScript Frontend                        │
//! │  - tts-ui.ts: UI controls                   │
//! │  - tts-client.ts: Native TTS client         │
//! │  - tts-neural.ts: Neural TTS client         │
//! └─────────────────┬───────────────────────────┘
//!                   │
//! ┌─────────────────▼───────────────────────────┐
//! │  Rust Backend                               │
//! │  - tts.rs: Native OS TTS (tts crate)        │
//! │  - tts/neural/: Piper + ONNX Runtime        │
//! │    - mod.rs: Module coordinator             │
//! │    - model.rs: Download/caching             │
//! │    - synth.rs: ONNX inference               │
//! │    - audio.rs: Playback (rodio)             │
//! └─────────────────────────────────────────────┘
//! ```
//!
//! # Usage
//!
//! ```ignore
//! // Native TTS (always available)
//! tts::speak("Hello, world!", true)?;
//!
//! // Neural TTS (requires model download)
//! neural::speak("Hello, world!", None).await?;
//! ```

pub mod neural;

use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tts::{Features, Tts, UtteranceId};

/// Global TTS instance
static TTS_INSTANCE: OnceCell<Mutex<Tts>> = OnceCell::new();

/// Information about an available voice
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceInfo {
    /// Voice identifier (platform-specific)
    pub id: String,
    /// Human-readable voice name
    pub name: String,
    /// Language code (e.g., "en-US")
    pub language: Option<String>,
}

/// TTS service status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsStatus {
    /// Whether TTS is available on this system
    pub available: bool,
    /// Whether TTS is currently speaking
    pub is_speaking: bool,
    /// Current speech rate (0.0 - 1.0, where 0.5 is normal)
    pub rate: f32,
    /// Supported features on this platform
    pub features: TtsFeatures,
    /// Error message if not available
    pub message: Option<String>,
}

/// Platform-specific TTS features
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsFeatures {
    pub stop: bool,
    pub rate: bool,
    pub pitch: bool,
    pub volume: bool,
    pub is_speaking: bool,
    pub voice: bool,
    pub utterance_callbacks: bool,
}

impl From<Features> for TtsFeatures {
    fn from(f: Features) -> Self {
        Self {
            stop: f.stop,
            rate: f.rate,
            pitch: f.pitch,
            volume: f.volume,
            is_speaking: f.is_speaking,
            voice: f.voice,
            utterance_callbacks: f.utterance_callbacks,
        }
    }
}

/// Initialize the TTS engine.
///
/// Returns Ok(()) if successful, or an error message if TTS is unavailable.
pub fn init() -> Result<(), String> {
    TTS_INSTANCE.get_or_try_init(|| {
        Tts::default()
            .map(Mutex::new)
            .map_err(|e| format!("Failed to initialize TTS: {}", e))
    })?;
    Ok(())
}

/// Get the current TTS status.
pub fn get_status() -> TtsStatus {
    match TTS_INSTANCE.get() {
        Some(mutex) => match mutex.lock() {
            Ok(tts) => {
                let is_speaking = tts.is_speaking().unwrap_or(false);
                let rate = tts.get_rate().unwrap_or(0.5);
                // Normalize rate to 0.0-1.0 range (platform-specific ranges vary)
                let normalized_rate = normalize_rate_to_standard(rate);
                TtsStatus {
                    available: true,
                    is_speaking,
                    rate: normalized_rate,
                    features: tts.supported_features().into(),
                    message: None,
                }
            }
            Err(e) => TtsStatus {
                available: false,
                is_speaking: false,
                rate: 0.5,
                features: TtsFeatures {
                    stop: false,
                    rate: false,
                    pitch: false,
                    volume: false,
                    is_speaking: false,
                    voice: false,
                    utterance_callbacks: false,
                },
                message: Some(format!("TTS lock error: {}", e)),
            },
        },
        None => TtsStatus {
            available: false,
            is_speaking: false,
            rate: 0.5,
            features: TtsFeatures {
                stop: false,
                rate: false,
                pitch: false,
                volume: false,
                is_speaking: false,
                voice: false,
                utterance_callbacks: false,
            },
            message: Some("TTS not initialized".to_string()),
        },
    }
}

/// Speak the given text.
///
/// If `interrupt` is true, stops any current speech first.
pub fn speak(text: &str, interrupt: bool) -> Result<Option<UtteranceId>, String> {
    let mutex = TTS_INSTANCE
        .get()
        .ok_or_else(|| "TTS not initialized".to_string())?;

    let mut tts = mutex.lock().map_err(|e| format!("TTS lock error: {}", e))?;

    if interrupt {
        let _ = tts.stop();
    }

    tts.speak(text, interrupt)
        .map_err(|e| format!("Failed to speak: {}", e))
}

/// Stop any current speech.
pub fn stop() -> Result<(), String> {
    let mutex = TTS_INSTANCE
        .get()
        .ok_or_else(|| "TTS not initialized".to_string())?;

    let mut tts = mutex.lock().map_err(|e| format!("TTS lock error: {}", e))?;

    tts.stop().map_err(|e| format!("Failed to stop: {}", e))?;
    Ok(())
}

/// Get list of available voices.
pub fn get_voices() -> Result<Vec<VoiceInfo>, String> {
    let mutex = TTS_INSTANCE
        .get()
        .ok_or_else(|| "TTS not initialized".to_string())?;

    let tts = mutex.lock().map_err(|e| format!("TTS lock error: {}", e))?;

    let voices = tts
        .voices()
        .map_err(|e| format!("Failed to get voices: {}", e))?;

    Ok(voices
        .into_iter()
        .map(|v| VoiceInfo {
            id: v.id().to_string(),
            name: v.name().to_string(),
            language: Some(v.language().to_string()),
        })
        .collect())
}

/// Set the speech rate.
///
/// Rate is normalized to 0.0-1.0 where 0.5 is normal speed.
pub fn set_rate(rate: f32) -> Result<(), String> {
    let mutex = TTS_INSTANCE
        .get()
        .ok_or_else(|| "TTS not initialized".to_string())?;

    let mut tts = mutex.lock().map_err(|e| format!("TTS lock error: {}", e))?;

    // Convert from normalized 0.0-1.0 to platform-specific range
    let platform_rate = normalize_rate_from_standard(rate, &tts);

    tts.set_rate(platform_rate)
        .map_err(|e| format!("Failed to set rate: {}", e))?;
    Ok(())
}

/// Set the voice by ID.
pub fn set_voice(voice_id: &str) -> Result<(), String> {
    let mutex = TTS_INSTANCE
        .get()
        .ok_or_else(|| "TTS not initialized".to_string())?;

    let mut tts = mutex.lock().map_err(|e| format!("TTS lock error: {}", e))?;

    let voices = tts
        .voices()
        .map_err(|e| format!("Failed to get voices: {}", e))?;

    let voice = voices
        .into_iter()
        .find(|v| v.id() == voice_id)
        .ok_or_else(|| format!("Voice not found: {}", voice_id))?;

    tts.set_voice(&voice)
        .map_err(|e| format!("Failed to set voice: {}", e))?;
    Ok(())
}

/// Normalize platform-specific rate to 0.0-1.0 standard.
fn normalize_rate_to_standard(rate: f32) -> f32 {
    // Most platforms use different ranges. This is a rough normalization.
    // macOS: 0.0-1.0 (already normalized)
    // Windows SAPI: -10 to 10
    // Linux: platform-dependent
    // We'll assume the rate is already roughly in a sensible range
    // and clamp to 0.0-1.0
    rate.clamp(0.0, 1.0)
}

/// Convert standard 0.0-1.0 rate to platform-specific range.
fn normalize_rate_from_standard(rate: f32, _tts: &Tts) -> f32 {
    // For now, pass through as the tts crate handles normalization internally
    // for most operations. Clamp to valid range.
    rate.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_rate() {
        assert_eq!(normalize_rate_to_standard(0.5), 0.5);
        assert_eq!(normalize_rate_to_standard(-0.5), 0.0);
        assert_eq!(normalize_rate_to_standard(1.5), 1.0);
    }
}

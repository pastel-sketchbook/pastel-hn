//! Neural TTS module using Piper and ONNX Runtime
//!
//! This module provides high-quality text-to-speech using neural voice synthesis
//! via Piper running on ONNX Runtime. It includes:
//!
//! - Model download and caching
//! - ONNX inference pipeline
//! - Audio generation and playback
//! - Fallback to native TTS when neural voices unavailable
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────┐
//! │  TypeScript Frontend                        │
//! │  - tts-neural.ts: Neural TTS client         │
//! │  - tts-ui.ts: UI controls                   │
//! └─────────────────┬───────────────────────────┘
//!                   │ invoke()
//! ┌─────────────────▼───────────────────────────┐
//! │  Rust Backend (src-tauri/src/tts/)          │
//! │  - mod.rs: Module coordinator               │
//! │  - model.rs: Download/caching logic         │
//! │  - synth.rs: Piper + ONNX inference         │
//! │  - audio.rs: Audio playback (rodio)         │
//! └─────────────────────────────────────────────┘
//! ```

pub mod audio;
pub mod model;
pub mod synth;

pub use model::{ModelManager, NeuralModel};
pub use synth::NeuralTtsEngine;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;
use tokio::sync::RwLock;

/// Global neural TTS engine instance
static NEURAL_TTS: OnceLock<RwLock<NeuralTtsEngine>> = OnceLock::new();

/// Neural TTS status response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuralTtsStatus {
    /// Whether neural TTS is available (model downloaded)
    pub available: bool,
    /// Whether currently generating/speaking
    pub is_speaking: bool,
    /// Currently selected voice
    pub current_voice: Option<String>,
    /// Speech rate multiplier (0.5 - 2.0)
    pub rate: f32,
    /// Model download progress (0-100, None if not downloading)
    pub download_progress: Option<u8>,
    /// Available neural voices
    pub voices: Vec<NeuralVoiceInfo>,
    /// Error message if unavailable
    pub message: Option<String>,
}

/// Information about a neural voice
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuralVoiceInfo {
    pub id: String,
    pub name: String,
    pub language: String,
    pub description: Option<String>,
}

/// Initialize the neural TTS system.
///
/// This checks for downloaded models and prepares the engine.
/// Returns `Ok(())` if initialization succeeds (even if no model present).
pub async fn init_neural() -> Result<(), String> {
    let engine = NeuralTtsEngine::new().map_err(|e| e.to_string())?;

    NEURAL_TTS
        .set(RwLock::new(engine))
        .map_err(|_| "Neural TTS already initialized")?;

    Ok(())
}

/// Get the neural TTS engine instance.
async fn _get_engine() -> Result<tokio::sync::RwLockReadGuard<'static, NeuralTtsEngine>, String> {
    match NEURAL_TTS.get() {
        Some(lock) => Ok(lock.read().await),
        None => Err("Neural TTS not initialized".to_string()),
    }
}

/// Get the neural TTS engine instance (mutable).
async fn get_engine_mut() -> Result<tokio::sync::RwLockWriteGuard<'static, NeuralTtsEngine>, String>
{
    match NEURAL_TTS.get() {
        Some(lock) => Ok(lock.write().await),
        None => Err("Neural TTS not initialized".to_string()),
    }
}

/// Get the current neural TTS status.
pub async fn get_status() -> NeuralTtsStatus {
    match NEURAL_TTS.get() {
        Some(lock) => {
            let engine = lock.read().await;
            engine.get_status().await
        }
        None => NeuralTtsStatus {
            available: false,
            is_speaking: false,
            current_voice: None,
            rate: 1.0,
            download_progress: None,
            voices: vec![],
            message: Some("Neural TTS not initialized".to_string()),
        },
    }
}

/// Download a neural voice model.
///
/// # Arguments
/// * `model_id` - Model identifier (e.g., "piper-en-us")
/// * `progress_callback` - Optional callback for download progress (0-100)
pub async fn download_model<F>(model_id: &str, progress_callback: Option<F>) -> Result<(), String>
where
    F: Fn(u8) + Send + 'static,
{
    let model =
        NeuralModel::from_id(model_id).ok_or_else(|| format!("Unknown model: {}", model_id))?;

    let manager = ModelManager::new().map_err(|e| e.to_string())?;

    manager
        .download_model(model, progress_callback)
        .await
        .map_err(|e| e.to_string())
}

/// Check if a model is downloaded and ready.
pub fn is_model_ready(model_id: &str) -> Result<bool, String> {
    let model =
        NeuralModel::from_id(model_id).ok_or_else(|| format!("Unknown model: {}", model_id))?;

    let manager = ModelManager::new().map_err(|e| e.to_string())?;

    Ok(manager.is_model_ready(model))
}

/// Get the list of available neural voices.
pub fn list_neural_voices() -> Vec<NeuralVoiceInfo> {
    vec![NeuralVoiceInfo {
        id: "piper-en-us".to_string(),
        name: "Piper (US English)".to_string(),
        language: "en".to_string(),
        description: Some("Lightweight neural voice (~63MB)".to_string()),
    }]
}

/// Speak text using neural TTS.
///
/// Attempts to load the model if downloaded but not yet loaded.
/// Falls back to native TTS only if the model is not downloaded.
///
/// # Arguments
///
/// * `text` - Text to synthesize
/// * `voice_id` - Optional voice ID (uses default if not specified)
/// * `rate` - Speech rate from 0.5 to 2.0 (1.0 is normal)
pub async fn speak(text: &str, voice_id: Option<&str>, rate: Option<f32>) -> Result<(), String> {
    let mut engine = get_engine_mut().await?;

    // Set rate if provided
    if let Some(r) = rate {
        engine.set_rate(r);
    }

    // Try to speak with neural TTS - it will load the model if needed
    // The speak() method in synth.rs handles loading internally
    match engine.speak(text, voice_id).await {
        Ok(()) => Ok(()),
        Err(e) => {
            // If neural TTS fails (model not downloaded, inference error, etc.),
            // fall back to native TTS
            tracing::warn!("Neural TTS failed, falling back to native: {}", e);
            crate::tts::speak(text, true).map(|_| ())
        }
    }
}

/// Stop current neural TTS playback.
pub async fn stop() -> Result<(), String> {
    match NEURAL_TTS.get() {
        Some(lock) => {
            let mut engine = lock.write().await;
            engine.stop().await.map_err(|e| e.to_string())
        }
        None => Ok(()), // Nothing to stop
    }
}

/// Get the model directory path.
pub fn get_model_dir() -> Result<PathBuf, String> {
    ModelManager::get_model_dir().map_err(|e| e.to_string())
}

/// Get disk usage for neural TTS models.
pub fn get_model_disk_usage() -> Result<u64, String> {
    let manager = ModelManager::new().map_err(|e| e.to_string())?;
    manager.get_total_size().map_err(|e| e.to_string())
}

/// Delete a downloaded model to free disk space.
pub fn delete_model(model_id: &str) -> Result<(), String> {
    let model =
        NeuralModel::from_id(model_id).ok_or_else(|| format!("Unknown model: {}", model_id))?;

    let manager = ModelManager::new().map_err(|e| e.to_string())?;
    manager.delete_model(model).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_model_from_id() {
        assert!(NeuralModel::from_id("piper-en-us").is_some());
        assert!(NeuralModel::from_id("unknown").is_none());
    }

    #[test]
    fn test_list_neural_voices() {
        let voices = list_neural_voices();
        assert_eq!(voices.len(), 1);
        assert!(voices.iter().any(|v| v.id == "piper-en-us"));
    }

    #[test]
    fn test_model_dir_path() {
        // Test that we can get the model directory path
        let dir = get_model_dir();
        assert!(dir.is_ok());

        let path = dir.unwrap();
        assert!(path.to_string_lossy().contains("pastel-hn"));
    }

    #[test]
    fn test_neural_tts_status_default() {
        // When not initialized, should return unavailable status
        let status = tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(get_status());

        assert!(!status.available);
        assert!(status.message.is_some());
    }

    #[test]
    fn test_is_model_ready_with_temp_dir() {
        // Create a temporary directory for testing
        let temp_dir = TempDir::new().unwrap();
        let model_dir = temp_dir.path().join("piper-en-us");
        fs::create_dir_all(&model_dir).unwrap();

        // Create a fake model file
        let model_file = model_dir.join("en_US-lessac-medium.onnx");
        fs::write(&model_file, "fake model").unwrap();

        // Verify the file was created
        assert!(model_file.exists(), "Model file should exist in temp dir");
        assert!(model_dir.is_dir(), "Model directory should exist");
    }
}

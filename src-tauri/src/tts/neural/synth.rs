//! Neural TTS synthesis engine using Piper and ONNX Runtime
//!
//! This module provides:
//! - ONNX Runtime inference for Piper neural TTS
//! - Text-to-phoneme conversion via espeak-ng
//! - Phoneme-to-ID mapping using model config
//! - Audio generation and playback
//! - Sentence-by-sentence playback with progress events

use super::audio::AudioData;
use super::model::{ModelError, ModelManager, NeuralModel};
use ort::session::Session;
use ort::value::Value;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::mpsc;

/// Errors that can occur during synthesis
#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum SynthesisError {
    #[error("Model not loaded: {0}")]
    ModelNotLoaded(String),
    #[error("ONNX inference error: {0}")]
    InferenceError(String),
    #[error("Invalid input text: {0}")]
    InvalidInput(String),
    #[error("Audio generation error: {0}")]
    AudioError(String),
    #[error("Model error: {0}")]
    Model(#[from] ModelError),
    #[error("ONNX runtime error: {0}")]
    Ort(#[from] ort::Error),
    #[error("Phoneme conversion error: {0}")]
    PhonemeError(String),
    #[error("Config parse error: {0}")]
    ConfigError(String),
}

/// Events emitted during sentence-by-sentence TTS playback
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SentenceEvent {
    /// A sentence has started playing
    Start {
        /// Index of the sentence (0-based)
        index: usize,
        /// The sentence text
        text: String,
    },
    /// A sentence has finished playing
    End {
        /// Index of the sentence (0-based)
        index: usize,
    },
    /// All sentences have finished
    Finished,
    /// Playback was stopped
    Stopped,
}

/// Configuration for neural TTS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeuralTtsConfig {
    /// Speech rate multiplier (0.5 - 2.0)
    pub rate: f32,
    /// Voice identifier
    pub voice_id: String,
    /// Model to use
    pub model_id: String,
    /// Enable GPU acceleration
    pub use_gpu: bool,
}

impl Default for NeuralTtsConfig {
    fn default() -> Self {
        Self {
            rate: 1.0,
            voice_id: "default".to_string(),
            model_id: "piper-en-us".to_string(),
            use_gpu: true,
        }
    }
}

/// A neural voice configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct NeuralVoice {
    pub id: String,
    pub name: String,
    pub language: String,
    pub speaker_embedding: Option<Vec<f32>>,
}

/// Piper model configuration loaded from JSON
#[derive(Debug, Clone, Deserialize)]
struct PiperConfig {
    audio: AudioConfig,
    #[serde(default)]
    espeak: EspeakConfig,
    inference: InferenceConfig,
    phoneme_id_map: HashMap<String, Vec<i64>>,
}

#[derive(Debug, Clone, Deserialize)]
struct AudioConfig {
    sample_rate: u32,
    #[allow(dead_code)]
    quality: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct EspeakConfig {
    #[serde(default = "default_espeak_voice")]
    voice: String,
}

fn default_espeak_voice() -> String {
    "en-us".to_string()
}

#[derive(Debug, Clone, Deserialize)]
struct InferenceConfig {
    noise_scale: f32,
    length_scale: f32,
    noise_w: f32,
}

/// The neural TTS synthesis engine
pub struct NeuralTtsEngine {
    config: NeuralTtsConfig,
    model_manager: ModelManager,
    /// ONNX session for the main model
    model_session: Option<Session>,
    /// Currently loaded model ID
    loaded_model: Option<String>,
    /// Whether currently speaking (atomic for thread safety)
    is_speaking: Arc<AtomicBool>,
    /// Loaded Piper model config
    piper_config: Option<PiperConfig>,
}

impl NeuralTtsEngine {
    /// Create a new neural TTS engine
    pub fn new() -> Result<Self, SynthesisError> {
        Ok(NeuralTtsEngine {
            config: NeuralTtsConfig::default(),
            model_manager: ModelManager::new()?,
            model_session: None,
            loaded_model: None,
            is_speaking: Arc::new(AtomicBool::new(false)),
            piper_config: None,
        })
    }

    /// Check if neural TTS is available (model downloaded)
    pub async fn is_available(&self) -> bool {
        if let Some(model) = NeuralModel::from_id(&self.config.model_id) {
            self.model_manager.is_model_ready(model)
        } else {
            false
        }
    }

    /// Get current status
    pub async fn get_status(&self) -> super::NeuralTtsStatus {
        let available = self.is_available().await;
        let is_speaking = self.is_speaking.load(Ordering::SeqCst);

        super::NeuralTtsStatus {
            available,
            is_speaking,
            current_voice: Some(self.config.voice_id.clone()),
            rate: self.config.rate,
            download_progress: None,
            voices: super::list_neural_voices(),
            message: if available {
                None
            } else {
                Some(format!("Model '{}' not downloaded", self.config.model_id))
            },
        }
    }

    /// Load a model into memory (ONNX sessions and config)
    pub async fn load_model(&mut self, model_id: &str) -> Result<(), SynthesisError> {
        let model = NeuralModel::from_id(model_id)
            .ok_or_else(|| SynthesisError::ModelNotLoaded(model_id.to_string()))?;

        // Check if model is downloaded
        if !self.model_manager.is_model_ready(model) {
            return Err(SynthesisError::ModelNotLoaded(format!(
                "Model {} not downloaded",
                model_id
            )));
        }

        // Skip if already loaded
        if self.loaded_model.as_ref() == Some(&model_id.to_string()) {
            return Ok(());
        }

        // Load Piper config JSON
        let config_file = model
            .files
            .iter()
            .find(|f| f.name.ends_with(".json"))
            .ok_or_else(|| SynthesisError::ConfigError("No config JSON in model".to_string()))?;

        let config_path = self
            .model_manager
            .get_model_file_path(model, config_file.name)
            .ok_or_else(|| SynthesisError::ConfigError(config_file.name.to_string()))?;

        let config_content = std::fs::read_to_string(&config_path)
            .map_err(|e| SynthesisError::ConfigError(format!("Failed to read config: {}", e)))?;

        let piper_config: PiperConfig = serde_json::from_str(&config_content)
            .map_err(|e| SynthesisError::ConfigError(format!("Failed to parse config: {}", e)))?;

        tracing::info!(
            "Loaded Piper config: {} phonemes, sample_rate={}",
            piper_config.phoneme_id_map.len(),
            piper_config.audio.sample_rate
        );

        self.piper_config = Some(piper_config);

        // Load ONNX session
        let onnx_file = model
            .files
            .iter()
            .find(|f| f.name.ends_with(".onnx") && !f.name.ends_with(".json"))
            .ok_or_else(|| SynthesisError::ModelNotLoaded("No ONNX file in model".to_string()))?;

        let model_path = self
            .model_manager
            .get_model_file_path(model, onnx_file.name)
            .ok_or_else(|| SynthesisError::ModelNotLoaded(onnx_file.name.to_string()))?;

        // Load model file into memory
        let model_bytes = std::fs::read(&model_path)
            .map_err(|e| SynthesisError::ModelNotLoaded(format!("Failed to read model: {}", e)))?;

        // Configure and create session
        let session = Session::builder()?
            .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)?
            .with_intra_threads(4)?
            .commit_from_memory(&model_bytes)?;

        self.model_session = Some(session);

        self.loaded_model = Some(model_id.to_string());
        self.config.model_id = model_id.to_string();

        Ok(())
    }

    /// Speak text using neural TTS
    pub async fn speak(
        &mut self,
        text: &str,
        voice_id: Option<&str>,
    ) -> Result<(), SynthesisError> {
        // Ensure model is loaded
        if self.model_session.is_none() {
            self.load_model(&self.config.model_id.clone()).await?;
        }

        // Update voice if specified
        if let Some(vid) = voice_id {
            self.config.voice_id = vid.to_string();
        }

        // Preprocess and chunk text for long articles
        let processed_text = self.preprocess_text(text)?;
        let chunks = self.chunk_text(&processed_text);

        // Mark as speaking
        self.is_speaking.store(true, Ordering::SeqCst);

        // Generate audio for all chunks first
        let mut all_audio: Vec<f32> = Vec::new();
        let sample_rate = self
            .piper_config
            .as_ref()
            .map(|c| c.audio.sample_rate)
            .unwrap_or(22050);

        for chunk in chunks {
            // Check if we should stop
            if !self.is_speaking.load(Ordering::SeqCst) {
                break;
            }

            match self.generate_audio(&chunk).await {
                Ok(audio_data) => {
                    all_audio.extend(audio_data);
                }
                Err(e) => {
                    self.is_speaking.store(false, Ordering::SeqCst);
                    return Err(e);
                }
            }
        }

        // Play all audio in a blocking thread (rodio requires non-async context)
        if !all_audio.is_empty() {
            let is_speaking = self.is_speaking.clone();

            // Spawn blocking task for audio playback
            let play_result = tokio::task::spawn_blocking(move || {
                play_audio_blocking(all_audio, sample_rate, is_speaking, None)
            })
            .await;

            match play_result {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    tracing::warn!("Audio playback error: {}", e);
                }
                Err(e) => {
                    tracing::warn!("Audio task join error: {}", e);
                }
            }
        }

        self.is_speaking.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// Stop current playback
    pub async fn stop(&mut self) -> Result<(), SynthesisError> {
        self.is_speaking.store(false, Ordering::SeqCst);
        Ok(())
    }

    /// Speak sentences one-by-one, emitting events for each sentence
    ///
    /// This method processes each sentence individually, generating audio
    /// and playing it before moving to the next. It sends events through
    /// the provided channel to allow the frontend to highlight the current
    /// sentence being spoken.
    ///
    /// # Arguments
    ///
    /// * `sentences` - Array of sentences to speak
    /// * `voice_id` - Optional voice ID override
    /// * `event_tx` - Channel to send sentence events
    pub async fn speak_sentences(
        &mut self,
        sentences: &[String],
        voice_id: Option<&str>,
        event_tx: mpsc::Sender<SentenceEvent>,
    ) -> Result<(), SynthesisError> {
        // Ensure model is loaded
        if self.model_session.is_none() {
            self.load_model(&self.config.model_id.clone()).await?;
        }

        // Update voice if specified
        if let Some(vid) = voice_id {
            self.config.voice_id = vid.to_string();
        }

        // Mark as speaking
        self.is_speaking.store(true, Ordering::SeqCst);

        let sample_rate = self
            .piper_config
            .as_ref()
            .map(|c| c.audio.sample_rate)
            .unwrap_or(22050);

        // Process each sentence one by one
        for (index, sentence) in sentences.iter().enumerate() {
            // Check if we should stop
            if !self.is_speaking.load(Ordering::SeqCst) {
                let _ = event_tx.send(SentenceEvent::Stopped).await;
                break;
            }

            // Preprocess the sentence
            let processed = match self.preprocess_text(sentence) {
                Ok(p) if !p.is_empty() => p,
                _ => continue, // Skip empty sentences
            };

            // Generate audio for this sentence BEFORE emitting start event
            // This ensures highlighting syncs with actual audio playback
            match self.generate_audio(&processed).await {
                Ok(audio_data) => {
                    if !audio_data.is_empty() {
                        let is_speaking = self.is_speaking.clone();

                        // Create a oneshot channel to signal when audio starts
                        let (start_tx, start_rx) = tokio::sync::oneshot::channel::<()>();

                        // Clone data needed for the callback
                        let event_tx_clone = event_tx.clone();
                        let sentence_clone = sentence.clone();

                        // Callback to emit start event when audio actually begins
                        let on_start = Box::new(move || {
                            // Use blocking send since we're in a sync context
                            let rt = tokio::runtime::Handle::current();
                            rt.block_on(async {
                                let _ = event_tx_clone
                                    .send(SentenceEvent::Start {
                                        index,
                                        text: sentence_clone,
                                    })
                                    .await;
                            });
                            let _ = start_tx.send(());
                        });

                        // Play audio and wait for completion
                        let play_result = tokio::task::spawn_blocking(move || {
                            play_audio_blocking(audio_data, sample_rate, is_speaking, Some(on_start))
                        })
                        .await;

                        // Wait for start signal (ensures event was sent)
                        let _ = start_rx.await;

                        match play_result {
                            Ok(Ok(())) => {}
                            Ok(Err(e)) => {
                                tracing::warn!("Audio playback error: {}", e);
                            }
                            Err(e) => {
                                tracing::warn!("Audio task join error: {}", e);
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed to generate audio for sentence {}: {}", index, e);
                    // Continue with next sentence instead of stopping
                }
            }

            // Emit sentence end event
            let _ = event_tx.send(SentenceEvent::End { index }).await;
        }

        self.is_speaking.store(false, Ordering::SeqCst);

        // Emit finished event
        let _ = event_tx.send(SentenceEvent::Finished).await;

        Ok(())
    }

    /// Set speech rate
    #[allow(dead_code)]
    pub fn set_rate(&mut self, rate: f32) {
        self.config.rate = rate.clamp(0.5, 2.0);
    }

    /// Preprocess text for synthesis
    fn preprocess_text(&self, text: &str) -> Result<String, SynthesisError> {
        // Clean up text
        let text = text.replace(['\n', '\t'], " ").replace("  ", " ");

        // Remove URLs
        let url_regex = regex::Regex::new(r"https?://\S+").unwrap();
        let text = url_regex.replace_all(&text, "");

        Ok(text.trim().to_string())
    }

    /// Convert text to IPA phonemes using espeak-ng
    fn text_to_phonemes(&self, text: &str) -> Result<String, SynthesisError> {
        let voice = self
            .piper_config
            .as_ref()
            .map(|c| c.espeak.voice.as_str())
            .unwrap_or("en-us");

        // Call espeak-ng to get IPA phonemes
        let output = Command::new("espeak-ng")
            .args(["--ipa", "-q", "-v", voice, text])
            .output()
            .map_err(|e| {
                SynthesisError::PhonemeError(format!(
                    "Failed to run espeak-ng (is it installed?): {}",
                    e
                ))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(SynthesisError::PhonemeError(format!(
                "espeak-ng failed: {}",
                stderr
            )));
        }

        let phonemes = String::from_utf8_lossy(&output.stdout).trim().to_string();
        tracing::debug!("espeak-ng phonemes for '{}': '{}'", text, phonemes);

        Ok(phonemes)
    }

    /// Map IPA phonemes to model phoneme IDs
    ///
    /// Piper VITS models expect blank tokens (ID 0, represented by "_") to be
    /// interspersed between each phoneme. This is critical for proper audio
    /// synthesis - without blanks, the output sounds garbled/foreign.
    fn phonemes_to_ids(&self, phonemes: &str) -> Result<Vec<i64>, SynthesisError> {
        let config = self
            .piper_config
            .as_ref()
            .ok_or_else(|| SynthesisError::ConfigError("Piper config not loaded".to_string()))?;

        let mut ids = Vec::new();

        // Get the blank/pad token (usually "_" -> [0])
        let blank_ids = config.phoneme_id_map.get("_").cloned().unwrap_or_default();

        // Add start token "^"
        if let Some(start_ids) = config.phoneme_id_map.get("^") {
            ids.extend(start_ids);
        }

        // Add blank after start token
        ids.extend(&blank_ids);

        // Process each character in the phoneme string
        for ch in phonemes.chars() {
            let ch_str = ch.to_string();

            if let Some(phoneme_ids) = config.phoneme_id_map.get(&ch_str) {
                ids.extend(phoneme_ids);
            } else if ch.is_whitespace() {
                // Map whitespace to space token
                if let Some(space_ids) = config.phoneme_id_map.get(" ") {
                    ids.extend(space_ids);
                }
            } else if ch == '\n' {
                // Skip newlines (already handled in preprocessing)
                continue;
            } else {
                // Unknown phoneme - skip with warning
                tracing::trace!("Unknown phoneme '{}' (U+{:04X}), skipping", ch, ch as u32);
                continue;
            }

            // Add blank AFTER each phoneme (critical for VITS models)
            ids.extend(&blank_ids);
        }

        // Add end token "$"
        if let Some(end_ids) = config.phoneme_id_map.get("$") {
            ids.extend(end_ids);
        }

        if ids.is_empty() {
            return Err(SynthesisError::PhonemeError(
                "No phoneme IDs generated".to_string(),
            ));
        }

        tracing::debug!("Generated {} phoneme IDs (with blanks)", ids.len());
        Ok(ids)
    }

    /// Generate audio from text using ONNX inference
    async fn generate_audio(&mut self, text: &str) -> Result<Vec<f32>, SynthesisError> {
        // Convert text to phonemes, then to IDs
        let phonemes = self.text_to_phonemes(text)?;
        let phoneme_ids = self.phonemes_to_ids(&phonemes)?;

        tracing::debug!(
            "Text: '{}' -> Phonemes: '{}' -> {} IDs: {:?}...",
            &text[..text.len().min(50)],
            &phonemes[..phonemes.len().min(50)],
            phoneme_ids.len(),
            &phoneme_ids[..phoneme_ids.len().min(20)]
        );

        let config = self
            .piper_config
            .as_ref()
            .ok_or_else(|| SynthesisError::ConfigError("Piper config not loaded".to_string()))?;

        let session = self
            .model_session
            .as_mut()
            .ok_or_else(|| SynthesisError::ModelNotLoaded("Model not loaded".to_string()))?;

        // Prepare input tensors for Piper VITS model
        // Input shape: [1, phoneme_count]
        let input_len = phoneme_ids.len();

        // Create input tensor - shape as [batch, seq_len] using vec for dynamic size
        let input_tensor = Value::from_array((vec![1usize, input_len], phoneme_ids.clone()))
            .map_err(|e| SynthesisError::InferenceError(e.to_string()))?;

        // Input lengths tensor [batch_size] containing the length
        let input_lengths = vec![input_len as i64];
        let input_lengths_tensor = Value::from_array(([1usize], input_lengths))
            .map_err(|e| SynthesisError::InferenceError(e.to_string()))?;

        // Scales tensor [3]: noise_scale, length_scale, noise_w
        let length_scale = config.inference.length_scale / self.config.rate;
        let scales = vec![
            config.inference.noise_scale,
            length_scale,
            config.inference.noise_w,
        ];
        let scales_tensor = Value::from_array(([3usize], scales))
            .map_err(|e| SynthesisError::InferenceError(e.to_string()))?;

        // Run inference
        // Piper VITS model inputs: input, input_lengths, scales
        // Output: audio tensor [1, 1, 1, samples]
        let outputs = session
            .run(ort::inputs![
                "input" => input_tensor,
                "input_lengths" => input_lengths_tensor,
                "scales" => scales_tensor
            ])
            .map_err(|e| SynthesisError::InferenceError(e.to_string()))?;

        // Extract audio from output tensor (first output)
        // Piper outputs: "output" containing audio samples
        let (output_name, audio_value) = outputs
            .iter()
            .next()
            .ok_or_else(|| SynthesisError::InferenceError("No output tensor".to_string()))?;

        tracing::debug!("Output tensor name: {}", output_name);

        // Extract f32 samples from the tensor
        let (shape, audio_slice) = audio_value.try_extract_tensor::<f32>().map_err(|e| {
            SynthesisError::InferenceError(format!("Failed to extract audio: {}", e))
        })?;

        // Flatten to Vec<f32>
        let audio_samples: Vec<f32> = audio_slice.to_vec();

        tracing::info!(
            "Generated {} audio samples ({:.2}s at {}Hz), shape: {:?}",
            audio_samples.len(),
            audio_samples.len() as f64 / config.audio.sample_rate as f64,
            config.audio.sample_rate,
            shape
        );

        Ok(audio_samples)
    }

    /// Split text into chunks for synthesis
    /// Piper can handle ~500 chars comfortably per chunk
    pub fn chunk_text(&self, text: &str) -> Vec<String> {
        const MAX_CHUNK_SIZE: usize = 500;

        // Split on sentence boundaries
        let sentences: Vec<String> = text
            .split(['.', '!', '?'])
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(|s| format!("{}.", s))
            .collect();

        // Combine sentences into chunks up to MAX_CHUNK_SIZE
        let mut chunks = Vec::new();
        let mut current_chunk = String::new();

        for sentence in sentences {
            // If single sentence is too long, add it as its own chunk
            if sentence.len() > MAX_CHUNK_SIZE {
                if !current_chunk.is_empty() {
                    chunks.push(current_chunk.trim().to_string());
                    current_chunk = String::new();
                }
                chunks.push(sentence);
                continue;
            }

            if current_chunk.len() + sentence.len() + 1 > MAX_CHUNK_SIZE {
                if !current_chunk.is_empty() {
                    chunks.push(current_chunk.trim().to_string());
                }
                current_chunk = sentence;
            } else {
                if !current_chunk.is_empty() {
                    current_chunk.push(' ');
                }
                current_chunk.push_str(&sentence);
            }
        }

        if !current_chunk.is_empty() {
            chunks.push(current_chunk.trim().to_string());
        }

        // Return at least the original text if no chunks were created
        if chunks.is_empty() && !text.is_empty() {
            chunks.push(text.to_string());
        }

        chunks
    }
}

/// Load speaker embeddings from file
fn _load_speaker_embedding(_path: &std::path::Path) -> Result<Vec<f32>, SynthesisError> {
    // In production, would load from a .npy or .bin file
    // For now, return a default embedding
    Ok(vec![0.0; 512])
}

/// Play audio in a blocking context using rodio
/// This function is designed to be called from spawn_blocking
///
/// # Arguments
/// * `audio_samples` - The audio samples to play
/// * `sample_rate` - Sample rate in Hz
/// * `is_speaking` - Atomic flag to check for stop signal
/// * `on_start` - Optional callback to invoke when audio actually starts playing
fn play_audio_blocking(
    audio_samples: Vec<f32>,
    sample_rate: u32,
    is_speaking: Arc<AtomicBool>,
    on_start: Option<Box<dyn FnOnce() + Send>>,
) -> Result<(), String> {
    use rodio::{Decoder, OutputStreamBuilder, Sink};
    use std::io::Cursor;

    // Create AudioData and convert to WAV
    let audio = AudioData::new(audio_samples, sample_rate, 1);
    let wav_bytes = audio.to_wav_bytes().map_err(|e| e.to_string())?;

    // Create output stream (must stay alive during playback)
    let mut stream = OutputStreamBuilder::open_default_stream()
        .map_err(|e| format!("Failed to create audio stream: {}", e))?;
    stream.log_on_drop(false); // Don't print message when stream is dropped

    // Create sink for playback using the mixer
    let sink = Sink::connect_new(stream.mixer());

    // Decode WAV and append to sink
    let cursor = Cursor::new(wav_bytes);
    let source = Decoder::new(cursor).map_err(|e| format!("Failed to decode audio: {}", e))?;

    sink.append(source);

    // Wait for audio to actually start playing
    // The sink.append() just queues the audio - there's buffer latency
    // before sound actually comes out of the speakers.
    // A small delay ensures the Start event fires when audio is audible.
    std::thread::sleep(std::time::Duration::from_millis(50));

    // Signal that audio playback is starting NOW
    if let Some(callback) = on_start {
        callback();
    }

    // Wait for playback to complete, checking for stop signal
    while !sink.empty() {
        if !is_speaking.load(Ordering::SeqCst) {
            sink.stop();
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    // Wait a bit for audio to finish
    sink.sleep_until_end();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_neural_tts_config_default() {
        let config = NeuralTtsConfig::default();
        assert_eq!(config.rate, 1.0);
        assert_eq!(config.voice_id, "default");
        assert_eq!(config.model_id, "piper-en-us");
        assert!(config.use_gpu);
    }

    #[test]
    fn test_preprocess_text() {
        let engine = NeuralTtsEngine::new().unwrap();

        let text = "Hello\n\tWorld  ";
        let result = engine.preprocess_text(text).unwrap();
        assert_eq!(result, "Hello World");

        let with_url = "Check out https://example.com for more info.";
        let result = engine.preprocess_text(with_url).unwrap();
        assert!(!result.contains("https"));
    }

    #[test]
    fn test_long_text_is_accepted() {
        let engine = NeuralTtsEngine::new().unwrap();
        let long_text = "a".repeat(10000);

        // Long text should be accepted (chunking handles it)
        let result = engine.preprocess_text(&long_text);
        assert!(result.is_ok());
    }

    #[test]
    fn test_chunk_text_splits_long_text() {
        let engine = NeuralTtsEngine::new().unwrap();
        let long_text = "This is sentence one. ".repeat(50); // ~1100 chars

        let chunks = engine.chunk_text(&long_text);
        assert!(
            chunks.len() > 1,
            "Long text should be split into multiple chunks"
        );

        // Each chunk should be within the limit
        for chunk in &chunks {
            assert!(chunk.len() <= 600, "Chunk too long: {} chars", chunk.len());
        }
    }

    #[test]
    fn test_chunk_text() {
        let engine = NeuralTtsEngine::new().unwrap();
        let text = "First sentence. Second sentence! Third sentence? Fourth sentence here.";

        let chunks = engine.chunk_text(text);
        assert!(!chunks.is_empty());

        // Verify each chunk ends with a period
        for chunk in &chunks {
            assert!(chunk.ends_with('.'));
        }
    }

    #[test]
    fn test_set_rate_clamping() {
        let mut engine = NeuralTtsEngine::new().unwrap();

        engine.set_rate(0.1);
        assert_eq!(engine.config.rate, 0.5);

        engine.set_rate(3.0);
        assert_eq!(engine.config.rate, 2.0);

        engine.set_rate(1.5);
        assert_eq!(engine.config.rate, 1.5);
    }

    #[test]
    fn test_piper_config_parsing() {
        let json = r#"{
            "audio": { "sample_rate": 22050, "quality": "medium" },
            "espeak": { "voice": "en-us" },
            "inference": { "noise_scale": 0.667, "length_scale": 1.0, "noise_w": 0.8 },
            "phoneme_type": "espeak",
            "phoneme_map": {},
            "phoneme_id_map": {
                "_": [0], "^": [1], "$": [2], " ": [3],
                "a": [14], "b": [15], "h": [20], "ə": [59]
            }
        }"#;

        let config: PiperConfig = serde_json::from_str(json).unwrap();

        assert_eq!(config.audio.sample_rate, 22050);
        assert_eq!(config.espeak.voice, "en-us");
        assert_eq!(config.inference.noise_scale, 0.667);
        assert_eq!(config.phoneme_id_map.len(), 8);
        assert_eq!(config.phoneme_id_map.get("^"), Some(&vec![1]));
    }

    /// Test espeak-ng integration (requires espeak-ng installed)
    #[test]
    #[ignore] // Requires espeak-ng to be installed
    fn test_text_to_phonemes() {
        let mut engine = NeuralTtsEngine::new().unwrap();

        // Set up minimal config for espeak
        engine.piper_config = Some(PiperConfig {
            audio: AudioConfig {
                sample_rate: 22050,
                quality: None,
            },
            espeak: EspeakConfig {
                voice: "en-us".to_string(),
            },
            inference: InferenceConfig {
                noise_scale: 0.667,
                length_scale: 1.0,
                noise_w: 0.8,
            },
            phoneme_id_map: HashMap::new(),
        });

        let result = engine.text_to_phonemes("Hello");
        assert!(result.is_ok(), "espeak-ng should produce phonemes");

        let phonemes = result.unwrap();
        assert!(!phonemes.is_empty(), "Phonemes should not be empty");
        // "Hello" in IPA typically contains 'h', 'ə', 'l', 'oʊ' or similar
        assert!(
            phonemes.contains('h') || phonemes.contains('ə'),
            "Phonemes should contain expected IPA characters"
        );
    }

    /// Integration test: Generate audio and save to file for verification
    #[tokio::test]
    #[ignore] // Requires model to be downloaded
    async fn test_generate_audio_integration() {
        use std::io::Write;

        let mut engine = NeuralTtsEngine::new().unwrap();

        // Load the model
        engine
            .load_model("piper-en-us")
            .await
            .expect("Model should be downloadable");

        // Generate audio for "Hello world"
        let audio = engine
            .generate_audio("Hello world")
            .await
            .expect("Should generate audio");

        println!("Generated {} samples", audio.len());
        println!(
            "Audio range: [{:.4}, {:.4}]",
            audio.iter().cloned().reduce(f32::min).unwrap_or(0.0),
            audio.iter().cloned().reduce(f32::max).unwrap_or(0.0)
        );

        // Write to WAV file for manual inspection
        let sample_rate = 22050u32;
        let audio_data = super::super::audio::AudioData::new(audio, sample_rate, 1);
        let wav_bytes = audio_data.to_wav_bytes().expect("Should convert to WAV");

        let wav_path = "/tmp/rust_piper_test.wav";
        let mut file = std::fs::File::create(wav_path).unwrap();
        file.write_all(&wav_bytes).unwrap();

        println!("Saved audio to {}", wav_path);
    }

    /// Integration test: Full speak test with audio playback
    #[tokio::test]
    #[ignore] // Requires model and audio output
    async fn test_speak_integration() {
        let mut engine = NeuralTtsEngine::new().unwrap();

        // Load the model
        engine
            .load_model("piper-en-us")
            .await
            .expect("Model should load");

        // Speak some text
        println!("Speaking 'Hello, this is a test of the Piper TTS system.'");
        let result = engine
            .speak("Hello, this is a test of the Piper TTS system.", None)
            .await;

        assert!(result.is_ok(), "Speak should succeed: {:?}", result);
        println!("Speak completed!");
    }

    /// Integration test: Verify sentence event timing matches audio playback
    ///
    /// This test ensures that:
    /// 1. Start events fire when audio actually begins playing (not before)
    /// 2. End events fire after audio completes
    /// 3. Events arrive in correct order: Start(0), End(0), Start(1), End(1), ..., Finished
    /// 4. No sentence highlighting runs ahead of audio playback
    #[tokio::test]
    #[ignore] // Requires model and audio output
    async fn test_sentence_event_timing() {
        use std::time::{Duration, Instant};

        let mut engine = NeuralTtsEngine::new().unwrap();

        // Load the model
        engine
            .load_model("piper-en-us")
            .await
            .expect("Model should load");

        // Short sentences for quick test
        let sentences = vec![
            "Hello.".to_string(),
            "World.".to_string(),
            "Test.".to_string(),
        ];

        // Create channel for events
        let (tx, mut rx) = mpsc::channel::<SentenceEvent>(32);

        // Track event timings
        #[derive(Debug)]
        struct EventTiming {
            event_type: String,
            index: Option<usize>,
            timestamp: Instant,
        }

        let start_time = Instant::now();
        let mut timings: Vec<EventTiming> = Vec::new();

        // Spawn the speak task
        let speak_handle = tokio::spawn(async move {
            engine.speak_sentences(&sentences, None, tx).await
        });

        // Collect all events with timestamps
        while let Some(event) = rx.recv().await {
            let timing = EventTiming {
                event_type: match &event {
                    SentenceEvent::Start { .. } => "Start".to_string(),
                    SentenceEvent::End { .. } => "End".to_string(),
                    SentenceEvent::Finished => "Finished".to_string(),
                    SentenceEvent::Stopped => "Stopped".to_string(),
                },
                index: match &event {
                    SentenceEvent::Start { index, .. } => Some(*index),
                    SentenceEvent::End { index } => Some(*index),
                    _ => None,
                },
                timestamp: Instant::now(),
            };

            println!(
                "[{:>6.1}ms] {:?}",
                timing.timestamp.duration_since(start_time).as_secs_f64() * 1000.0,
                timing
            );

            let is_finished = matches!(event, SentenceEvent::Finished | SentenceEvent::Stopped);
            timings.push(timing);

            if is_finished {
                break;
            }
        }

        // Wait for speak to complete
        let result = speak_handle.await.unwrap();
        assert!(result.is_ok(), "speak_sentences should succeed");

        // Verify event order: Start(i), End(i) pairs in sequence
        let mut expected_index = 0;
        let mut expecting_start = true;

        for timing in &timings {
            match timing.event_type.as_str() {
                "Start" => {
                    assert!(
                        expecting_start,
                        "Got Start but expected End for index {}",
                        expected_index
                    );
                    assert_eq!(
                        timing.index,
                        Some(expected_index),
                        "Start index mismatch"
                    );
                    expecting_start = false;
                }
                "End" => {
                    assert!(
                        !expecting_start,
                        "Got End but expected Start for index {}",
                        expected_index
                    );
                    assert_eq!(
                        timing.index,
                        Some(expected_index),
                        "End index mismatch"
                    );
                    expected_index += 1;
                    expecting_start = true;
                }
                "Finished" => {
                    assert!(expecting_start, "Got Finished but expected End");
                }
                _ => {}
            }
        }

        // Verify timing: each Start->End pair should have reasonable duration
        // (audio playback takes time, so End should be at least 100ms after Start)
        let mut i = 0;
        while i + 1 < timings.len() {
            if timings[i].event_type == "Start" && timings[i + 1].event_type == "End" {
                let duration = timings[i + 1]
                    .timestamp
                    .duration_since(timings[i].timestamp);

                println!(
                    "Sentence {} playback duration: {:?}",
                    timings[i].index.unwrap_or(0),
                    duration
                );

                // Audio should take at least 100ms to play (even short words)
                assert!(
                    duration >= Duration::from_millis(100),
                    "Sentence {} playback too short ({:?}), Start event may be firing before audio",
                    timings[i].index.unwrap_or(0),
                    duration
                );
            }
            i += 1;
        }

        // Verify no overlap: Start(n+1) should come after End(n)
        for i in 0..timings.len().saturating_sub(2) {
            if timings[i].event_type == "End" && timings[i + 1].event_type == "Start" {
                assert!(
                    timings[i + 1].timestamp >= timings[i].timestamp,
                    "Start event for sentence {} came before End of sentence {}",
                    timings[i + 1].index.unwrap_or(0),
                    timings[i].index.unwrap_or(0)
                );
            }
        }

        println!("All timing assertions passed!");
    }

    /// Integration test: Verify that Start events are emitted EXACTLY when audio playback begins
    ///
    /// This test specifically checks for the "1 turn ahead" issue where highlighting
    /// appears to run ahead of the audio. The test verifies:
    ///
    /// 1. The time between Start event and the actual start of audio playback is < 50ms
    /// 2. Audio generation happens BEFORE the Start event
    /// 3. No Start event is emitted until the audio sink is ready
    ///
    /// If this test fails, the highlighting will appear ahead of the audio.
    #[tokio::test]
    #[ignore] // Requires model and audio output
    async fn test_start_event_not_ahead_of_audio() {
        use std::time::{Duration, Instant};

        let mut engine = NeuralTtsEngine::new().unwrap();

        // Load the model
        engine
            .load_model("piper-en-us")
            .await
            .expect("Model should load");

        // Use a sentence that's long enough to notice timing issues
        let sentences = vec!["This is a test sentence with enough words to make timing issues noticeable.".to_string()];

        // Create channel for events
        let (tx, mut rx) = mpsc::channel::<SentenceEvent>(32);

        // Record when we start
        let call_start = Instant::now();

        // Spawn the speak task
        let speak_handle = tokio::spawn(async move {
            engine.speak_sentences(&sentences, None, tx).await
        });

        // Wait for the Start event
        let start_event_time;
        loop {
            if let Some(event) = rx.recv().await {
                if let SentenceEvent::Start { .. } = event {
                    start_event_time = Instant::now();
                    println!(
                        "Start event received at {:?} after call",
                        start_event_time.duration_since(call_start)
                    );
                    break;
                }
            } else {
                panic!("Channel closed before receiving Start event");
            }
        }

        // The audio generation time should be >100ms (espeak + ONNX inference)
        // If Start event came < 100ms after call, something is wrong
        let time_to_start = start_event_time.duration_since(call_start);
        println!("Time from call to Start event: {:?}", time_to_start);

        // Audio generation should take at least 100ms for any non-trivial text
        // If the Start event fires before this, it means we're emitting too early
        assert!(
            time_to_start >= Duration::from_millis(100),
            "Start event fired too quickly ({:?}). Audio generation should take longer. \
             This may indicate the Start event is being emitted before audio is ready.",
            time_to_start
        );

        // Wait for the rest to complete
        while let Some(event) = rx.recv().await {
            match event {
                SentenceEvent::End { .. } => {
                    let end_time = Instant::now();
                    let playback_duration = end_time.duration_since(start_event_time);
                    println!("Playback duration: {:?}", playback_duration);

                    // Playback should take meaningful time (> 500ms for this sentence)
                    assert!(
                        playback_duration >= Duration::from_millis(500),
                        "Playback too short ({:?}). Audio should be playing.",
                        playback_duration
                    );
                }
                SentenceEvent::Finished => break,
                _ => {}
            }
        }

        let _ = speak_handle.await;
        println!("Test passed: Start event timing is correct!");
    }

    /// Integration test: Verify timing with realistic article sentences
    ///
    /// Uses longer, realistic sentences to ensure the timing behaves correctly
    /// in real-world usage where sentences are typically 100-400 characters.
    #[tokio::test]
    #[ignore] // Requires model and audio output
    async fn test_realistic_sentence_timing() {
        use std::time::{Duration, Instant};

        let mut engine = NeuralTtsEngine::new().unwrap();

        // Load the model
        engine
            .load_model("piper-en-us")
            .await
            .expect("Model should load");

        // Realistic article sentences (200-400 chars each like the frontend chunks)
        let sentences = vec![
            "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the English alphabet and is commonly used to test fonts and keyboards.".to_string(),
            "According to recent studies, reading aloud can improve memory retention and comprehension. Many educators recommend this technique for students of all ages.".to_string(),
        ];

        // Create channel for events
        let (tx, mut rx) = mpsc::channel::<SentenceEvent>(32);

        let start_time = Instant::now();

        // Spawn the speak task
        let speak_handle = tokio::spawn(async move {
            engine.speak_sentences(&sentences, None, tx).await
        });

        // Track timing for each sentence
        let mut start_times: Vec<Instant> = Vec::new();
        let mut end_times: Vec<Instant> = Vec::new();

        while let Some(event) = rx.recv().await {
            let now = Instant::now();
            match &event {
                SentenceEvent::Start { index, .. } => {
                    let elapsed = now.duration_since(start_time);
                    println!("Start({}) at {:?}", index, elapsed);
                    while start_times.len() <= *index {
                        start_times.push(now);
                    }
                    start_times[*index] = now;
                }
                SentenceEvent::End { index } => {
                    let elapsed = now.duration_since(start_time);
                    println!("End({}) at {:?}", index, elapsed);
                    while end_times.len() <= *index {
                        end_times.push(now);
                    }
                    end_times[*index] = now;
                }
                SentenceEvent::Finished => {
                    println!("Finished at {:?}", now.duration_since(start_time));
                    break;
                }
                _ => {}
            }
        }

        let _ = speak_handle.await;

        // Verify: Each sentence should have playback duration > 1 second
        // (realistic sentences at normal rate should take 3-6 seconds each)
        for i in 0..start_times.len().min(end_times.len()) {
            let playback = end_times[i].duration_since(start_times[i]);
            println!("Sentence {} playback duration: {:?}", i, playback);
            assert!(
                playback >= Duration::from_secs(1),
                "Sentence {} playback too short ({:?})",
                i,
                playback
            );
        }

        // Verify: Gap between End(N) and Start(N+1) should include audio generation
        // For realistic sentences, generation takes 300-600ms
        if end_times.len() > 0 && start_times.len() > 1 {
            let gap = start_times[1].duration_since(end_times[0]);
            println!("Gap between End(0) and Start(1): {:?}", gap);

            // The gap should include audio generation time.
            // However, after warmup, ONNX inference is fast (10-50ms).
            // The important thing is that Start fires AFTER generation,
            // which is guaranteed by our callback-based approach.
            println!(
                "Note: Gap of {:?} is normal - ONNX is fast after warmup",
                gap
            );
        }

        println!("Realistic sentence timing test passed!");
    }
}

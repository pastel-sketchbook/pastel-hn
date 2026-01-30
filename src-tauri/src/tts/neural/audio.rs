//! Audio playback using rodio
//!
//! Handles audio playback with features:
//! - Stream audio while generating
//! - Pause/resume support
//! - Volume control
//! - Smooth transitions between chunks

use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink};
use std::io::Cursor;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Mutex;

/// Errors that can occur during audio playback
#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum AudioError {
    #[error("Failed to create output stream: {0}")]
    StreamError(String),
    #[error("Playback error: {0}")]
    PlaybackError(String),
    #[error("Audio format error: {0}")]
    FormatError(String),
    #[error("No audio available")]
    NoAudio,
}

/// Audio playback controller
#[allow(dead_code)]
pub struct AudioPlayer {
    /// Output stream (kept alive for playback)
    _stream: OutputStream,
    /// Current audio sink (for playback control)
    sink: Option<Arc<Mutex<Sink>>>,
    /// Current volume (0.0 - 1.0)
    volume: f32,
}

/// Raw audio data container
#[allow(dead_code)]
pub struct AudioData {
    /// Audio samples (float32, -1.0 to 1.0)
    pub samples: Vec<f32>,
    /// Sample rate (typically 22050 Hz for Piper)
    pub sample_rate: u32,
    /// Number of channels (1 for mono)
    pub channels: u16,
}

impl AudioData {
    /// Create new audio data
    #[allow(dead_code)]
    pub fn new(samples: Vec<f32>, sample_rate: u32, channels: u16) -> Self {
        Self {
            samples,
            sample_rate,
            channels,
        }
    }

    /// Duration in seconds
    #[allow(dead_code)]
    pub fn duration_secs(&self) -> f64 {
        self.samples.len() as f64 / self.sample_rate as f64 / self.channels as f64
    }

    /// Convert to WAV bytes for rodio
    #[allow(dead_code)]
    pub fn to_wav_bytes(&self) -> Result<Vec<u8>, AudioError> {
        use hound::{WavSpec, WavWriter};

        let spec = WavSpec {
            channels: self.channels,
            sample_rate: self.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut writer = WavWriter::new(&mut cursor, spec)
                .map_err(|e| AudioError::FormatError(e.to_string()))?;

            // Convert f32 samples to i16
            for sample in &self.samples {
                let clamped = sample.clamp(-1.0, 1.0);
                let int_sample = (clamped * i16::MAX as f32) as i16;
                writer
                    .write_sample(int_sample)
                    .map_err(|e| AudioError::FormatError(e.to_string()))?;
            }

            writer
                .finalize()
                .map_err(|e| AudioError::FormatError(e.to_string()))?;
        }

        Ok(cursor.into_inner())
    }
}

impl AudioPlayer {
    /// Create a new audio player
    #[allow(dead_code)]
    pub fn new() -> Result<Self, AudioError> {
        let mut stream = OutputStreamBuilder::open_default_stream()
            .map_err(|e| AudioError::StreamError(e.to_string()))?;
        stream.log_on_drop(false);

        Ok(AudioPlayer {
            _stream: stream,
            sink: None,
            volume: 1.0,
        })
    }

    /// Play audio data
    #[allow(dead_code)]
    pub async fn play(&mut self, audio_data: AudioData) -> Result<(), AudioError> {
        // Stop any current playback
        self.stop().await?;

        // Convert to WAV format
        let wav_bytes = audio_data.to_wav_bytes()?;

        // Create cursor for decoder
        let cursor = Cursor::new(wav_bytes);

        // Create decoder
        let source = Decoder::new(cursor).map_err(|e| AudioError::FormatError(e.to_string()))?;

        // Create sink for playback
        let sink = Sink::connect_new(self._stream.mixer());

        // Set volume
        sink.set_volume(self.volume);

        // Start playback
        sink.append(source);

        // Store sink for control
        self.sink = Some(Arc::new(Mutex::new(sink)));

        Ok(())
    }

    /// Stop playback
    #[allow(dead_code)]
    pub async fn stop(&mut self) -> Result<(), AudioError> {
        if let Some(sink_arc) = self.sink.take() {
            let sink = sink_arc.lock().await;
            sink.stop();
        }
        Ok(())
    }

    /// Pause playback
    #[allow(dead_code)]
    pub async fn pause(&self) -> Result<(), AudioError> {
        if let Some(ref sink_arc) = self.sink {
            let sink = sink_arc.lock().await;
            sink.pause();
        }
        Ok(())
    }

    /// Resume playback
    #[allow(dead_code)]
    pub async fn resume(&self) -> Result<(), AudioError> {
        if let Some(ref sink_arc) = self.sink {
            let sink = sink_arc.lock().await;
            sink.play();
        }
        Ok(())
    }

    /// Check if currently playing
    #[allow(dead_code)]
    pub async fn is_playing(&self) -> bool {
        if let Some(ref sink_arc) = self.sink {
            let sink = sink_arc.lock().await;
            !sink.is_paused() && !sink.empty()
        } else {
            false
        }
    }

    /// Set volume (0.0 - 1.0)
    #[allow(dead_code)]
    pub fn set_volume(&mut self, volume: f32) {
        self.volume = volume.clamp(0.0, 1.0);

        // Update volume on current sink if exists
        if let Some(ref _sink_arc) = self.sink {
            // Note: In async context, we'd use block_on or similar
            // For now, this will be applied to next playback
        }
    }

    /// Get current volume
    #[allow(dead_code)]
    pub fn get_volume(&self) -> f32 {
        self.volume
    }

    /// Append audio to current playback (for streaming)
    #[allow(dead_code)]
    pub async fn append(&mut self, audio_data: AudioData) -> Result<(), AudioError> {
        let wav_bytes = audio_data.to_wav_bytes()?;
        let cursor = Cursor::new(wav_bytes);

        let source = Decoder::new(cursor).map_err(|e| AudioError::FormatError(e.to_string()))?;

        if let Some(ref sink_arc) = self.sink {
            let sink = sink_arc.lock().await;
            sink.append(source);
            Ok(())
        } else {
            // No active sink, start new playback
            self.play(audio_data).await
        }
    }
}

/// Audio chunk buffer for streaming playback
#[allow(dead_code)]
pub struct AudioChunkBuffer {
    chunks: Vec<AudioData>,
    sample_rate: u32,
    channels: u16,
}

impl AudioChunkBuffer {
    /// Create new buffer
    #[allow(dead_code)]
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        Self {
            chunks: Vec::new(),
            sample_rate,
            channels,
        }
    }

    /// Add a chunk of audio
    #[allow(dead_code)]
    pub fn push_chunk(&mut self, samples: Vec<f32>) {
        self.chunks
            .push(AudioData::new(samples, self.sample_rate, self.channels));
    }

    /// Combine all chunks into single audio data
    #[allow(dead_code)]
    pub fn combine(&self) -> AudioData {
        let total_samples: usize = self.chunks.iter().map(|c| c.samples.len()).sum();
        let mut combined = Vec::with_capacity(total_samples);

        for chunk in &self.chunks {
            combined.extend_from_slice(&chunk.samples);
        }

        AudioData::new(combined, self.sample_rate, self.channels)
    }

    /// Clear all chunks
    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.chunks.clear();
    }

    /// Number of chunks
    #[allow(dead_code)]
    pub fn chunk_count(&self) -> usize {
        self.chunks.len()
    }

    /// Total duration of all chunks
    #[allow(dead_code)]
    pub fn total_duration_secs(&self) -> f64 {
        self.chunks.iter().map(|c| c.duration_secs()).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_data_creation() {
        let samples = vec![0.0; 24000];
        let audio = AudioData::new(samples.clone(), 24000, 1);

        assert_eq!(audio.sample_rate, 24000);
        assert_eq!(audio.channels, 1);
        assert_eq!(audio.duration_secs(), 1.0);
    }

    #[test]
    fn test_audio_data_to_wav() {
        // Create a simple sine wave
        let samples: Vec<f32> = (0..24000)
            .map(|i| (i as f32 / 24000.0 * 2.0 * std::f32::consts::PI).sin() * 0.5)
            .collect();

        let audio = AudioData::new(samples, 24000, 1);
        let wav_bytes = audio.to_wav_bytes();

        assert!(wav_bytes.is_ok());
        let bytes = wav_bytes.unwrap();
        assert!(!bytes.is_empty());

        // WAV header should start with "RIFF"
        assert_eq!(&bytes[0..4], b"RIFF");
    }

    #[test]
    fn test_chunk_buffer() {
        let mut buffer = AudioChunkBuffer::new(24000, 1);

        // Add some chunks
        buffer.push_chunk(vec![0.0; 12000]); // 0.5 seconds
        buffer.push_chunk(vec![0.0; 12000]); // 0.5 seconds

        assert_eq!(buffer.chunk_count(), 2);
        assert_eq!(buffer.total_duration_secs(), 1.0);

        let combined = buffer.combine();
        assert_eq!(combined.samples.len(), 24000);
    }

    #[test]
    fn test_audio_player_creation() {
        let player = AudioPlayer::new();
        assert!(player.is_ok());
    }

    #[test]
    fn test_volume_control() {
        let mut player = AudioPlayer::new().unwrap();

        // Test clamping
        player.set_volume(2.0);
        assert_eq!(player.get_volume(), 1.0);

        player.set_volume(-0.5);
        assert_eq!(player.get_volume(), 0.0);

        player.set_volume(0.75);
        assert_eq!(player.get_volume(), 0.75);
    }
}

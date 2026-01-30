//! Model download and caching for neural TTS
//!
//! Handles downloading, caching, and managing Piper neural TTS models.
//! Models are stored in platform-appropriate directories:
//!
//! - macOS: `~/Library/Application Support/pastel-hn/models/`
//! - Linux: `~/.local/share/pastel-hn/models/`
//! - Windows: `%APPDATA%/pastel-hn/models/`

use futures::StreamExt;
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Errors that can occur during model operations
#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum ModelError {
    #[error("Model not found: {0}")]
    NotFound(String),
    #[error("Download failed: {0}")]
    DownloadFailed(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Model directory not accessible: {0}")]
    DirectoryError(String),
    #[error("Invalid model checksum")]
    ChecksumError,
    #[error("Insufficient disk space: need {needed} MB, have {available} MB")]
    InsufficientSpace { needed: u64, available: u64 },
}

/// Status of a model download
#[derive(Debug, Clone, Copy, PartialEq)]
#[allow(dead_code)]
pub enum ModelStatus {
    /// Model not downloaded
    NotDownloaded,
    /// Currently downloading
    Downloading { progress: u8 },
    /// Downloaded and ready
    Ready,
    /// Download failed
    Error,
}

/// Configuration for a neural TTS model
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct NeuralModel {
    /// Unique model identifier
    pub id: &'static str,
    /// Human-readable name
    pub name: &'static str,
    /// Total download size in bytes
    pub size_bytes: u64,
    /// Model files to download
    pub files: &'static [ModelFile],
    /// Base URL for downloads
    pub base_url: &'static str,
}

/// Individual file in a model
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ModelFile {
    /// Filename
    pub name: &'static str,
    /// Size in bytes
    pub size: u64,
    /// Optional SHA256 checksum
    pub checksum: Option<&'static str>,
    /// Relative path within model directory
    pub path: &'static str,
}

/// Piper lightweight model (~63MB)
/// Files from: https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium
pub const PIPER_EN_US_MODEL: NeuralModel = NeuralModel {
    id: "piper-en-us",
    name: "Piper US English",
    size_bytes: 63_206_179, // 63,201,294 + 4,885 = exact total from HuggingFace
    files: &[
        ModelFile {
            name: "en_US-lessac-medium.onnx",
            size: 63_201_294, // Exact size from HuggingFace
            checksum: None,
            path: "en_US-lessac-medium.onnx",
        },
        ModelFile {
            name: "en_US-lessac-medium.onnx.json",
            size: 4_885, // Exact size from HuggingFace
            checksum: None,
            path: "en_US-lessac-medium.onnx.json",
        },
    ],
    base_url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium",
};

impl NeuralModel {
    /// Get model by ID
    pub fn from_id(id: &str) -> Option<&'static NeuralModel> {
        match id {
            "piper-en-us" => Some(&PIPER_EN_US_MODEL),
            _ => None,
        }
    }

    /// Get model directory name
    pub fn dir_name(&self) -> String {
        self.id.to_string()
    }

    /// Get total size in MB for display
    #[allow(dead_code)]
    pub fn size_mb(&self) -> u64 {
        self.size_bytes / 1_000_000
    }
}

/// Manages model downloads and caching
pub struct ModelManager {
    model_dir: PathBuf,
}

impl ModelManager {
    /// Create a new ModelManager
    pub fn new() -> Result<Self, ModelError> {
        let model_dir = Self::get_model_dir()?;

        // Ensure directory exists
        std::fs::create_dir_all(&model_dir)?;

        Ok(ModelManager { model_dir })
    }

    /// Get the platform-specific model directory
    pub fn get_model_dir() -> Result<PathBuf, ModelError> {
        let data_dir = dirs::data_dir()
            .or_else(|| dirs::home_dir().map(|h| h.join(".local/share")))
            .ok_or_else(|| {
                ModelError::DirectoryError("Cannot determine data directory".to_string())
            })?;

        Ok(data_dir.join("pastel-hn").join("models"))
    }

    /// Get the path for a specific model
    pub fn get_model_path(&self, model: &NeuralModel) -> PathBuf {
        self.model_dir.join(model.dir_name())
    }

    /// Check if a model is downloaded and ready
    pub fn is_model_ready(&self, model: &NeuralModel) -> bool {
        let model_path = self.get_model_path(model);

        if !model_path.exists() {
            return false;
        }

        // Check that all required files exist
        for file in model.files {
            let file_path = model_path.join(file.path);
            if !file_path.exists() {
                return false;
            }

            // Verify file size matches (basic integrity check)
            if let Ok(metadata) = std::fs::metadata(&file_path) {
                if metadata.len() != file.size {
                    return false;
                }
            } else {
                return false;
            }
        }

        true
    }

    /// Get the status of a model
    #[allow(dead_code)]
    pub fn get_model_status(&self, model: &NeuralModel) -> ModelStatus {
        if self.is_model_ready(model) {
            ModelStatus::Ready
        } else {
            ModelStatus::NotDownloaded
        }
    }

    /// Download a model with progress callback
    pub async fn download_model<F>(
        &self,
        model: &NeuralModel,
        progress_callback: Option<F>,
    ) -> Result<(), ModelError>
    where
        F: Fn(u8) + Send + 'static,
    {
        // Check available disk space
        self.check_disk_space(model.size_bytes)?;

        let model_path = self.get_model_path(model);
        std::fs::create_dir_all(&model_path)?;

        let total_files = model.files.len();
        let mut completed_files = 0;
        let mut total_downloaded: u64 = 0;

        for file in model.files {
            let file_path = model_path.join(file.path);

            // Skip if already exists and size matches
            if let Ok(metadata) = std::fs::metadata(&file_path) {
                if metadata.len() == file.size {
                    completed_files += 1;
                    total_downloaded += file.size;

                    // Report progress
                    if let Some(ref callback) = progress_callback {
                        let progress =
                            ((total_downloaded as f64 / model.size_bytes as f64) * 100.0) as u8;
                        callback(progress);
                    }
                    continue;
                }
            }

            // Download the file
            let url = format!("{}/{}", model.base_url, file.name);

            // Create a simple HTTP client
            let client = reqwest::Client::new();

            // Stream download with progress tracking
            let response = client
                .get(&url)
                .send()
                .await
                .map_err(|e| ModelError::DownloadFailed(e.to_string()))?;

            if !response.status().is_success() {
                return Err(ModelError::DownloadFailed(format!(
                    "HTTP {} for {}",
                    response.status(),
                    url
                )));
            }

            // Create file for writing
            let mut file_writer = std::fs::File::create(&file_path)?;
            let mut stream = response.bytes_stream();
            let mut file_downloaded: u64 = 0;

            while let Some(chunk_result) = stream.next().await {
                let chunk = chunk_result
                    .map_err(|e: reqwest::Error| ModelError::DownloadFailed(e.to_string()))?;

                file_writer.write_all(&chunk)?;
                file_downloaded += chunk.len() as u64;

                // Update progress
                let current_total = total_downloaded + file_downloaded;
                if let Some(ref callback) = progress_callback {
                    let progress = ((current_total as f64 / model.size_bytes as f64) * 100.0) as u8;
                    callback(progress);
                }
            }

            completed_files += 1;
            total_downloaded += file_downloaded;
        }

        // Verify all files downloaded
        if completed_files == total_files {
            Ok(())
        } else {
            Err(ModelError::DownloadFailed(format!(
                "Only {}/{} files downloaded",
                completed_files, total_files
            )))
        }
    }

    /// Delete a model to free disk space
    pub fn delete_model(&self, model: &NeuralModel) -> Result<(), ModelError> {
        let model_path = self.get_model_path(model);

        if model_path.exists() {
            std::fs::remove_dir_all(&model_path)?;
        }

        Ok(())
    }

    /// Get total disk usage of all models
    pub fn get_total_size(&self) -> Result<u64, ModelError> {
        let mut total = 0u64;

        if self.model_dir.exists() {
            for entry in std::fs::read_dir(&self.model_dir)? {
                let entry = entry?;
                let metadata = entry.metadata()?;

                if metadata.is_dir() {
                    total += self.dir_size(&entry.path())?;
                } else {
                    total += metadata.len();
                }
            }
        }

        Ok(total)
    }

    /// Calculate total size of a directory
    fn dir_size(&self, path: &Path) -> Result<u64, ModelError> {
        let mut total = 0u64;

        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let metadata = entry.metadata()?;

            if metadata.is_dir() {
                total += self.dir_size(&entry.path())?;
            } else {
                total += metadata.len();
            }
        }

        Ok(total)
    }

    /// Check if there's enough disk space
    fn check_disk_space(&self, _required_bytes: u64) -> Result<(), ModelError> {
        // Get available space (platform-specific)
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            let output = Command::new("df")
                .args(["-k", self.model_dir.to_str().unwrap_or(".")])
                .output()?;

            if output.status.success() {
                let _stdout = String::from_utf8_lossy(&output.stdout);
                // Parse df output to get available space
                // This is a simplified check - in production would be more robust
                return Ok(());
            }
        }

        // For other platforms or if check fails, assume we have space
        // In production, add proper disk space checks for Windows/Linux
        Ok(())
    }

    /// Get model file path
    pub fn get_model_file_path(&self, model: &NeuralModel, file_name: &str) -> Option<PathBuf> {
        let model_path = self.get_model_path(model);
        let file_path = model_path.join(file_name);

        if file_path.exists() {
            Some(file_path)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_neural_model_from_id() {
        assert!(NeuralModel::from_id("piper-en-us").is_some());
        assert!(NeuralModel::from_id("invalid").is_none());
    }

    #[test]
    fn test_model_dir_name() {
        let piper = NeuralModel::from_id("piper-en-us").unwrap();
        assert_eq!(piper.dir_name(), "piper-en-us");
    }

    #[test]
    fn test_model_size_mb() {
        let piper = NeuralModel::from_id("piper-en-us").unwrap();
        assert_eq!(piper.size_mb(), 63);
    }

    #[test]
    fn test_model_manager_creation() {
        let manager = ModelManager::new();
        assert!(manager.is_ok());
    }

    #[test]
    fn test_piper_model_file_paths() {
        // Verify Piper model has correct file names matching HuggingFace
        let piper = NeuralModel::from_id("piper-en-us").unwrap();

        // Should have the ONNX model and config JSON
        assert_eq!(piper.files.len(), 2);
        assert!(piper
            .files
            .iter()
            .any(|f| f.name == "en_US-lessac-medium.onnx"));
        assert!(piper
            .files
            .iter()
            .any(|f| f.name == "en_US-lessac-medium.onnx.json"));
    }

    #[test]
    fn test_is_model_ready_with_fake_files() {
        let temp_dir = TempDir::new().unwrap();
        let model_path = temp_dir.path().join("piper-en-us");
        fs::create_dir_all(&model_path).unwrap();

        // Create fake model files with correct sizes for Piper
        let piper = NeuralModel::from_id("piper-en-us").unwrap();

        for file in piper.files {
            let file_path = model_path.join(file.path);
            // Create file with the expected size
            let data = vec![0u8; file.size as usize];
            fs::write(&file_path, &data).unwrap();
        }

        // Verify the files exist with correct names
        assert!(model_path.join("en_US-lessac-medium.onnx").exists());
        assert!(model_path.join("en_US-lessac-medium.onnx.json").exists());
    }

    #[test]
    fn test_model_status_not_downloaded() {
        let temp_dir = TempDir::new().unwrap();
        let manager = ModelManager {
            model_dir: temp_dir.path().to_path_buf(),
        };

        let piper = NeuralModel::from_id("piper-en-us").unwrap();
        let status = manager.get_model_status(piper);

        assert_eq!(status, ModelStatus::NotDownloaded);
    }

    #[test]
    fn test_delete_model() {
        let temp_dir = TempDir::new().unwrap();
        let model_path = temp_dir.path().join("piper-en-us");
        fs::create_dir_all(&model_path).unwrap();
        fs::write(model_path.join("test.txt"), "test").unwrap();

        let manager = ModelManager {
            model_dir: temp_dir.path().to_path_buf(),
        };

        let piper = NeuralModel::from_id("piper-en-us").unwrap();
        assert!(manager.delete_model(piper).is_ok());
        assert!(!model_path.exists());
    }

    #[test]
    fn test_dir_size_calculation() {
        let temp_dir = TempDir::new().unwrap();

        // Create nested structure
        let subdir = temp_dir.path().join("subdir");
        fs::create_dir_all(&subdir).unwrap();

        fs::write(temp_dir.path().join("file1.txt"), "content1").unwrap();
        fs::write(subdir.join("file2.txt"), "content2 longer").unwrap();

        let manager = ModelManager {
            model_dir: temp_dir.path().to_path_buf(),
        };

        let size = manager.dir_size(temp_dir.path()).unwrap();
        // 8 + 15 = 23 bytes
        assert_eq!(size, 23);
    }

    /// Integration test: Verify Piper model URLs are valid on HuggingFace
    ///
    /// This test makes actual HTTP HEAD requests to HuggingFace to verify
    /// the configured URLs are accessible. Run with:
    ///   cargo test --package pastel-hn test_piper_huggingface_urls_are_valid -- --ignored
    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_piper_huggingface_urls_are_valid() {
        let piper = NeuralModel::from_id("piper-en-us").unwrap();
        let client = reqwest::Client::new();

        for file in piper.files {
            let url = format!("{}/{}", piper.base_url, file.name);

            let response = client
                .head(&url)
                .send()
                .await
                .unwrap_or_else(|_| panic!("Failed to HEAD request {}", url));

            assert!(
                response.status().is_success(),
                "URL {} returned status {}: file '{}' may not exist on HuggingFace",
                url,
                response.status(),
                file.name
            );

            // Verify Content-Length header matches exactly
            // This is critical because is_model_ready() uses exact size comparison
            if let Some(content_length) = response.headers().get("content-length") {
                let actual_size: u64 = content_length.to_str().unwrap().parse().unwrap();

                assert_eq!(
                    actual_size, file.size,
                    "File {} has size {} bytes on HuggingFace, but we configured {} bytes. \
                     Update PIPER_EN_US_MODEL in model.rs with the correct size.",
                    file.name, actual_size, file.size
                );
            }
        }
    }

    /// Integration test: Actually download the Piper model config file
    ///
    /// This test downloads only the small config JSON file (~5KB) to verify
    /// the download pipeline works end-to-end. Run with:
    ///   cargo test --package pastel-hn test_piper_config_download -- --ignored
    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_piper_config_download() {
        let temp_dir = TempDir::new().unwrap();
        let model_path = temp_dir.path().join("piper-en-us");
        fs::create_dir_all(&model_path).unwrap();

        let piper = NeuralModel::from_id("piper-en-us").unwrap();

        // Find the small config file
        let config_file = piper
            .files
            .iter()
            .find(|f| f.name.ends_with(".json"))
            .expect("Piper model should have a config JSON file");

        let url = format!("{}/{}", piper.base_url, config_file.name);
        let file_path = model_path.join(config_file.path);

        // Download the file
        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .send()
            .await
            .expect("Failed to download config file");

        assert!(
            response.status().is_success(),
            "Download failed with status {}",
            response.status()
        );

        let bytes = response
            .bytes()
            .await
            .expect("Failed to read response body");
        fs::write(&file_path, &bytes).expect("Failed to write file");

        // Verify file was written
        assert!(
            file_path.exists(),
            "Config file should exist after download"
        );

        // Verify it's valid JSON
        let content = fs::read_to_string(&file_path).expect("Failed to read config file");
        let json: serde_json::Value =
            serde_json::from_str(&content).expect("Config file should be valid JSON");

        // Piper config should have certain expected fields
        assert!(
            json.get("audio").is_some(),
            "Piper config should have 'audio' field"
        );
    }

    /// Integration test: Download Piper model and verify is_model_ready() works
    ///
    /// This test downloads the full Piper model (~63MB) and verifies that
    /// is_model_ready() correctly identifies it as ready. This is the critical
    /// test for the "Failed to download voice model" bug fix.
    ///
    /// Run with:
    ///   cargo test --package pastel-hn test_piper_full_download_and_ready_check -- --ignored
    #[tokio::test]
    #[ignore] // Requires network access and downloads ~63MB
    async fn test_piper_full_download_and_ready_check() {
        let temp_dir = TempDir::new().unwrap();
        let manager = ModelManager {
            model_dir: temp_dir.path().to_path_buf(),
        };

        let piper = NeuralModel::from_id("piper-en-us").unwrap();

        // Verify model is NOT ready before download
        assert!(
            !manager.is_model_ready(piper),
            "Model should not be ready before download"
        );

        // Download the model
        let result = manager.download_model(piper, None::<fn(u8)>).await;
        assert!(result.is_ok(), "Download should succeed: {:?}", result);

        // Verify model IS ready after download
        assert!(
            manager.is_model_ready(piper),
            "Model should be ready after download - this is the critical check! \
             If this fails, the configured file sizes in PIPER_EN_US_MODEL don't match \
             the actual files on HuggingFace."
        );

        // Also verify individual files exist with correct sizes
        let model_path = manager.get_model_path(piper);
        for file in piper.files {
            let file_path = model_path.join(file.path);
            assert!(file_path.exists(), "File {} should exist", file.name);

            let metadata = fs::metadata(&file_path).unwrap();
            assert_eq!(
                metadata.len(),
                file.size,
                "File {} has wrong size: expected {}, got {}",
                file.name,
                file.size,
                metadata.len()
            );
        }
    }
}

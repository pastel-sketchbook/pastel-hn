//! Tauri IPC commands for the HN API and Copilot AI assistant.
//!
//! This module defines all the `#[tauri::command]` functions that are callable
//! from the TypeScript frontend via `invoke()`.
//!
//! # HN API Commands
//!
//! | Command | Description |
//! |---------|-------------|
//! | [`fetch_stories`] | Paginated stories for a feed (top/new/best/ask/show/jobs) |
//! | [`fetch_item`] | Single item by ID |
//! | [`fetch_items`] | Multiple items by ID (batch) |
//! | [`fetch_story_with_comments`] | Story with nested comment tree |
//! | [`fetch_comment_children`] | Load more comments for a thread |
//! | [`fetch_user`] | User profile |
//! | [`fetch_user_submissions`] | User's submissions with filtering |
//! | [`search_hn`] | Full-text search via Algolia |
//! | [`fetch_article_content`] | Extract readable content from URL |
//!
//! # Cache Commands
//!
//! | Command | Description |
//! |---------|-------------|
//! | [`clear_cache`] | Clear all caches |
//! | [`clear_story_ids_cache`] | Clear feed cache (specific or all) |
//! | [`get_cache_stats`] | Get cache statistics |
//! | [`is_feed_stale`] | Check if feed needs refresh |
//! | [`background_refresh_feed`] | Trigger background refresh |
//!
//! # Copilot AI Commands
//!
//! | Command | Description |
//! |---------|-------------|
//! | [`copilot_check`] | Check if Copilot is available |
//! | [`copilot_init`] | Initialize the Copilot service |
//! | [`copilot_summarize`] | Summarize an article |
//! | [`copilot_analyze_discussion`] | Analyze a discussion thread |
//! | [`copilot_explain`] | Explain a term/concept |
//! | [`copilot_draft_reply`] | Help draft a reply |
//! | [`copilot_ask`] | General question |
//! | [`copilot_shutdown`] | Shutdown Copilot service |
//!
//! # TTS (Text-to-Speech) Commands
//!
//! | Command | Description |
//! |---------|-------------|
//! | [`tts_init`] | Initialize the TTS engine |
//! | [`tts_status`] | Get TTS status and capabilities |
//! | [`tts_speak`] | Speak text aloud |
//! | [`tts_stop`] | Stop current speech |
//! | [`tts_get_voices`] | List available voices |
//! | [`tts_set_voice`] | Set the active voice |
//! | [`tts_set_rate`] | Set speech rate |
//!
//! # Utility Commands
//!
//! | Command | Description |
//! |---------|-------------|
//! | [`open_external`] | Open URL in system browser |
//! | [`get_app_version`] | Get the app version |

use tauri::State;

use crate::client::SharedHnClient;
use crate::copilot::{
    self, AssistantResponse, CopilotStatus, DiscussionContext, ReplyContext, StoryContext,
};
use crate::tts::{self, TtsStatus, VoiceInfo};
use crate::types::{
    ApiError, ArticleContent, CacheStats, CommentWithChildren, HNItem, HNUser, SearchFilter,
    SearchResponse, SearchSort, StoriesResponse, StoryFeed, StoryWithComments, SubmissionFilter,
    SubmissionsResponse,
};

/// Fetch paginated stories for a feed.
///
/// # Arguments
///
/// * `feed` - Feed type: "top", "new", "best", "ask", "show", "jobs"
/// * `offset` - Starting index (0-based)
/// * `limit` - Maximum stories to return
///
/// # Returns
///
/// [`StoriesResponse`] with stories array, `has_more` flag, and `total` count.
#[tauri::command]
pub async fn fetch_stories(
    client: State<'_, SharedHnClient>,
    feed: StoryFeed,
    offset: usize,
    limit: usize,
) -> Result<StoriesResponse, ApiError> {
    client.fetch_stories_paginated(feed, offset, limit).await
}

/// Fetch a single HN item by ID.
///
/// Items include stories, comments, jobs, polls, and poll options.
#[tauri::command]
pub async fn fetch_item(client: State<'_, SharedHnClient>, id: u32) -> Result<HNItem, ApiError> {
    client.fetch_item(id).await
}

/// Fetch multiple items by ID in a single batch request.
///
/// More efficient than multiple [`fetch_item`] calls for loading many items.
/// Missing/deleted items are silently omitted from results.
#[tauri::command]
pub async fn fetch_items(
    client: State<'_, SharedHnClient>,
    ids: Vec<u32>,
) -> Result<Vec<HNItem>, ApiError> {
    client.fetch_items(&ids).await
}

/// Fetch a story with its full comment tree.
///
/// # Arguments
///
/// * `id` - Story ID
/// * `depth` - Maximum comment nesting depth (e.g., 3 for typical views)
#[tauri::command]
pub async fn fetch_story_with_comments(
    client: State<'_, SharedHnClient>,
    id: u32,
    depth: u8,
) -> Result<StoryWithComments, ApiError> {
    client.fetch_story_with_comments(id, depth).await
}

/// Fetch children of a specific comment for "load more" functionality.
///
/// Used when expanding a collapsed comment thread.
#[tauri::command]
pub async fn fetch_comment_children(
    client: State<'_, SharedHnClient>,
    id: u32,
    depth: u8,
) -> Result<Vec<CommentWithChildren>, ApiError> {
    client.fetch_comment_children(id, depth).await
}

/// Fetch a user profile by username.
#[tauri::command]
pub async fn fetch_user(client: State<'_, SharedHnClient>, id: String) -> Result<HNUser, ApiError> {
    client.fetch_user(&id).await
}

/// Fetch a user's submissions with pagination and type filtering.
///
/// # Arguments
///
/// * `user_id` - Username
/// * `offset` - Starting index
/// * `limit` - Maximum items to return
/// * `filter` - "all", "stories", or "comments"
#[tauri::command]
pub async fn fetch_user_submissions(
    client: State<'_, SharedHnClient>,
    user_id: String,
    offset: usize,
    limit: usize,
    filter: SubmissionFilter,
) -> Result<SubmissionsResponse, ApiError> {
    client
        .fetch_user_submissions(&user_id, offset, limit, filter)
        .await
}

/// Search HN using the Algolia Search API.
///
/// Provides full-text search across stories and comments.
///
/// # Arguments
///
/// * `query` - Search query
/// * `page` - Page number (0-indexed)
/// * `hits_per_page` - Results per page
/// * `sort` - "relevance" or "date"
/// * `filter` - "all", "story", or "comment"
#[tauri::command]
pub async fn search_hn(
    client: State<'_, SharedHnClient>,
    query: String,
    page: u32,
    hits_per_page: u32,
    sort: SearchSort,
    filter: SearchFilter,
) -> Result<SearchResponse, ApiError> {
    client
        .search(&query, page, hits_per_page, sort, filter)
        .await
}

/// Clear all caches (items, story IDs, users).
///
/// Forces fresh data on subsequent requests.
#[tauri::command]
pub fn clear_cache(client: State<'_, SharedHnClient>) {
    client.clear_cache();
}

/// Get current cache statistics.
///
/// Returns entry counts and TTL values for all caches.
#[tauri::command]
pub fn get_cache_stats(client: State<'_, SharedHnClient>) -> CacheStats {
    client.get_cache_stats()
}

/// Clear story IDs cache for a specific feed or all feeds.
///
/// # Arguments
///
/// * `feed` - Specific feed to clear, or `null` to clear all
#[tauri::command]
pub async fn clear_story_ids_cache(
    client: State<'_, SharedHnClient>,
    feed: Option<StoryFeed>,
) -> Result<(), ApiError> {
    client.clear_story_ids_cache(feed).await;
    Ok(())
}

/// Check if a feed's cached data is stale.
///
/// Returns `true` if the data is older than 75% of its TTL.
#[tauri::command]
pub async fn is_feed_stale(
    client: State<'_, SharedHnClient>,
    feed: StoryFeed,
) -> Result<bool, ApiError> {
    Ok(client.is_feed_stale(&feed).await)
}

/// Trigger a background refresh for a feed.
///
/// Fetches fresh data and returns the new story IDs if the data changed.
///
/// # Returns
///
/// * `Some(ids)` - New story IDs if data changed
/// * `None` - Data unchanged or refresh failed
#[tauri::command]
pub async fn background_refresh_feed(
    client: State<'_, SharedHnClient>,
    feed: StoryFeed,
) -> Result<Option<Vec<u32>>, ApiError> {
    Ok(client.background_refresh_feed(feed).await)
}

/// Extract readable article content from an external URL.
///
/// Uses readability algorithms to extract the main content,
/// removing navigation, ads, and other non-content elements.
#[tauri::command]
pub async fn fetch_article_content(
    client: State<'_, SharedHnClient>,
    url: String,
) -> Result<ArticleContent, ApiError> {
    client.fetch_article_content(&url).await
}

/// Open a URL in the system's default browser.
///
/// Used for opening article links, user profiles on HN, etc.
#[tauri::command]
pub fn open_external(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

/// Get the application version from Cargo.toml.
#[tauri::command]
pub const fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ============================================================================
// Copilot AI Assistant Commands
//
// These commands integrate with GitHub Copilot CLI to provide AI-powered
// features like article summarization and discussion analysis.
// ============================================================================

/// Check Copilot availability (CLI installed and authenticated).
///
/// Call this on app startup to determine if AI features should be shown.
#[tauri::command]
pub async fn copilot_check() -> CopilotStatus {
    copilot::get_status().await
}

/// Initialize the Copilot service.
///
/// Must be called before using other Copilot commands.
/// Returns status including whether initialization succeeded.
#[tauri::command]
pub async fn copilot_init() -> Result<CopilotStatus, String> {
    copilot::init().await.map_err(|e| e.to_string())
}

/// Generate an AI summary of an article based on story context.
///
/// Works even without article content by using title, URL, and metadata.
#[tauri::command]
pub async fn copilot_summarize(context: StoryContext) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .summarize_article(context)
        .await
        .map_err(|e| e.to_string())
}

/// Analyze a discussion thread for key themes and viewpoints.
///
/// Provides a summary of the main perspectives in a comment thread.
#[tauri::command]
pub async fn copilot_analyze_discussion(
    context: DiscussionContext,
) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .analyze_discussion(context)
        .await
        .map_err(|e| e.to_string())
}

/// Explain a technical term or concept.
///
/// # Arguments
///
/// * `text` - The term/concept to explain
/// * `context` - Optional surrounding context for better explanation
#[tauri::command]
pub async fn copilot_explain(
    text: String,
    context: Option<String>,
) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .explain(&text, context.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Help draft a thoughtful reply to a comment.
///
/// Can improve an existing draft or suggest new angles for response.
#[tauri::command]
pub async fn copilot_draft_reply(context: ReplyContext) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .draft_reply(context)
        .await
        .map_err(|e| e.to_string())
}

/// Ask a general question to the AI assistant.
///
/// Free-form prompt for questions that don't fit other categories.
#[tauri::command]
pub async fn copilot_ask(prompt: String) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .ask_question(&prompt)
        .await
        .map_err(|e| e.to_string())
}

/// Shutdown the Copilot service gracefully.
///
/// Call this when the app is closing to clean up resources.
#[tauri::command]
pub async fn copilot_shutdown() -> Result<(), String> {
    copilot::shutdown().await.map_err(|e| e.to_string())
}

// ============================================================================
// TTS (Text-to-Speech) Commands
//
// These commands provide native text-to-speech functionality using the
// operating system's built-in speech synthesis (free, works offline).
// ============================================================================

/// Initialize the TTS engine.
///
/// Must be called before using other TTS commands.
#[tauri::command]
pub fn tts_init() -> Result<(), String> {
    tts::init()
}

/// Get TTS status and capabilities.
///
/// Returns availability, current state, and supported features.
#[tauri::command]
pub fn tts_status() -> TtsStatus {
    tts::get_status()
}

/// Speak the given text aloud.
///
/// # Arguments
///
/// * `text` - Text to speak
/// * `interrupt` - If true, stops any current speech first
#[tauri::command]
pub fn tts_speak(text: String, interrupt: bool) -> Result<(), String> {
    tts::speak(&text, interrupt)?;
    Ok(())
}

/// Stop any current speech.
#[tauri::command]
pub fn tts_stop() -> Result<(), String> {
    tts::stop()
}

/// Get list of available voices.
///
/// Returns voice information including ID, name, and language.
#[tauri::command]
pub fn tts_get_voices() -> Result<Vec<VoiceInfo>, String> {
    tts::get_voices()
}

/// Set the active voice by ID.
///
/// Voice IDs can be obtained from [`tts_get_voices`].
#[tauri::command]
pub fn tts_set_voice(voice_id: String) -> Result<(), String> {
    tts::set_voice(&voice_id)
}

/// Set the speech rate.
///
/// Rate is normalized to 0.0-1.0 where 0.5 is normal speed.
/// Lower values are slower, higher values are faster.
#[tauri::command]
pub fn tts_set_rate(rate: f32) -> Result<(), String> {
    tts::set_rate(rate)
}

// ============================================================================
// Neural TTS Commands (Piper + ONNX Runtime)
//
// These commands provide high-quality neural voice synthesis as described
// in ADR-0008. They complement the native TTS commands above.
// ============================================================================

/// Initialize the neural TTS engine.
///
/// Prepares the engine but doesn't download models yet.
/// Call `tts_neural_status` to check if models are available.
#[tauri::command]
pub async fn tts_neural_init() -> Result<(), String> {
    crate::tts::neural::init_neural().await
}

/// Get neural TTS status.
///
/// Returns whether the neural model is downloaded and ready,
/// current voice, download progress, and available voices.
#[tauri::command]
pub async fn tts_neural_status() -> crate::tts::neural::NeuralTtsStatus {
    crate::tts::neural::get_status().await
}

/// Get list of available neural voices.
///
/// These are high-quality neural voices (Piper) that can be
/// downloaded and used for synthesis.
#[tauri::command]
pub fn tts_neural_voices() -> Vec<crate::tts::neural::NeuralVoiceInfo> {
    crate::tts::neural::list_neural_voices()
}

/// Download a neural voice model.
///
/// # Arguments
///
/// * `model_id` - Model to download (e.g., "piper-en-us")
///
/// This is an async operation that can take a minute depending
/// on the model size (~63MB for Piper).
/// Check status with `tts_neural_status` for download progress.
#[tauri::command]
pub async fn tts_download_model(model_id: String) -> Result<(), String> {
    // Create a progress callback that emits events
    let progress_callback = move |progress: u8| {
        // In production, would emit Tauri event for frontend progress
        tracing::info!("Model download progress: {}%", progress);
    };

    crate::tts::neural::download_model(&model_id, Some(progress_callback)).await
}

/// Check if a model is ready for use.
///
/// Returns true if the model files are downloaded and valid.
#[tauri::command]
pub fn tts_is_model_ready(model_id: String) -> Result<bool, String> {
    crate::tts::neural::is_model_ready(&model_id)
}

/// Speak text using neural TTS.
///
/// Falls back to native TTS if neural TTS is unavailable.
///
/// # Arguments
///
/// * `text` - Text to synthesize
/// * `voice_id` - Optional voice ID (uses default if not specified)
/// * `rate` - Speech rate from 0.5 to 2.0 (1.0 is normal)
#[tauri::command]
pub async fn tts_neural_speak(
    text: String,
    voice_id: Option<String>,
    rate: Option<f32>,
) -> Result<(), String> {
    crate::tts::neural::speak(&text, voice_id.as_deref(), rate).await
}

/// Stop neural TTS playback.
#[tauri::command]
pub async fn tts_neural_stop() -> Result<(), String> {
    crate::tts::neural::stop().await
}

/// Speak sentences one-by-one with progress events.
///
/// This command processes each sentence individually, emitting `tts-sentence`
/// events to the frontend when each sentence starts and ends. This enables
/// the UI to highlight the currently spoken sentence.
///
/// # Arguments
///
/// * `sentences` - Array of sentences to speak
/// * `voice_id` - Optional voice ID (uses default if not specified)
/// * `rate` - Speech rate from 0.5 to 2.0 (1.0 is normal)
///
/// # Events
///
/// Emits `tts-sentence` events with payloads:
/// - `{ type: "start", index: number, text: string }` - Sentence started
/// - `{ type: "end", index: number }` - Sentence finished
/// - `{ type: "finished" }` - All sentences done
/// - `{ type: "stopped" }` - Playback was stopped
#[tauri::command]
pub async fn tts_neural_speak_sentences(
    app_handle: tauri::AppHandle,
    sentences: Vec<String>,
    voice_id: Option<String>,
    rate: Option<f32>,
) -> Result<(), String> {
    crate::tts::neural::speak_sentences(sentences, voice_id.as_deref(), rate, app_handle).await
}

/// Get the neural TTS model directory path.
///
/// Returns the platform-specific path where models are stored.
#[tauri::command]
pub fn tts_model_directory() -> Result<String, String> {
    let path = crate::tts::neural::get_model_dir()?;
    Ok(path.to_string_lossy().to_string())
}

/// Get disk usage for neural TTS models.
///
/// Returns total bytes used by downloaded models.
#[tauri::command]
pub fn tts_model_disk_usage() -> Result<u64, String> {
    crate::tts::neural::get_model_disk_usage()
}

/// Delete a neural TTS model to free disk space.
///
/// # Arguments
///
/// * `model_id` - Model to delete (e.g., "piper-en-us")
#[tauri::command]
pub fn tts_delete_model(model_id: String) -> Result<(), String> {
    crate::tts::neural::delete_model(&model_id)
}

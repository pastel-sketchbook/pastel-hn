//! Tauri commands for HN API and Copilot assistant

use tauri::State;

use crate::client::SharedHnClient;
use crate::copilot::{
    self, AssistantResponse, CopilotStatus, DiscussionContext, ReplyContext, StoryContext,
};
use crate::types::{
    ApiError, ArticleContent, CacheStats, CommentWithChildren, HNItem, HNUser, SearchFilter,
    SearchResponse, SearchSort, StoriesResponse, StoryFeed, StoryWithComments, SubmissionFilter,
    SubmissionsResponse,
};

/// Fetch paginated stories for a feed
#[tauri::command]
pub async fn fetch_stories(
    client: State<'_, SharedHnClient>,
    feed: StoryFeed,
    offset: usize,
    limit: usize,
) -> Result<StoriesResponse, ApiError> {
    client.fetch_stories_paginated(feed, offset, limit).await
}

/// Fetch a single item by ID
#[tauri::command]
pub async fn fetch_item(client: State<'_, SharedHnClient>, id: u32) -> Result<HNItem, ApiError> {
    client.fetch_item(id).await
}

/// Fetch multiple items by IDs
#[tauri::command]
pub async fn fetch_items(
    client: State<'_, SharedHnClient>,
    ids: Vec<u32>,
) -> Result<Vec<HNItem>, ApiError> {
    client.fetch_items(&ids).await
}

/// Fetch a story with its comments
#[tauri::command]
pub async fn fetch_story_with_comments(
    client: State<'_, SharedHnClient>,
    id: u32,
    depth: u8,
) -> Result<StoryWithComments, ApiError> {
    client.fetch_story_with_comments(id, depth).await
}

/// Fetch children of a specific comment (for "load more")
#[tauri::command]
pub async fn fetch_comment_children(
    client: State<'_, SharedHnClient>,
    id: u32,
    depth: u8,
) -> Result<Vec<CommentWithChildren>, ApiError> {
    client.fetch_comment_children(id, depth).await
}

/// Fetch a user by ID
#[tauri::command]
pub async fn fetch_user(client: State<'_, SharedHnClient>, id: String) -> Result<HNUser, ApiError> {
    client.fetch_user(&id).await
}

/// Fetch user submissions with pagination and filtering
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

/// Search HN using Algolia
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

/// Clear all caches
#[tauri::command]
pub fn clear_cache(client: State<'_, SharedHnClient>) {
    client.clear_cache();
}

/// Get cache statistics
#[tauri::command]
pub fn get_cache_stats(client: State<'_, SharedHnClient>) -> CacheStats {
    client.get_cache_stats()
}

/// Clear story IDs cache for a specific feed or all feeds
#[tauri::command]
pub async fn clear_story_ids_cache(
    client: State<'_, SharedHnClient>,
    feed: Option<StoryFeed>,
) -> Result<(), ApiError> {
    client.clear_story_ids_cache(feed).await;
    Ok(())
}

/// Check if a feed's cached data is stale
#[tauri::command]
pub async fn is_feed_stale(
    client: State<'_, SharedHnClient>,
    feed: StoryFeed,
) -> Result<bool, ApiError> {
    Ok(client.is_feed_stale(&feed).await)
}

/// Perform background refresh for a feed
/// Returns the new story IDs if data changed, null otherwise
#[tauri::command]
pub async fn background_refresh_feed(
    client: State<'_, SharedHnClient>,
    feed: StoryFeed,
) -> Result<Option<Vec<u32>>, ApiError> {
    Ok(client.background_refresh_feed(feed).await)
}

/// Fetch and extract article content from an external URL
#[tauri::command]
pub async fn fetch_article_content(
    client: State<'_, SharedHnClient>,
    url: String,
) -> Result<ArticleContent, ApiError> {
    client.fetch_article_content(&url).await
}

/// Open a URL in the system browser
#[tauri::command]
pub fn open_external(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

/// Get the app version
#[tauri::command]
pub const fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

// ============================================================================
// Copilot AI Assistant Commands
// ============================================================================

/// Check if Copilot is available (CLI installed and authenticated)
#[tauri::command]
pub async fn copilot_check() -> CopilotStatus {
    copilot::get_status().await
}

/// Initialize the Copilot service
#[tauri::command]
pub async fn copilot_init() -> Result<CopilotStatus, String> {
    copilot::init().await.map_err(|e| e.to_string())
}

/// Summarize an article based on story context
#[tauri::command]
pub async fn copilot_summarize(context: StoryContext) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .summarize_article(context)
        .await
        .map_err(|e| e.to_string())
}

/// Analyze a discussion thread
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

/// Explain a term or concept
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

/// Help draft a reply to a comment
#[tauri::command]
pub async fn copilot_draft_reply(context: ReplyContext) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .draft_reply(context)
        .await
        .map_err(|e| e.to_string())
}

/// Ask a general question
#[tauri::command]
pub async fn copilot_ask(prompt: String) -> Result<AssistantResponse, String> {
    let service = copilot::get_service();
    service
        .ask_question(&prompt)
        .await
        .map_err(|e| e.to_string())
}

/// Shutdown the Copilot service
#[tauri::command]
pub async fn copilot_shutdown() -> Result<(), String> {
    copilot::shutdown().await.map_err(|e| e.to_string())
}

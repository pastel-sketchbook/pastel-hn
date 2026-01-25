//! Tauri commands for HN API

use tauri::State;

use crate::client::SharedHnClient;
use crate::types::*;

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
pub async fn fetch_item(
    client: State<'_, SharedHnClient>,
    id: u32,
) -> Result<HNItem, ApiError> {
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
pub async fn fetch_user(
    client: State<'_, SharedHnClient>,
    id: String,
) -> Result<HNUser, ApiError> {
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

/// Clear story IDs cache for a specific feed or all feeds
#[tauri::command]
pub async fn clear_story_ids_cache(
    client: State<'_, SharedHnClient>,
    feed: Option<StoryFeed>,
) -> Result<(), ApiError> {
    client.clear_story_ids_cache(feed).await;
    Ok(())
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

//! HN API client with intelligent caching and background refresh.
//!
//! This module provides [`HnClient`], the core data layer for pastel-hn. It handles:
//!
//! - **Story Feeds**: Fetching top/new/best/ask/show/jobs stories with pagination
//! - **Items**: Stories, comments, jobs, polls - all cached with configurable TTL
//! - **Users**: User profiles with submission history
//! - **Search**: Full-text search via the Algolia HN Search API
//! - **Article Extraction**: Readability-based content extraction for reader mode
//!
//! # Caching Strategy
//!
//! The client uses [moka] for high-performance concurrent caching:
//!
//! | Cache | TTL | Max Entries | Purpose |
//! |-------|-----|-------------|---------|
//! | Items | 5 min | 10,000 | Stories, comments, etc. |
//! | Story IDs | 2 min | 10 | Feed listings (per feed type) |
//! | Users | 10 min | 100 | User profiles |
//!
//! # Background Refresh (Stale-While-Revalidate)
//!
//! When cached data reaches 75% of its TTL, the client returns the cached data
//! immediately but triggers a background refresh. This ensures:
//!
//! - Users always get instant responses (no blocking on network)
//! - Data stays relatively fresh without manual refresh
//! - Network requests are batched efficiently
//!
//! # Example
//!
//! ```ignore
//! use crate::client::{create_client, StoryFeed};
//!
//! let client = create_client();
//!
//! // Fetch top stories (cached if available)
//! let response = client.fetch_stories_paginated(StoryFeed::Top, 0, 30).await?;
//!
//! // Fetch a single item
//! let story = client.fetch_item(12345).await?;
//!
//! // Search via Algolia
//! let results = client.search("rust", 0, 20, SearchSort::Relevance, SearchFilter::Story).await?;
//! ```
//!
//! # Error Handling
//!
//! All fallible operations return `Result<T, ApiError>`. The client handles:
//!
//! - Network failures (timeouts, connection errors)
//! - Rate limiting (429 responses with retry-after)
//! - Missing items (deleted or never existed)
//! - Invalid responses (parse errors)

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use moka::future::Cache;
use reqwest::Client;
use tokio::sync::RwLock;
use tracing::{debug, info, instrument, warn};

use crate::types::*;

/// Base URL for the official HN Firebase API.
const HN_BASE_URL: &str = "https://hacker-news.firebaseio.com/v0";

/// Base URL for the Algolia HN Search API (faster, full-text search).
const ALGOLIA_BASE_URL: &str = "https://hn.algolia.com/api/v1";

/// TTL for individual items (stories, comments, etc.) - 5 minutes.
const ITEM_CACHE_TTL: Duration = Duration::from_secs(5 * 60);

/// TTL for story ID lists (feed listings) - 2 minutes (shorter for fresher feeds).
const STORY_IDS_CACHE_TTL: Duration = Duration::from_secs(2 * 60);

/// TTL for user profiles - 10 minutes (user data changes less frequently).
const USER_CACHE_TTL: Duration = Duration::from_secs(10 * 60);

/// Staleness threshold as percentage of TTL.
///
/// When cached data is older than this percentage of its TTL, a background
/// refresh is triggered while returning the cached data immediately.
const STALE_THRESHOLD_PERCENT: u64 = 75;

/// Check HTTP response for rate limiting and other errors.
///
/// Returns `Err(ApiError::RateLimited)` if the server returns 429,
/// extracting the retry-after duration from headers when available.
fn check_response_status(response: &reqwest::Response) -> Result<(), ApiError> {
    let status = response.status();

    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        // Try to get retry-after header, default to 60 seconds
        let retry_after = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(60);

        warn!(retry_after = retry_after, "Rate limited by API");
        return Err(ApiError::RateLimited(retry_after));
    }

    Ok(())
}

/// Tracks staleness and refresh state for background refresh logic.
///
/// This struct maintains per-feed timestamps and prevents duplicate
/// background refresh requests for the same feed.
#[derive(Debug, Default)]
struct RefreshTracker {
    /// Timestamp of last successful fetch for each feed.
    last_fetch: HashMap<StoryFeed, Instant>,
    /// Feeds currently being refreshed (prevents duplicate requests).
    refreshing: std::collections::HashSet<StoryFeed>,
}

impl RefreshTracker {
    fn new() -> Self {
        Self::default()
    }

    /// Record that a feed was just fetched
    fn mark_fetched(&mut self, feed: StoryFeed) {
        self.last_fetch.insert(feed, Instant::now());
        self.refreshing.remove(&feed);
    }

    /// Check if a feed's data is stale (past the threshold but not yet expired)
    fn is_stale(&self, feed: &StoryFeed, ttl: Duration) -> bool {
        if let Some(last) = self.last_fetch.get(feed) {
            let age = last.elapsed();
            let stale_threshold = ttl * STALE_THRESHOLD_PERCENT as u32 / 100;
            age >= stale_threshold && age < ttl
        } else {
            false
        }
    }

    /// Check if a background refresh is already in progress for this feed
    fn is_refreshing(&self, feed: &StoryFeed) -> bool {
        self.refreshing.contains(feed)
    }

    /// Mark that a background refresh is starting
    fn start_refresh(&mut self, feed: StoryFeed) {
        self.refreshing.insert(feed);
    }
}

/// HN API client with built-in caching, background refresh, and connection pooling.
///
/// This is the main interface for fetching HN data. It handles:
///
/// - Transparent caching with configurable TTL
/// - Stale-while-revalidate pattern for background refresh
/// - Concurrent item fetching with connection pooling
/// - Rate limit detection and reporting
///
/// # Thread Safety
///
/// `HnClient` is safe to share across threads. Wrap it in [`Arc`] for multi-threaded
/// use (see [`SharedHnClient`] and [`create_client`]).
///
/// # Caches
///
/// - **item_cache**: Individual HN items (stories, comments, jobs, polls)
/// - **story_ids_cache**: Story ID lists for each feed type
/// - **user_cache**: User profiles
pub struct HnClient {
    http: Client,
    item_cache: Cache<u32, HNItem>,
    story_ids_cache: Cache<StoryFeed, Vec<u32>>,
    user_cache: Cache<String, HNUser>,
    refresh_tracker: RwLock<RefreshTracker>,
}

impl HnClient {
    /// Create a new HN client with default settings.
    ///
    /// Configures:
    /// - HTTP client with 30s timeout, 10s connect timeout, connection pooling
    /// - Item cache: 10,000 entries, 5 min TTL
    /// - Story IDs cache: 10 entries, 2 min TTL
    /// - User cache: 100 entries, 10 min TTL
    pub fn new() -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .connect_timeout(Duration::from_secs(10))
            .pool_max_idle_per_host(10)
            .user_agent("pastel-hn/0.3")
            .build()
            .expect("Failed to create HTTP client");

        let item_cache = Cache::builder()
            .max_capacity(10_000)
            .time_to_live(ITEM_CACHE_TTL)
            .build();

        let story_ids_cache = Cache::builder()
            .max_capacity(10)
            .time_to_live(STORY_IDS_CACHE_TTL)
            .build();

        let user_cache = Cache::builder()
            .max_capacity(100)
            .time_to_live(USER_CACHE_TTL)
            .build();

        Self {
            http,
            item_cache,
            story_ids_cache,
            user_cache,
            refresh_tracker: RwLock::new(RefreshTracker::new()),
        }
    }

    /// Fetch story IDs for a given feed, returning cached data when available.
    ///
    /// If cached data exists but is stale (>75% of TTL), this method returns
    /// the cached data immediately and triggers a background refresh.
    ///
    /// # Arguments
    ///
    /// * `feed` - The feed type (Top, New, Best, Ask, Show, Jobs)
    ///
    /// # Returns
    ///
    /// A vector of story IDs, newest first (for New feed) or ranked (for others).
    #[instrument(skip(self))]
    pub async fn fetch_story_ids(&self, feed: StoryFeed) -> Result<Vec<u32>, ApiError> {
        // Check cache first
        if let Some(ids) = self.story_ids_cache.get(&feed).await {
            debug!(feed = ?feed, count = ids.len(), "Cache hit for story IDs");

            // Check if data is stale and trigger background refresh
            let should_refresh = {
                let tracker = self.refresh_tracker.read().await;
                tracker.is_stale(&feed, STORY_IDS_CACHE_TTL) && !tracker.is_refreshing(&feed)
            };

            if should_refresh {
                self.refresh_tracker.write().await.start_refresh(feed);
                debug!(feed = ?feed, "Data is stale, triggering background refresh");
            }

            return Ok(ids);
        }

        // Not in cache, fetch fresh
        self.fetch_story_ids_fresh(feed).await
    }

    /// Fetch story IDs directly from the HN API, bypassing cache.
    ///
    /// Used for initial fetches and background refresh operations.
    /// Updates both the cache and the refresh tracker on success.
    #[instrument(skip(self))]
    async fn fetch_story_ids_fresh(&self, feed: StoryFeed) -> Result<Vec<u32>, ApiError> {
        let url = format!("{}/{}.json", HN_BASE_URL, feed.endpoint());
        info!(url = %url, "Fetching story IDs");

        let response = self.http.get(&url).send().await?;
        check_response_status(&response)?;

        let ids: Vec<u32> = response.json().await?;

        debug!(feed = ?feed, count = ids.len(), "Fetched story IDs");
        self.story_ids_cache.insert(feed, ids.clone()).await;

        // Update refresh tracker
        self.refresh_tracker.write().await.mark_fetched(feed);

        Ok(ids)
    }

    /// Perform a background refresh for a feed.
    ///
    /// This is called when cached data is stale. It fetches fresh data and
    /// compares it with the cached version.
    ///
    /// # Returns
    ///
    /// - `Some(new_ids)` if the data changed (for UI update notification)
    /// - `None` if the data is unchanged or the refresh failed
    #[instrument(skip(self))]
    pub async fn background_refresh_feed(&self, feed: StoryFeed) -> Option<Vec<u32>> {
        // Get current cached IDs for comparison
        let old_ids = self.story_ids_cache.get(&feed).await;

        // Fetch fresh data
        match self.fetch_story_ids_fresh(feed).await {
            Ok(new_ids) => {
                // Check if data actually changed
                let changed = match old_ids {
                    Some(old) => old != new_ids,
                    None => true,
                };

                if changed {
                    info!(feed = ?feed, "Background refresh found new data");
                    Some(new_ids)
                } else {
                    debug!(feed = ?feed, "Background refresh: no new data");
                    None
                }
            }
            Err(e) => {
                warn!(feed = ?feed, error = %e, "Background refresh failed");
                // Clear refreshing flag on error
                self.refresh_tracker.write().await.refreshing.remove(&feed);
                None
            }
        }
    }

    /// Check if a feed's cached data is stale and should be refreshed.
    ///
    /// Returns `true` if the data is older than 75% of its TTL and no
    /// background refresh is currently in progress.
    pub async fn is_feed_stale(&self, feed: &StoryFeed) -> bool {
        let tracker = self.refresh_tracker.read().await;
        tracker.is_stale(feed, STORY_IDS_CACHE_TTL) && !tracker.is_refreshing(feed)
    }

    /// Fetch a single HN item by ID.
    ///
    /// Items are cached for 5 minutes. Returns cached data if available.
    ///
    /// # Errors
    ///
    /// - `ApiError::NotFound` if the item doesn't exist or was deleted
    /// - `ApiError::Request` on network failure
    #[instrument(skip(self))]
    pub async fn fetch_item(&self, id: u32) -> Result<HNItem, ApiError> {
        // Check cache first
        if let Some(item) = self.item_cache.get(&id).await {
            debug!(id = id, "Cache hit for item");
            return Ok(item);
        }

        let url = format!("{}/item/{}.json", HN_BASE_URL, id);
        debug!(url = %url, "Fetching item");

        let response = self.http.get(&url).send().await?;
        check_response_status(&response)?;

        if !response.status().is_success() {
            return Err(ApiError::NotFound(id));
        }

        let raw: Option<RawHNItem> = response.json().await?;
        let raw = raw.ok_or(ApiError::NotFound(id))?;
        let item: HNItem = raw.into();

        self.item_cache.insert(id, item.clone()).await;

        Ok(item)
    }

    /// Fetch multiple items concurrently.
    ///
    /// Uses `futures::join_all` to fetch items in parallel, leveraging
    /// HTTP connection pooling for efficiency.
    ///
    /// Missing/deleted items are silently skipped (not included in results).
    #[instrument(skip(self, ids))]
    pub async fn fetch_items(&self, ids: &[u32]) -> Result<Vec<HNItem>, ApiError> {
        let futures: Vec<_> = ids.iter().map(|&id| self.fetch_item(id)).collect();

        let results = futures::future::join_all(futures).await;

        let mut items = Vec::with_capacity(ids.len());
        for result in results {
            match result {
                Ok(item) => items.push(item),
                Err(ApiError::NotFound(_)) => {
                    // Skip deleted/missing items
                    debug!("Skipping missing item");
                }
                Err(e) => return Err(e),
            }
        }

        Ok(items)
    }

    /// Fetch paginated stories for a feed.
    ///
    /// This is the main method for fetching stories to display in the UI.
    /// It combines feed ID fetching with item fetching and pagination.
    ///
    /// # Arguments
    ///
    /// * `feed` - The feed type (Top, New, Best, etc.)
    /// * `offset` - Starting index (0-based)
    /// * `limit` - Maximum number of stories to return
    ///
    /// # Returns
    ///
    /// A [`StoriesResponse`] with stories, pagination info, and total count.
    #[instrument(skip(self))]
    pub async fn fetch_stories_paginated(
        &self,
        feed: StoryFeed,
        offset: usize,
        limit: usize,
    ) -> Result<StoriesResponse, ApiError> {
        let ids = self.fetch_story_ids(feed).await?;
        let total = ids.len();

        let page_ids: Vec<u32> = ids.into_iter().skip(offset).take(limit).collect();
        let stories = self.fetch_items(&page_ids).await?;

        Ok(StoriesResponse {
            stories,
            has_more: offset + limit < total,
            total,
        })
    }

    /// Fetch a user profile by username.
    ///
    /// User profiles are cached for 10 minutes.
    ///
    /// # Errors
    ///
    /// - `ApiError::UserNotFound` if the user doesn't exist
    #[instrument(skip(self))]
    pub async fn fetch_user(&self, id: &str) -> Result<HNUser, ApiError> {
        // Check cache first
        if let Some(user) = self.user_cache.get(id).await {
            debug!(id = %id, "Cache hit for user");
            return Ok(user);
        }

        let url = format!("{}/user/{}.json", HN_BASE_URL, id);
        info!(url = %url, "Fetching user");

        let response = self.http.get(&url).send().await?;
        check_response_status(&response)?;

        if !response.status().is_success() {
            return Err(ApiError::UserNotFound(id.to_string()));
        }

        let raw: Option<RawHNUser> = response.json().await?;
        let raw = raw.ok_or_else(|| ApiError::UserNotFound(id.to_string()))?;
        let user: HNUser = raw.into();

        self.user_cache.insert(id.to_string(), user.clone()).await;

        Ok(user)
    }

    /// Fetch a user's submissions with pagination and type filtering.
    ///
    /// # Arguments
    ///
    /// * `user_id` - The username
    /// * `offset` - Starting index in the user's submission list
    /// * `limit` - Maximum submissions to return
    /// * `filter` - Filter by type (All, Stories, Comments)
    #[instrument(skip(self))]
    pub async fn fetch_user_submissions(
        &self,
        user_id: &str,
        offset: usize,
        limit: usize,
        filter: SubmissionFilter,
    ) -> Result<SubmissionsResponse, ApiError> {
        let user = self.fetch_user(user_id).await?;
        let all_ids = user.submitted.unwrap_or_default();
        let total = all_ids.len();

        // Fetch extra items for filtering
        let fetch_limit = if filter == SubmissionFilter::All {
            limit
        } else {
            limit * 2
        };

        let slice_ids: Vec<u32> = all_ids.into_iter().skip(offset).take(fetch_limit).collect();
        let items = self.fetch_items(&slice_ids).await?;

        // Filter by type
        let filtered: Vec<HNItem> = match filter {
            SubmissionFilter::All => items,
            SubmissionFilter::Stories => items
                .into_iter()
                .filter(|i| i.item_type == 0 || i.item_type == 2) // Story or Job
                .collect(),
            SubmissionFilter::Comments => items
                .into_iter()
                .filter(|i| i.item_type == 1) // Comment
                .collect(),
        };

        let result_items: Vec<HNItem> = filtered.into_iter().take(limit).collect();

        Ok(SubmissionsResponse {
            items: result_items,
            has_more: offset + limit < total,
            total,
        })
    }

    /// Fetch comments for an item with depth control.
    ///
    /// Recursively fetches nested comments up to the specified depth.
    ///
    /// # Arguments
    ///
    /// * `item` - The parent item (story or comment)
    /// * `depth` - Maximum nesting depth (0 = no comments, 1 = direct children only)
    ///
    /// # Returns
    ///
    /// A tree of comments as [`CommentWithChildren`] structs.
    #[instrument(skip(self))]
    pub async fn fetch_comments(
        &self,
        item: &HNItem,
        depth: u8,
    ) -> Result<Vec<CommentWithChildren>, ApiError> {
        if depth == 0 {
            return Ok(vec![]);
        }

        let kids = match &item.kids {
            Some(kids) if !kids.is_empty() => kids.clone(),
            _ => return Ok(vec![]),
        };

        let items = self.fetch_items(&kids).await?;
        let mut comments = Vec::with_capacity(items.len());

        for item in items {
            let children = if depth > 1 {
                Box::pin(self.fetch_comments(&item, depth - 1)).await?
            } else {
                vec![]
            };

            comments.push(CommentWithChildren { item, children });
        }

        Ok(comments)
    }

    /// Fetch children of a specific comment (for "load more" functionality).
    ///
    /// Used when a comment thread is collapsed and the user wants to expand it.
    #[instrument(skip(self))]
    pub async fn fetch_comment_children(
        &self,
        comment_id: u32,
        depth: u8,
    ) -> Result<Vec<CommentWithChildren>, ApiError> {
        let comment = self.fetch_item(comment_id).await?;
        self.fetch_comments(&comment, depth).await
    }

    /// Fetch a story with all its comments in one call.
    ///
    /// Convenience method that combines [`fetch_item`] and [`fetch_comments`].
    #[instrument(skip(self))]
    pub async fn fetch_story_with_comments(
        &self,
        id: u32,
        depth: u8,
    ) -> Result<StoryWithComments, ApiError> {
        let story = self.fetch_item(id).await?;
        let comments = self.fetch_comments(&story, depth).await?;

        Ok(StoryWithComments { story, comments })
    }

    /// Search HN using the Algolia Search API.
    ///
    /// Algolia provides faster, full-text search compared to the Firebase API.
    ///
    /// # Arguments
    ///
    /// * `query` - Search query string
    /// * `page` - Page number (0-indexed)
    /// * `hits_per_page` - Results per page (max ~1000)
    /// * `sort` - Sort by relevance or date
    /// * `filter` - Filter to stories, comments, or all
    #[instrument(skip(self))]
    pub async fn search(
        &self,
        query: &str,
        page: u32,
        hits_per_page: u32,
        sort: SearchSort,
        filter: SearchFilter,
    ) -> Result<SearchResponse, ApiError> {
        let endpoint = match sort {
            SearchSort::Relevance => "search",
            SearchSort::Date => "search_by_date",
        };

        let mut url = format!(
            "{}/{}?query={}&page={}&hitsPerPage={}",
            ALGOLIA_BASE_URL,
            endpoint,
            urlencoding::encode(query),
            page,
            hits_per_page
        );

        // Add filter tags
        match filter {
            SearchFilter::All => {}
            SearchFilter::Story => url.push_str("&tags=story"),
            SearchFilter::Comment => url.push_str("&tags=comment"),
        }

        info!(url = %url, "Searching HN");

        let response = self.http.get(&url).send().await?;
        check_response_status(&response)?;

        let response: AlgoliaResponse = response.json().await?;

        Ok(SearchResponse {
            hits: response.hits.into_iter().map(Into::into).collect(),
            nb_hits: response.nb_hits,
            page: response.page,
            nb_pages: response.nb_pages,
            hits_per_page: response.hits_per_page,
            query: response.query,
        })
    }

    /// Clear all caches immediately.
    ///
    /// Use this to force fresh data on the next request, for example
    /// when the user explicitly requests a refresh.
    pub fn clear_cache(&self) {
        self.item_cache.invalidate_all();
        self.story_ids_cache.invalidate_all();
        self.user_cache.invalidate_all();
        info!("All caches cleared");
    }

    /// Clear story IDs cache for a specific feed or all feeds.
    ///
    /// # Arguments
    ///
    /// * `feed` - Specific feed to clear, or `None` to clear all feeds
    pub async fn clear_story_ids_cache(&self, feed: Option<StoryFeed>) {
        if let Some(feed) = feed {
            self.story_ids_cache.invalidate(&feed).await;
            debug!(feed = ?feed, "Story IDs cache cleared for feed");
        } else {
            self.story_ids_cache.invalidate_all();
            debug!("All story IDs caches cleared");
        }
    }

    /// Get current cache statistics for display in settings/debug UI.
    pub fn get_cache_stats(&self) -> CacheStats {
        CacheStats {
            item_count: self.item_cache.entry_count(),
            story_ids_count: self.story_ids_cache.entry_count(),
            user_count: self.user_cache.entry_count(),
            item_ttl_secs: ITEM_CACHE_TTL.as_secs(),
            story_ids_ttl_secs: STORY_IDS_CACHE_TTL.as_secs(),
            user_ttl_secs: USER_CACHE_TTL.as_secs(),
        }
    }

    /// Fetch and extract readable content from an external article URL.
    ///
    /// Uses the [readability] crate to extract the main content from HTML,
    /// removing navigation, ads, and other non-content elements.
    ///
    /// # Arguments
    ///
    /// * `url` - The article URL to fetch and extract
    ///
    /// # Returns
    ///
    /// [`ArticleContent`] with extracted title, HTML content, plain text, and word count.
    ///
    /// # Errors
    ///
    /// - `ApiError::ArticleExtraction` if content extraction fails
    /// - `ApiError::Request` on network failure
    #[instrument(skip(self))]
    pub async fn fetch_article_content(&self, url: &str) -> Result<ArticleContent, ApiError> {
        info!(url = %url, "Fetching article content");

        let response = self.http.get(url).send().await?;
        check_response_status(&response)?;

        if !response.status().is_success() {
            return Err(ApiError::ArticleExtraction(format!(
                "HTTP {} fetching URL",
                response.status()
            )));
        }

        let html = response.text().await?;

        // Parse the URL for readability
        let parsed_url = url::Url::parse(url)
            .map_err(|e| ApiError::ArticleExtraction(format!("Invalid URL: {}", e)))?;

        // Use readability to extract the main content
        let mut cursor = std::io::Cursor::new(html.as_bytes());
        let extracted = readability::extractor::extract(&mut cursor, &parsed_url)
            .map_err(|e| ApiError::ArticleExtraction(e.to_string()))?;

        // Count words in the text content
        let word_count = extracted.text.split_whitespace().count();

        Ok(ArticleContent {
            title: if extracted.title.is_empty() {
                None
            } else {
                Some(extracted.title)
            },
            content: extracted.content,
            text_content: extracted.text,
            byline: None, // readability-rs doesn't expose byline directly
            excerpt: None,
            site_name: None,
            lang: None,
            word_count,
        })
    }
}

impl Default for HnClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Thread-safe shared reference to an [`HnClient`].
///
/// Use [`create_client`] to create an instance.
pub type SharedHnClient = Arc<HnClient>;

/// Create a new shared HN client instance.
///
/// This is the primary way to create a client for use with Tauri commands.
/// The returned `Arc<HnClient>` can be cloned and shared across threads.
pub fn create_client() -> SharedHnClient {
    Arc::new(HnClient::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== HnClient Construction Tests =====

    #[test]
    fn hn_client_new_creates_instance() {
        let client = HnClient::new();
        // Verify clear_cache doesn't panic on fresh instance
        client.clear_cache();
    }

    #[test]
    fn hn_client_default_creates_instance() {
        let client = HnClient::default();
        // Verify clear_cache doesn't panic on fresh instance
        client.clear_cache();
    }

    #[test]
    fn hn_client_default_equals_new() {
        // Both should create valid clients that behave identically
        let client1 = HnClient::new();
        let client2 = HnClient::default();
        // Both should handle clear_cache without panic
        client1.clear_cache();
        client2.clear_cache();
    }

    // ===== create_client Tests =====

    #[test]
    fn create_client_returns_arc() {
        let client = create_client();
        // Verify it's wrapped in Arc by checking strong count
        assert_eq!(Arc::strong_count(&client), 1);
    }

    #[test]
    fn create_client_arc_can_be_cloned() {
        let client1 = create_client();
        let client2 = Arc::clone(&client1);
        assert_eq!(Arc::strong_count(&client1), 2);
        assert_eq!(Arc::strong_count(&client2), 2);
    }

    // ===== Cache Operation Tests =====

    #[test]
    fn clear_cache_does_not_panic() {
        let client = HnClient::new();
        // Should not panic when clearing empty caches
        client.clear_cache();
    }

    #[tokio::test]
    async fn clear_story_ids_cache_specific_feed() {
        let client = HnClient::new();
        // Should not panic when clearing cache for specific feed
        client.clear_story_ids_cache(Some(StoryFeed::Top)).await;
    }

    #[tokio::test]
    async fn clear_story_ids_cache_all_feeds() {
        let client = HnClient::new();
        // Should not panic when clearing all story ID caches
        client.clear_story_ids_cache(None).await;
    }

    // ===== fetch_comments Edge Case Tests =====

    #[tokio::test]
    async fn fetch_comments_depth_zero_returns_empty() {
        let client = HnClient::new();
        let item = HNItem {
            id: 123,
            item_type: 0,
            by: Some("testuser".to_string()),
            time: 1609459200,
            text: None,
            url: Some("https://example.com".to_string()),
            score: 100,
            title: Some("Test Story".to_string()),
            descendants: 50,
            kids: Some(vec![456, 789]),
            parent: None,
            dead: false,
            deleted: false,
        };

        let comments = client.fetch_comments(&item, 0).await.unwrap();
        assert!(comments.is_empty());
    }

    #[tokio::test]
    async fn fetch_comments_no_kids_returns_empty() {
        let client = HnClient::new();
        let item = HNItem {
            id: 123,
            item_type: 0,
            by: Some("testuser".to_string()),
            time: 1609459200,
            text: None,
            url: Some("https://example.com".to_string()),
            score: 100,
            title: Some("Test Story".to_string()),
            descendants: 0,
            kids: None,
            parent: None,
            dead: false,
            deleted: false,
        };

        let comments = client.fetch_comments(&item, 3).await.unwrap();
        assert!(comments.is_empty());
    }

    #[tokio::test]
    async fn fetch_comments_empty_kids_returns_empty() {
        let client = HnClient::new();
        let item = HNItem {
            id: 123,
            item_type: 0,
            by: Some("testuser".to_string()),
            time: 1609459200,
            text: None,
            url: Some("https://example.com".to_string()),
            score: 100,
            title: Some("Test Story".to_string()),
            descendants: 0,
            kids: Some(vec![]), // empty kids array
            parent: None,
            dead: false,
            deleted: false,
        };

        let comments = client.fetch_comments(&item, 3).await.unwrap();
        assert!(comments.is_empty());
    }

    // ===== StoryFeed Cache Key Tests =====

    #[test]
    fn story_feed_is_hashable_for_cache() {
        use std::collections::HashMap;
        let mut map: HashMap<StoryFeed, Vec<u32>> = HashMap::new();

        map.insert(StoryFeed::Top, vec![1, 2, 3]);
        map.insert(StoryFeed::New, vec![4, 5, 6]);
        map.insert(StoryFeed::Best, vec![7, 8, 9]);
        map.insert(StoryFeed::Ask, vec![10, 11, 12]);
        map.insert(StoryFeed::Show, vec![13, 14, 15]);
        map.insert(StoryFeed::Jobs, vec![16, 17, 18]);

        assert_eq!(map.len(), 6);
        assert_eq!(map.get(&StoryFeed::Top), Some(&vec![1, 2, 3]));
        assert_eq!(map.get(&StoryFeed::Jobs), Some(&vec![16, 17, 18]));
    }

    // ===== Constants Tests =====

    #[test]
    fn cache_ttl_constants_are_reasonable() {
        // Item cache: 5 minutes
        assert_eq!(ITEM_CACHE_TTL.as_secs(), 5 * 60);

        // Story IDs cache: 2 minutes (shorter for fresher feeds)
        assert_eq!(STORY_IDS_CACHE_TTL.as_secs(), 2 * 60);

        // User cache: 10 minutes (user data changes less frequently)
        assert_eq!(USER_CACHE_TTL.as_secs(), 10 * 60);
    }

    #[test]
    fn hn_base_url_is_correct() {
        assert_eq!(HN_BASE_URL, "https://hacker-news.firebaseio.com/v0");
    }

    #[test]
    fn algolia_base_url_is_correct() {
        assert_eq!(ALGOLIA_BASE_URL, "https://hn.algolia.com/api/v1");
    }

    // ===== Stale Threshold Constant Test =====

    #[test]
    fn stale_threshold_is_75_percent() {
        assert_eq!(STALE_THRESHOLD_PERCENT, 75);
    }

    // ===== RefreshTracker Tests =====

    #[test]
    fn refresh_tracker_new_creates_empty() {
        let tracker = RefreshTracker::new();
        assert!(tracker.last_fetch.is_empty());
        assert!(tracker.refreshing.is_empty());
    }

    #[test]
    fn refresh_tracker_mark_fetched_records_time() {
        let mut tracker = RefreshTracker::new();
        tracker.mark_fetched(StoryFeed::Top);
        assert!(tracker.last_fetch.contains_key(&StoryFeed::Top));
    }

    #[test]
    fn refresh_tracker_mark_fetched_clears_refreshing() {
        let mut tracker = RefreshTracker::new();
        tracker.start_refresh(StoryFeed::Top);
        assert!(tracker.is_refreshing(&StoryFeed::Top));

        tracker.mark_fetched(StoryFeed::Top);
        assert!(!tracker.is_refreshing(&StoryFeed::Top));
    }

    #[test]
    fn refresh_tracker_is_stale_false_for_fresh_data() {
        let mut tracker = RefreshTracker::new();
        tracker.mark_fetched(StoryFeed::Top);
        // Just fetched, should not be stale
        assert!(!tracker.is_stale(&StoryFeed::Top, Duration::from_secs(120)));
    }

    #[test]
    fn refresh_tracker_is_stale_false_for_unknown_feed() {
        let tracker = RefreshTracker::new();
        // Never fetched, should not be considered stale (will be fetched fresh)
        assert!(!tracker.is_stale(&StoryFeed::Top, Duration::from_secs(120)));
    }

    #[test]
    fn refresh_tracker_start_refresh_sets_flag() {
        let mut tracker = RefreshTracker::new();
        assert!(!tracker.is_refreshing(&StoryFeed::Top));
        tracker.start_refresh(StoryFeed::Top);
        assert!(tracker.is_refreshing(&StoryFeed::Top));
    }

    #[test]
    fn refresh_tracker_independent_feeds() {
        let mut tracker = RefreshTracker::new();
        tracker.mark_fetched(StoryFeed::Top);
        tracker.start_refresh(StoryFeed::New);

        assert!(tracker.last_fetch.contains_key(&StoryFeed::Top));
        assert!(!tracker.last_fetch.contains_key(&StoryFeed::New));
        assert!(tracker.is_refreshing(&StoryFeed::New));
        assert!(!tracker.is_refreshing(&StoryFeed::Top));
    }

    // ===== HnClient Background Refresh Tests =====

    #[tokio::test]
    async fn is_feed_stale_false_initially() {
        let client = HnClient::new();
        // No data cached yet, shouldn't be considered stale
        assert!(!client.is_feed_stale(&StoryFeed::Top).await);
    }
}

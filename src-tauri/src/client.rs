//! HN API client with caching

use std::sync::Arc;
use std::time::Duration;

use moka::future::Cache;
use reqwest::Client;
use tracing::{debug, info, instrument, warn};

use crate::types::*;

const HN_BASE_URL: &str = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_BASE_URL: &str = "https://hn.algolia.com/api/v1";

const ITEM_CACHE_TTL: Duration = Duration::from_secs(5 * 60); // 5 minutes
const STORY_IDS_CACHE_TTL: Duration = Duration::from_secs(2 * 60); // 2 minutes
const USER_CACHE_TTL: Duration = Duration::from_secs(10 * 60); // 10 minutes

/// Check response for rate limiting and other errors
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

/// HN API client with built-in caching
pub struct HnClient {
    http: Client,
    item_cache: Cache<u32, HNItem>,
    story_ids_cache: Cache<StoryFeed, Vec<u32>>,
    user_cache: Cache<String, HNUser>,
}

impl HnClient {
    /// Create a new HN client with default settings
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
        }
    }

    /// Fetch story IDs for a given feed
    #[instrument(skip(self))]
    pub async fn fetch_story_ids(&self, feed: StoryFeed) -> Result<Vec<u32>, ApiError> {
        // Check cache first
        if let Some(ids) = self.story_ids_cache.get(&feed).await {
            debug!(feed = ?feed, count = ids.len(), "Cache hit for story IDs");
            return Ok(ids);
        }

        let url = format!("{}/{}.json", HN_BASE_URL, feed.endpoint());
        info!(url = %url, "Fetching story IDs");

        let response = self.http.get(&url).send().await?;
        check_response_status(&response)?;

        let ids: Vec<u32> = response.json().await?;

        debug!(feed = ?feed, count = ids.len(), "Fetched story IDs");
        self.story_ids_cache.insert(feed, ids.clone()).await;

        Ok(ids)
    }

    /// Fetch a single item by ID
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

    /// Fetch multiple items concurrently
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

    /// Fetch paginated stories for a feed
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

    /// Fetch a user by ID
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

    /// Fetch user submissions with pagination and filtering
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

    /// Fetch comments for an item with depth control
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

    /// Fetch comment children (for "load more" in deep threads)
    #[instrument(skip(self))]
    pub async fn fetch_comment_children(
        &self,
        comment_id: u32,
        depth: u8,
    ) -> Result<Vec<CommentWithChildren>, ApiError> {
        let comment = self.fetch_item(comment_id).await?;
        self.fetch_comments(&comment, depth).await
    }

    /// Fetch a story with its comments
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

    /// Search HN using Algolia API
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

    /// Clear all caches
    pub fn clear_cache(&self) {
        self.item_cache.invalidate_all();
        self.story_ids_cache.invalidate_all();
        self.user_cache.invalidate_all();
        info!("All caches cleared");
    }

    /// Clear story IDs cache for a specific feed or all feeds
    pub async fn clear_story_ids_cache(&self, feed: Option<StoryFeed>) {
        if let Some(feed) = feed {
            self.story_ids_cache.invalidate(&feed).await;
            debug!(feed = ?feed, "Story IDs cache cleared for feed");
        } else {
            self.story_ids_cache.invalidate_all();
            debug!("All story IDs caches cleared");
        }
    }

    /// Get cache statistics
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

    /// Fetch and extract article content from an external URL
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

/// Global client instance for Tauri commands
pub type SharedHnClient = Arc<HnClient>;

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
}

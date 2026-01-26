//! HN API types and error definitions

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Item types from HN API
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum ItemType {
    Story,
    Comment,
    Job,
    Poll,
    Pollopt,
    #[serde(other)]
    #[default]
    Unknown,
}

/// Story feed types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StoryFeed {
    Top,
    New,
    Best,
    Ask,
    Show,
    Jobs,
}

impl StoryFeed {
    pub fn endpoint(&self) -> &'static str {
        match self {
            Self::Top => "topstories",
            Self::New => "newstories",
            Self::Best => "beststories",
            Self::Ask => "askstories",
            Self::Show => "showstories",
            Self::Jobs => "jobstories",
        }
    }
}

/// Raw item from HN Firebase API
#[derive(Debug, Clone, Deserialize)]
pub struct RawHNItem {
    pub id: u32,
    #[serde(rename = "type", default)]
    pub item_type: Option<String>,
    pub by: Option<String>,
    #[serde(default)]
    pub time: u64,
    pub text: Option<String>,
    pub url: Option<String>,
    #[serde(default)]
    pub score: i32,
    pub title: Option<String>,
    #[serde(default)]
    pub descendants: u32,
    pub kids: Option<Vec<u32>>,
    pub parent: Option<u32>,
    #[serde(default)]
    pub dead: bool,
    #[serde(default)]
    pub deleted: bool,
}

/// Processed HN item for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HNItem {
    pub id: u32,
    #[serde(rename = "type")]
    pub item_type: u8, // 0=story, 1=comment, 2=job, 3=poll, 4=pollopt, 5=unknown
    pub by: Option<String>,
    pub time: u64,
    pub text: Option<String>,
    pub url: Option<String>,
    pub score: i32,
    pub title: Option<String>,
    pub descendants: u32,
    pub kids: Option<Vec<u32>>,
    pub parent: Option<u32>,
    pub dead: bool,
    pub deleted: bool,
}

impl From<RawHNItem> for HNItem {
    fn from(raw: RawHNItem) -> Self {
        let item_type = match raw.item_type.as_deref() {
            Some("story") => 0,
            Some("comment") => 1,
            Some("job") => 2,
            Some("poll") => 3,
            Some("pollopt") => 4,
            _ => 5,
        };

        Self {
            id: raw.id,
            item_type,
            by: raw.by,
            time: raw.time,
            text: raw.text,
            url: raw.url,
            score: raw.score,
            title: raw.title,
            descendants: raw.descendants,
            kids: raw.kids,
            parent: raw.parent,
            dead: raw.dead,
            deleted: raw.deleted,
        }
    }
}

/// Comment with nested children
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentWithChildren {
    #[serde(flatten)]
    pub item: HNItem,
    pub children: Vec<CommentWithChildren>,
}

/// Story with comments response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryWithComments {
    pub story: HNItem,
    pub comments: Vec<CommentWithChildren>,
}

/// Paginated stories response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoriesResponse {
    pub stories: Vec<HNItem>,
    pub has_more: bool,
    pub total: usize,
}

/// Raw user from HN Firebase API
#[derive(Debug, Clone, Deserialize)]
pub struct RawHNUser {
    pub id: String,
    pub created: u64,
    pub karma: i32,
    pub about: Option<String>,
    pub submitted: Option<Vec<u32>>,
}

/// Processed HN user for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HNUser {
    pub id: String,
    pub created: u64,
    pub karma: i32,
    pub about: Option<String>,
    pub submitted: Option<Vec<u32>>,
}

impl From<RawHNUser> for HNUser {
    fn from(raw: RawHNUser) -> Self {
        Self {
            id: raw.id,
            created: raw.created,
            karma: raw.karma,
            about: raw.about,
            submitted: raw.submitted,
        }
    }
}

/// User submissions filter
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubmissionFilter {
    All,
    Stories,
    Comments,
}

/// Paginated submissions response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionsResponse {
    pub items: Vec<HNItem>,
    pub has_more: bool,
    pub total: usize,
}

// ===== Search Types (Algolia) =====

/// Search sort options
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchSort {
    Relevance,
    Date,
}

/// Search filter options
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchFilter {
    All,
    Story,
    Comment,
}

/// Search result item
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: u32,
    pub title: Option<String>,
    pub url: Option<String>,
    pub author: Option<String>,
    pub points: i32,
    pub num_comments: u32,
    pub created_at: u64,
    #[serde(rename = "type")]
    pub result_type: String, // "story" or "comment"
    pub story_id: Option<u32>,
    pub story_title: Option<String>,
    pub text: Option<String>,
}

/// Search response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub hits: Vec<SearchResult>,
    pub nb_hits: u32,
    pub page: u32,
    pub nb_pages: u32,
    pub hits_per_page: u32,
    pub query: String,
}

/// Raw Algolia hit
#[derive(Debug, Clone, Deserialize)]
pub struct AlgoliaHit {
    #[serde(rename = "objectID")]
    pub object_id: String,
    pub title: Option<String>,
    pub url: Option<String>,
    pub author: Option<String>,
    pub points: Option<i32>,
    pub num_comments: Option<u32>,
    pub created_at_i: Option<u64>,
    pub story_id: Option<u32>,
    pub story_title: Option<String>,
    pub comment_text: Option<String>,
    #[serde(rename = "_tags", default)]
    pub tags: Vec<String>,
}

impl From<AlgoliaHit> for SearchResult {
    fn from(hit: AlgoliaHit) -> Self {
        let is_comment = hit.tags.iter().any(|t| t == "comment");
        Self {
            id: hit.object_id.parse().unwrap_or(0),
            title: hit.title,
            url: hit.url,
            author: hit.author,
            points: hit.points.unwrap_or(0),
            num_comments: hit.num_comments.unwrap_or(0),
            created_at: hit.created_at_i.unwrap_or(0),
            result_type: if is_comment { "comment" } else { "story" }.to_string(),
            story_id: hit.story_id,
            story_title: hit.story_title,
            text: hit.comment_text,
        }
    }
}

/// Raw Algolia response
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlgoliaResponse {
    pub hits: Vec<AlgoliaHit>,
    pub nb_hits: u32,
    pub page: u32,
    pub nb_pages: u32,
    pub hits_per_page: u32,
    pub query: String,
}

// ===== Error Types =====

/// Extracted article content from external URL
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleContent {
    /// Article title (may differ from HN title)
    pub title: Option<String>,
    /// Main article content as HTML
    pub content: String,
    /// Extracted text content (plain text)
    pub text_content: String,
    /// Article byline/author if found
    pub byline: Option<String>,
    /// Article excerpt/description
    pub excerpt: Option<String>,
    /// Site name
    pub site_name: Option<String>,
    /// Content language
    pub lang: Option<String>,
    /// Word count estimate
    pub word_count: usize,
}

/// Cache statistics for display in settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    /// Number of cached items
    pub item_count: u64,
    /// Number of cached story ID lists
    pub story_ids_count: u64,
    /// Number of cached users
    pub user_count: u64,
    /// Item cache TTL in seconds
    pub item_ttl_secs: u64,
    /// Story IDs cache TTL in seconds
    pub story_ids_ttl_secs: u64,
    /// User cache TTL in seconds
    pub user_ttl_secs: u64,
}

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum ApiError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),

    #[error("Failed to parse JSON: {0}")]
    Parse(#[from] serde_json::Error),

    #[error("Item not found: {0}")]
    NotFound(u32),

    #[error("User not found: {0}")]
    UserNotFound(String),

    #[error("Rate limited, retry after {0} seconds")]
    RateLimited(u32),

    #[error("API error: {0}")]
    Api(String),

    #[error("Failed to extract article content: {0}")]
    ArticleExtraction(String),
}

// Implement Serialize for ApiError so it can be returned from Tauri commands
impl Serialize for ApiError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== ItemType Tests =====

    #[test]
    fn item_type_default_is_unknown() {
        assert_eq!(ItemType::default(), ItemType::Unknown);
    }

    #[test]
    fn item_type_deserialize_story() {
        let json = r#""story""#;
        let item_type: ItemType = serde_json::from_str(json).unwrap();
        assert_eq!(item_type, ItemType::Story);
    }

    #[test]
    fn item_type_deserialize_comment() {
        let json = r#""comment""#;
        let item_type: ItemType = serde_json::from_str(json).unwrap();
        assert_eq!(item_type, ItemType::Comment);
    }

    #[test]
    fn item_type_deserialize_job() {
        let json = r#""job""#;
        let item_type: ItemType = serde_json::from_str(json).unwrap();
        assert_eq!(item_type, ItemType::Job);
    }

    #[test]
    fn item_type_deserialize_poll() {
        let json = r#""poll""#;
        let item_type: ItemType = serde_json::from_str(json).unwrap();
        assert_eq!(item_type, ItemType::Poll);
    }

    #[test]
    fn item_type_deserialize_pollopt() {
        let json = r#""pollopt""#;
        let item_type: ItemType = serde_json::from_str(json).unwrap();
        assert_eq!(item_type, ItemType::Pollopt);
    }

    #[test]
    fn item_type_deserialize_unknown_variant() {
        let json = r#""something_else""#;
        let item_type: ItemType = serde_json::from_str(json).unwrap();
        assert_eq!(item_type, ItemType::Unknown);
    }

    #[test]
    fn item_type_serialize_story() {
        let item_type = ItemType::Story;
        let json = serde_json::to_string(&item_type).unwrap();
        assert_eq!(json, r#""story""#);
    }

    // ===== StoryFeed Tests =====

    #[test]
    fn story_feed_endpoint_top() {
        assert_eq!(StoryFeed::Top.endpoint(), "topstories");
    }

    #[test]
    fn story_feed_endpoint_new() {
        assert_eq!(StoryFeed::New.endpoint(), "newstories");
    }

    #[test]
    fn story_feed_endpoint_best() {
        assert_eq!(StoryFeed::Best.endpoint(), "beststories");
    }

    #[test]
    fn story_feed_endpoint_ask() {
        assert_eq!(StoryFeed::Ask.endpoint(), "askstories");
    }

    #[test]
    fn story_feed_endpoint_show() {
        assert_eq!(StoryFeed::Show.endpoint(), "showstories");
    }

    #[test]
    fn story_feed_endpoint_jobs() {
        assert_eq!(StoryFeed::Jobs.endpoint(), "jobstories");
    }

    #[test]
    fn story_feed_serialize_deserialize_roundtrip() {
        let feed = StoryFeed::Top;
        let json = serde_json::to_string(&feed).unwrap();
        let parsed: StoryFeed = serde_json::from_str(&json).unwrap();
        assert_eq!(feed, parsed);
    }

    // ===== RawHNItem -> HNItem Conversion Tests =====

    #[test]
    fn raw_hn_item_to_hn_item_story() {
        let raw = RawHNItem {
            id: 123,
            item_type: Some("story".to_string()),
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

        let item: HNItem = raw.into();

        assert_eq!(item.id, 123);
        assert_eq!(item.item_type, 0); // story = 0
        assert_eq!(item.by, Some("testuser".to_string()));
        assert_eq!(item.time, 1609459200);
        assert_eq!(item.url, Some("https://example.com".to_string()));
        assert_eq!(item.score, 100);
        assert_eq!(item.title, Some("Test Story".to_string()));
        assert_eq!(item.descendants, 50);
        assert_eq!(item.kids, Some(vec![456, 789]));
        assert_eq!(item.parent, None);
        assert!(!item.dead);
        assert!(!item.deleted);
    }

    #[test]
    fn raw_hn_item_to_hn_item_comment() {
        let raw = RawHNItem {
            id: 456,
            item_type: Some("comment".to_string()),
            by: Some("commenter".to_string()),
            time: 1609459300,
            text: Some("<p>This is a comment</p>".to_string()),
            url: None,
            score: 0,
            title: None,
            descendants: 0,
            kids: None,
            parent: Some(123),
            dead: false,
            deleted: false,
        };

        let item: HNItem = raw.into();

        assert_eq!(item.item_type, 1); // comment = 1
        assert_eq!(item.text, Some("<p>This is a comment</p>".to_string()));
        assert_eq!(item.parent, Some(123));
    }

    #[test]
    fn raw_hn_item_to_hn_item_job() {
        let raw = RawHNItem {
            id: 789,
            item_type: Some("job".to_string()),
            by: Some("company".to_string()),
            time: 1609459400,
            text: Some("Job description".to_string()),
            url: Some("https://jobs.example.com".to_string()),
            score: 0,
            title: Some("Hiring: Engineer".to_string()),
            descendants: 0,
            kids: None,
            parent: None,
            dead: false,
            deleted: false,
        };

        let item: HNItem = raw.into();
        assert_eq!(item.item_type, 2); // job = 2
    }

    #[test]
    fn raw_hn_item_to_hn_item_poll() {
        let raw = RawHNItem {
            id: 1000,
            item_type: Some("poll".to_string()),
            by: Some("pollster".to_string()),
            time: 1609459500,
            text: None,
            url: None,
            score: 50,
            title: Some("Poll question?".to_string()),
            descendants: 10,
            kids: Some(vec![1001, 1002]),
            parent: None,
            dead: false,
            deleted: false,
        };

        let item: HNItem = raw.into();
        assert_eq!(item.item_type, 3); // poll = 3
    }

    #[test]
    fn raw_hn_item_to_hn_item_pollopt() {
        let raw = RawHNItem {
            id: 1001,
            item_type: Some("pollopt".to_string()),
            by: Some("pollster".to_string()),
            time: 1609459500,
            text: Some("Option A".to_string()),
            url: None,
            score: 25,
            title: None,
            descendants: 0,
            kids: None,
            parent: Some(1000),
            dead: false,
            deleted: false,
        };

        let item: HNItem = raw.into();
        assert_eq!(item.item_type, 4); // pollopt = 4
    }

    #[test]
    fn raw_hn_item_to_hn_item_unknown_type() {
        let raw = RawHNItem {
            id: 2000,
            item_type: Some("something_new".to_string()),
            by: None,
            time: 0,
            text: None,
            url: None,
            score: 0,
            title: None,
            descendants: 0,
            kids: None,
            parent: None,
            dead: false,
            deleted: false,
        };

        let item: HNItem = raw.into();
        assert_eq!(item.item_type, 5); // unknown = 5
    }

    #[test]
    fn raw_hn_item_to_hn_item_none_type() {
        let raw = RawHNItem {
            id: 2001,
            item_type: None,
            by: None,
            time: 0,
            text: None,
            url: None,
            score: 0,
            title: None,
            descendants: 0,
            kids: None,
            parent: None,
            dead: false,
            deleted: false,
        };

        let item: HNItem = raw.into();
        assert_eq!(item.item_type, 5); // None maps to unknown = 5
    }

    #[test]
    fn raw_hn_item_to_hn_item_dead_deleted() {
        let raw = RawHNItem {
            id: 3000,
            item_type: Some("comment".to_string()),
            by: None,
            time: 0,
            text: None,
            url: None,
            score: 0,
            title: None,
            descendants: 0,
            kids: None,
            parent: Some(100),
            dead: true,
            deleted: true,
        };

        let item: HNItem = raw.into();
        assert!(item.dead);
        assert!(item.deleted);
    }

    // ===== RawHNUser -> HNUser Conversion Tests =====

    #[test]
    fn raw_hn_user_to_hn_user_full() {
        let raw = RawHNUser {
            id: "testuser".to_string(),
            created: 1577836800,
            karma: 12345,
            about: Some("I am a test user.".to_string()),
            submitted: Some(vec![100, 200, 300]),
        };

        let user: HNUser = raw.into();

        assert_eq!(user.id, "testuser");
        assert_eq!(user.created, 1577836800);
        assert_eq!(user.karma, 12345);
        assert_eq!(user.about, Some("I am a test user.".to_string()));
        assert_eq!(user.submitted, Some(vec![100, 200, 300]));
    }

    #[test]
    fn raw_hn_user_to_hn_user_minimal() {
        let raw = RawHNUser {
            id: "lurker".to_string(),
            created: 1600000000,
            karma: 1,
            about: None,
            submitted: None,
        };

        let user: HNUser = raw.into();

        assert_eq!(user.id, "lurker");
        assert_eq!(user.karma, 1);
        assert_eq!(user.about, None);
        assert_eq!(user.submitted, None);
    }

    // ===== AlgoliaHit -> SearchResult Conversion Tests =====

    #[test]
    fn algolia_hit_to_search_result_story() {
        let hit = AlgoliaHit {
            object_id: "12345".to_string(),
            title: Some("Test Story".to_string()),
            url: Some("https://example.com".to_string()),
            author: Some("author".to_string()),
            points: Some(100),
            num_comments: Some(50),
            created_at_i: Some(1609459200),
            story_id: None,
            story_title: None,
            comment_text: None,
            tags: vec!["story".to_string(), "author_author".to_string()],
        };

        let result: SearchResult = hit.into();

        assert_eq!(result.id, 12345);
        assert_eq!(result.title, Some("Test Story".to_string()));
        assert_eq!(result.url, Some("https://example.com".to_string()));
        assert_eq!(result.author, Some("author".to_string()));
        assert_eq!(result.points, 100);
        assert_eq!(result.num_comments, 50);
        assert_eq!(result.created_at, 1609459200);
        assert_eq!(result.result_type, "story");
        assert_eq!(result.story_id, None);
        assert_eq!(result.text, None);
    }

    #[test]
    fn algolia_hit_to_search_result_comment() {
        let hit = AlgoliaHit {
            object_id: "67890".to_string(),
            title: None,
            url: None,
            author: Some("commenter".to_string()),
            points: Some(10),
            num_comments: None,
            created_at_i: Some(1609459300),
            story_id: Some(12345),
            story_title: Some("Parent Story".to_string()),
            comment_text: Some("This is a comment.".to_string()),
            tags: vec!["comment".to_string(), "author_commenter".to_string()],
        };

        let result: SearchResult = hit.into();

        assert_eq!(result.id, 67890);
        assert_eq!(result.result_type, "comment");
        assert_eq!(result.story_id, Some(12345));
        assert_eq!(result.story_title, Some("Parent Story".to_string()));
        assert_eq!(result.text, Some("This is a comment.".to_string()));
    }

    #[test]
    fn algolia_hit_to_search_result_missing_optional_fields() {
        let hit = AlgoliaHit {
            object_id: "99999".to_string(),
            title: None,
            url: None,
            author: None,
            points: None,
            num_comments: None,
            created_at_i: None,
            story_id: None,
            story_title: None,
            comment_text: None,
            tags: vec![],
        };

        let result: SearchResult = hit.into();

        assert_eq!(result.id, 99999);
        assert_eq!(result.points, 0);
        assert_eq!(result.num_comments, 0);
        assert_eq!(result.created_at, 0);
        assert_eq!(result.result_type, "story"); // no "comment" tag = story
    }

    #[test]
    fn algolia_hit_to_search_result_invalid_object_id() {
        let hit = AlgoliaHit {
            object_id: "not_a_number".to_string(),
            title: None,
            url: None,
            author: None,
            points: None,
            num_comments: None,
            created_at_i: None,
            story_id: None,
            story_title: None,
            comment_text: None,
            tags: vec![],
        };

        let result: SearchResult = hit.into();
        assert_eq!(result.id, 0); // fallback to 0 on parse failure
    }

    // ===== ApiError Tests =====

    #[test]
    fn api_error_serialize_not_found() {
        let error = ApiError::NotFound(12345);
        let json = serde_json::to_string(&error).unwrap();
        assert_eq!(json, r#""Item not found: 12345""#);
    }

    #[test]
    fn api_error_serialize_user_not_found() {
        let error = ApiError::UserNotFound("testuser".to_string());
        let json = serde_json::to_string(&error).unwrap();
        assert_eq!(json, r#""User not found: testuser""#);
    }

    #[test]
    fn api_error_serialize_rate_limited() {
        let error = ApiError::RateLimited(60);
        let json = serde_json::to_string(&error).unwrap();
        assert_eq!(json, r#""Rate limited, retry after 60 seconds""#);
    }

    #[test]
    fn api_error_serialize_api_error() {
        let error = ApiError::Api("Something went wrong".to_string());
        let json = serde_json::to_string(&error).unwrap();
        assert_eq!(json, r#""API error: Something went wrong""#);
    }

    #[test]
    fn api_error_serialize_article_extraction() {
        let error = ApiError::ArticleExtraction("Could not parse content".to_string());
        let json = serde_json::to_string(&error).unwrap();
        assert_eq!(
            json,
            r#""Failed to extract article content: Could not parse content""#
        );
    }

    // ===== HNItem Serialization Tests =====

    #[test]
    fn hn_item_serialize_camel_case() {
        let item = HNItem {
            id: 123,
            item_type: 0,
            by: Some("user".to_string()),
            time: 1609459200,
            text: None,
            url: Some("https://example.com".to_string()),
            score: 100,
            title: Some("Test".to_string()),
            descendants: 50,
            kids: Some(vec![456]),
            parent: None,
            dead: false,
            deleted: false,
        };

        let json = serde_json::to_string(&item).unwrap();

        // Check camelCase field names
        assert!(json.contains(r#""type":0"#));
        // Note: 'descendants' is already camelCase-friendly
        assert!(json.contains(r#""descendants":50"#));
    }

    // ===== SearchResponse Serialization Tests =====

    #[test]
    fn search_response_serialize_camel_case() {
        let response = SearchResponse {
            hits: vec![],
            nb_hits: 100,
            page: 0,
            nb_pages: 10,
            hits_per_page: 20,
            query: "test".to_string(),
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains(r#""nbHits":100"#));
        assert!(json.contains(r#""nbPages":10"#));
        assert!(json.contains(r#""hitsPerPage":20"#));
    }

    // ===== SubmissionFilter Tests =====

    #[test]
    fn submission_filter_serialize_all() {
        let filter = SubmissionFilter::All;
        let json = serde_json::to_string(&filter).unwrap();
        assert_eq!(json, r#""all""#);
    }

    #[test]
    fn submission_filter_deserialize_stories() {
        let json = r#""stories""#;
        let filter: SubmissionFilter = serde_json::from_str(json).unwrap();
        assert_eq!(filter, SubmissionFilter::Stories);
    }

    // ===== SearchSort and SearchFilter Tests =====

    #[test]
    fn search_sort_serialize() {
        assert_eq!(
            serde_json::to_string(&SearchSort::Relevance).unwrap(),
            r#""relevance""#
        );
        assert_eq!(
            serde_json::to_string(&SearchSort::Date).unwrap(),
            r#""date""#
        );
    }

    #[test]
    fn search_filter_serialize() {
        assert_eq!(
            serde_json::to_string(&SearchFilter::All).unwrap(),
            r#""all""#
        );
        assert_eq!(
            serde_json::to_string(&SearchFilter::Story).unwrap(),
            r#""story""#
        );
        assert_eq!(
            serde_json::to_string(&SearchFilter::Comment).unwrap(),
            r#""comment""#
        );
    }
}

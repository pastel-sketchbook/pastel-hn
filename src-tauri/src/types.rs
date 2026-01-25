//! HN API types and error definitions

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Item types from HN API
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum ItemType {
    Story,
    Comment,
    Job,
    Poll,
    Pollopt,
    #[serde(other)]
    Unknown,
}

impl Default for ItemType {
    fn default() -> Self {
        Self::Unknown
    }
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

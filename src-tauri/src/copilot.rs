//! Copilot SDK integration for AI-powered reading assistance.
//!
//! This module provides a managed Copilot client with session management
//! and HN-specific tools for the reading experience.
//!
//! The feature is conditionally enabled based on whether GitHub Copilot CLI
//! is installed and authenticated on the user's machine.

use copilot_sdk::{
    Client, SessionConfig, SessionEventData, SystemMessageConfig, SystemMessageMode,
};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};

/// Global Copilot service instance
static COPILOT_SERVICE: OnceCell<CopilotService> = OnceCell::new();

/// Errors that can occur during Copilot operations
#[derive(Debug, Error, Serialize)]
pub enum CopilotError {
    #[error("Copilot service not initialized")]
    NotInitialized,
    #[error("GitHub Copilot CLI not found. Please install it from https://docs.github.com/en/copilot/github-copilot-in-the-cli")]
    CliNotFound,
    #[error("GitHub Copilot CLI not authenticated. Run 'gh auth login' and 'gh extension install github/gh-copilot'")]
    NotAuthenticated,
    #[error("Failed to start Copilot client: {0}")]
    StartFailed(String),
    #[error("Failed to create session: {0}")]
    SessionFailed(String),
    #[error("Failed to send message: {0}")]
    SendFailed(String),
    #[error("Session timeout")]
    Timeout,
}

/// Context about a story for AI operations
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StoryContext {
    pub title: String,
    pub url: Option<String>,
    pub domain: Option<String>,
    pub score: u32,
    pub comment_count: u32,
    pub author: Option<String>,
    pub text: Option<String>,
}

/// Context about a discussion thread
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiscussionContext {
    pub story_title: String,
    pub comment_count: u32,
    pub top_comments: Vec<CommentSummary>,
}

/// Summary of a comment for AI context
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CommentSummary {
    pub author: String,
    pub text_preview: String,
    pub reply_count: u32,
}

/// Context for drafting a reply
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ReplyContext {
    pub parent_comment: String,
    pub parent_author: String,
    pub story_title: String,
    pub user_draft: Option<String>,
}

/// Response from the Copilot assistant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantResponse {
    pub content: String,
}

/// Result of checking Copilot CLI availability
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotAvailability {
    pub cli_installed: bool,
    pub cli_authenticated: bool,
    pub available: bool,
    pub message: String,
}

/// Status of the Copilot service
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotStatus {
    pub available: bool,
    pub running: bool,
    pub cli_installed: bool,
    pub cli_authenticated: bool,
    pub message: String,
}

/// Check if GitHub Copilot CLI is installed
fn is_copilot_cli_installed() -> bool {
    if Command::new("copilot")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return true;
    }

    Command::new("gh")
        .args(["copilot", "--version"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if GitHub CLI is authenticated
fn is_gh_authenticated() -> bool {
    let output = Command::new("gh").args(["auth", "status"]).output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let stderr = String::from_utf8_lossy(&o.stderr);
            let combined = format!("{}{}", stdout, stderr);

            let logged_in = combined.contains("Logged in to");
            let active = combined.contains("Active account: true");

            debug!(
                "GitHub CLI auth check: logged_in={}, active={}, exit_code={:?}",
                logged_in,
                active,
                o.status.code()
            );

            logged_in && active
        }
        Err(e) => {
            warn!("Failed to run gh auth status: {}", e);
            false
        }
    }
}

/// Check full Copilot availability
pub fn check_availability() -> CopilotAvailability {
    let cli_installed = is_copilot_cli_installed();
    let cli_authenticated = is_gh_authenticated();

    let (available, message) = match (cli_installed, cli_authenticated) {
        (true, true) => (true, "GitHub Copilot is ready".to_string()),
        (true, false) => (
            false,
            "GitHub CLI not authenticated. Run 'gh auth login' to enable AI assistant.".to_string(),
        ),
        (false, _) => (
            false,
            "GitHub Copilot CLI not found. Install it to enable AI assistant.".to_string(),
        ),
    };

    CopilotAvailability {
        cli_installed,
        cli_authenticated,
        available,
        message,
    }
}

/// The Copilot service manages client lifecycle and sessions
pub struct CopilotService {
    client: Arc<Mutex<Option<Client>>>,
    is_running: Arc<RwLock<bool>>,
    system_prompt: String,
}

impl CopilotService {
    /// Create a new Copilot service (does not start the client)
    pub fn new() -> Self {
        let system_prompt = r#"You are a knowledgeable Hacker News reader assistant.

<your_role>
- Summarize linked articles concisely (2-3 paragraphs unless asked for more)
- Explain technical concepts mentioned in stories or comments
- Analyze discussion threads for key viewpoints and sentiment
- Provide context for references to tech history, companies, or people
- Help draft thoughtful, HN-appropriate replies
</your_role>

<your_style>
- Neutral, informative tone (like a well-read HN commenter)
- When summarizing discussions, represent multiple viewpoints fairly
- Keep summaries concise; expand only when asked
- For explanations, assume technical competence but not domain expertise
- Never be condescending or overly enthusiastic
- Use markdown formatting for structure (headers, lists, bold)
</your_style>

<constraints>
- When summarizing articles, work with the title/URL/domain context provided
- For discussion analysis, cite specific perspectives fairly
- Keep replies HN-appropriate: substantive, not snarky
- Be concise - HN readers value brevity
</constraints>"#
            .to_string();

        Self {
            client: Arc::new(Mutex::new(None)),
            is_running: Arc::new(RwLock::new(false)),
            system_prompt,
        }
    }

    /// Initialize and start the Copilot client
    pub async fn start(&self) -> Result<(), CopilotError> {
        let mut client_lock = self.client.lock().await;

        if client_lock.is_some() {
            debug!("Copilot client already running");
            return Ok(());
        }

        debug!("Checking Copilot CLI availability...");
        let availability = check_availability();
        debug!(
            "Availability: cli_installed={}, cli_authenticated={}, available={}",
            availability.cli_installed, availability.cli_authenticated, availability.available
        );

        if !availability.cli_installed {
            warn!("Copilot CLI not installed");
            return Err(CopilotError::CliNotFound);
        }

        if !availability.cli_authenticated {
            warn!("GitHub CLI not authenticated");
            return Err(CopilotError::NotAuthenticated);
        }

        debug!("Starting Copilot client with stdio transport...");

        let client = Client::builder().use_stdio(true).build().map_err(|e| {
            error!("Failed to build client: {}", e);
            CopilotError::StartFailed(e.to_string())
        })?;

        debug!("Client built, starting...");

        client.start().await.map_err(|e| {
            error!("Failed to start client: {}", e);
            CopilotError::StartFailed(e.to_string())
        })?;

        *client_lock = Some(client);
        *self.is_running.write().await = true;

        info!("Copilot AI assistant ready");
        Ok(())
    }

    /// Stop the Copilot client
    pub async fn stop(&self) -> Result<(), CopilotError> {
        let mut client_lock = self.client.lock().await;

        if let Some(client) = client_lock.take() {
            info!("Stopping Copilot client...");
            *self.is_running.write().await = false;
            client
                .stop()
                .await
                .map_err(|e| CopilotError::SendFailed(e.to_string()))?;
            info!("Copilot client stopped");
        }

        Ok(())
    }

    /// Check if the service is running
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    /// Send a message to Copilot and get a response
    async fn ask(&self, prompt: &str) -> Result<AssistantResponse, CopilotError> {
        let client_lock = self.client.lock().await;
        let client = client_lock.as_ref().ok_or(CopilotError::NotInitialized)?;

        debug!("Creating Copilot session...");

        let config = SessionConfig {
            system_message: Some(SystemMessageConfig {
                mode: Some(SystemMessageMode::Replace),
                content: Some(self.system_prompt.clone()),
            }),
            ..Default::default()
        };

        let session = client.create_session(config).await.map_err(|e| {
            error!("Failed to create session: {}", e);
            CopilotError::SessionFailed(e.to_string())
        })?;

        debug!("Session created, subscribing to events...");
        let mut events = session.subscribe();

        debug!("Sending message ({} chars)...", prompt.len());

        let message_id = session.send(prompt).await.map_err(|e| {
            error!("Failed to send message: {}", e);
            CopilotError::SendFailed(e.to_string())
        })?;

        debug!("Message sent (id={}), waiting for response...", message_id);

        let mut response_content = String::new();

        loop {
            match tokio::time::timeout(std::time::Duration::from_secs(60), events.recv()).await {
                Ok(Ok(event)) => {
                    debug!("Event: {:?}", std::mem::discriminant(&event.data));
                    match &event.data {
                        SessionEventData::AssistantMessageDelta(delta) => {
                            debug!("Delta: +{} chars", delta.delta_content.len());
                            response_content.push_str(&delta.delta_content);
                        }
                        SessionEventData::AssistantMessage(msg) => {
                            debug!("Full message: {} chars", msg.content.len());
                            if response_content.is_empty() {
                                response_content = msg.content.clone();
                            }
                        }
                        SessionEventData::SessionIdle(_) => {
                            debug!("Session idle");
                            break;
                        }
                        SessionEventData::SessionError(err) => {
                            error!("Copilot session error: {}", err.message);
                            return Err(CopilotError::SendFailed(err.message.clone()));
                        }
                        _ => {}
                    }
                }
                Ok(Err(e)) => {
                    warn!("Event channel error: {:?}", e);
                    break;
                }
                Err(_) => {
                    error!("Timeout waiting for Copilot response");
                    return Err(CopilotError::Timeout);
                }
            }
        }

        info!("Copilot response: {} chars", response_content.len());

        Ok(AssistantResponse {
            content: response_content,
        })
    }

    /// Summarize an article based on its metadata
    pub async fn summarize_article(
        &self,
        context: StoryContext,
    ) -> Result<AssistantResponse, CopilotError> {
        let mut prompt = format!(
            "Summarize what this Hacker News story is likely about:\n\nTitle: {}\n",
            context.title
        );

        if let Some(url) = &context.url {
            prompt.push_str(&format!("URL: {}\n", url));
        }
        if let Some(domain) = &context.domain {
            prompt.push_str(&format!("Domain: {}\n", domain));
        }
        if let Some(text) = &context.text {
            prompt.push_str(&format!("\nStory text:\n{}\n", text));
        }

        prompt.push_str(&format!(
            "\nScore: {} points, {} comments\n",
            context.score, context.comment_count
        ));

        prompt.push_str("\nProvide a concise summary (2-3 paragraphs) of what this article likely covers based on the title and context. If it's an Ask HN or Show HN, explain the nature of the post.");

        self.ask(&prompt).await
    }

    /// Analyze a discussion thread
    pub async fn analyze_discussion(
        &self,
        context: DiscussionContext,
    ) -> Result<AssistantResponse, CopilotError> {
        let mut prompt = format!(
            "Analyze this Hacker News discussion:\n\nStory: {}\nTotal comments: {}\n\nTop-level comments:\n",
            context.story_title, context.comment_count
        );

        for (i, comment) in context.top_comments.iter().enumerate() {
            prompt.push_str(&format!(
                "\n{}. {} ({} replies):\n\"{}\"\n",
                i + 1,
                comment.author,
                comment.reply_count,
                comment.text_preview
            ));
        }

        prompt.push_str("\nProvide a brief analysis of this discussion:\n1. What are the main viewpoints or themes?\n2. Are there areas of agreement or contention?\n3. Any particularly notable perspectives?");

        self.ask(&prompt).await
    }

    /// Explain a term or concept
    pub async fn explain(
        &self,
        text: &str,
        context: Option<&str>,
    ) -> Result<AssistantResponse, CopilotError> {
        let prompt = if let Some(ctx) = context {
            format!(
                "Explain this term/concept in the context of a Hacker News discussion:\n\nTerm: \"{}\"\nContext: {}\n\nProvide a brief explanation (1-2 paragraphs) that would help a technically-competent reader who may not be familiar with this specific topic.",
                text, ctx
            )
        } else {
            format!(
                "Explain this term/concept for a Hacker News reader:\n\nTerm: \"{}\"\n\nProvide a brief explanation (1-2 paragraphs) that would help a technically-competent reader.",
                text
            )
        };

        self.ask(&prompt).await
    }

    /// Help draft a reply
    pub async fn draft_reply(
        &self,
        context: ReplyContext,
    ) -> Result<AssistantResponse, CopilotError> {
        let mut prompt = format!(
            "Help draft a thoughtful reply to this Hacker News comment:\n\nStory: {}\n\nComment by {}:\n\"{}\"\n",
            context.story_title, context.parent_author, context.parent_comment
        );

        if let Some(draft) = &context.user_draft {
            prompt.push_str(&format!("\nUser's draft so far:\n\"{}\"\n", draft));
            prompt.push_str(
                "\nHelp improve and expand this draft while maintaining the user's voice.",
            );
        } else {
            prompt.push_str("\nSuggest 2-3 different angles for a thoughtful reply, with a brief draft for each. Keep them substantive but not too long.");
        }

        self.ask(&prompt).await
    }

    /// Ask a general question
    pub async fn ask_question(&self, question: &str) -> Result<AssistantResponse, CopilotError> {
        self.ask(question).await
    }
}

/// Get or initialize the global Copilot service
pub fn get_service() -> &'static CopilotService {
    COPILOT_SERVICE.get_or_init(CopilotService::new)
}

/// Initialize the Copilot service (call on first use)
pub async fn init() -> Result<CopilotStatus, CopilotError> {
    let availability = check_availability();

    if !availability.available {
        return Ok(CopilotStatus {
            available: false,
            running: false,
            cli_installed: availability.cli_installed,
            cli_authenticated: availability.cli_authenticated,
            message: availability.message,
        });
    }

    let service = get_service();
    service.start().await?;

    Ok(CopilotStatus {
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: "AI assistant ready".to_string(),
    })
}

/// Get current status without initializing
pub async fn get_status() -> CopilotStatus {
    let availability = check_availability();
    let service = get_service();
    let running = service.is_running().await;

    CopilotStatus {
        available: availability.available,
        running,
        cli_installed: availability.cli_installed,
        cli_authenticated: availability.cli_authenticated,
        message: if running {
            "AI assistant ready".to_string()
        } else {
            availability.message
        },
    }
}

/// Shutdown the Copilot service
pub async fn shutdown() -> Result<(), CopilotError> {
    let service = get_service();
    service.stop().await
}

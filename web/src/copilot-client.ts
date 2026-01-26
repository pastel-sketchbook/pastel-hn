/**
 * Copilot AI assistant client for Tauri backend
 *
 * This module conditionally enables Copilot features based on whether
 * GitHub Copilot CLI is installed and authenticated on the user's machine.
 *
 * See docs/rationale/0006_copilot_ai_assistant.md
 */

import { invoke } from '@tauri-apps/api/core'

/** Copilot service status */
export interface CopilotStatus {
  available: boolean
  running: boolean
  cli_installed: boolean
  cli_authenticated: boolean
  message: string
}

/** Context about a story for summarization */
export interface StoryContext {
  title: string
  url: string | null
  domain: string | null
  score: number
  comment_count: number
  author: string | null
  text: string | null
}

/** Summary of a comment for discussion analysis */
export interface CommentSummary {
  author: string
  text_preview: string
  reply_count: number
}

/** Context about a discussion thread */
export interface DiscussionContext {
  story_title: string
  comment_count: number
  top_comments: CommentSummary[]
}

/** Context for drafting a reply */
export interface ReplyContext {
  parent_comment: string
  parent_author: string
  story_title: string
  user_draft: string | null
}

/** Response from the AI assistant */
export interface AssistantResponse {
  content: string
}

/** Default unavailable status for non-Tauri environments */
const UNAVAILABLE_STATUS: CopilotStatus = {
  available: false,
  running: false,
  cli_installed: false,
  cli_authenticated: false,
  message: 'AI assistant requires the desktop app',
}

/** Check if running in Tauri */
function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

/**
 * Copilot client for interacting with the AI assistant
 *
 * Features are conditionally enabled based on:
 * 1. Running inside Tauri desktop app
 * 2. GitHub Copilot CLI installed
 * 3. GitHub CLI authenticated
 */
export class CopilotClient {
  private initialized = false
  private available = false
  private lastStatus: CopilotStatus = UNAVAILABLE_STATUS

  /** Check if Copilot features are available */
  isAvailable(): boolean {
    return this.available
  }

  /** Get the last known status */
  getLastStatus(): CopilotStatus {
    return this.lastStatus
  }

  /** Check if initialized */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Check Copilot availability without initializing
   */
  async check(): Promise<CopilotStatus> {
    if (!isTauri()) {
      this.lastStatus = UNAVAILABLE_STATUS
      return this.lastStatus
    }

    try {
      const status = await invoke<CopilotStatus>('copilot_check')
      this.available = status.available
      this.lastStatus = status
      return status
    } catch (error) {
      console.error('Failed to check Copilot:', error)
      this.lastStatus = {
        ...UNAVAILABLE_STATUS,
        message: error instanceof Error ? error.message : 'Check failed',
      }
      return this.lastStatus
    }
  }

  /**
   * Initialize the Copilot service
   * Returns status indicating whether the feature is available
   */
  async init(): Promise<CopilotStatus> {
    if (!isTauri()) {
      this.lastStatus = UNAVAILABLE_STATUS
      return this.lastStatus
    }

    try {
      const status = await invoke<CopilotStatus>('copilot_init')
      this.initialized = true
      this.available = status.available
      this.lastStatus = status
      return status
    } catch (error) {
      console.error('Failed to initialize Copilot:', error)
      this.lastStatus = {
        ...UNAVAILABLE_STATUS,
        message:
          error instanceof Error ? error.message : 'Failed to initialize',
      }
      return this.lastStatus
    }
  }

  /**
   * Summarize an article based on story context
   */
  async summarize(context: StoryContext): Promise<AssistantResponse | null> {
    if (!this.available) {
      console.warn('Copilot not available')
      return null
    }

    try {
      return await invoke<AssistantResponse>('copilot_summarize', { context })
    } catch (error) {
      console.error('Copilot summarize error:', error)
      return null
    }
  }

  /**
   * Analyze a discussion thread
   */
  async analyzeDiscussion(
    context: DiscussionContext,
  ): Promise<AssistantResponse | null> {
    if (!this.available) {
      return null
    }

    try {
      return await invoke<AssistantResponse>('copilot_analyze_discussion', {
        context,
      })
    } catch (error) {
      console.error('Copilot analyze discussion error:', error)
      return null
    }
  }

  /**
   * Explain a term or concept
   */
  async explain(
    text: string,
    context?: string,
  ): Promise<AssistantResponse | null> {
    if (!this.available) {
      return null
    }

    try {
      return await invoke<AssistantResponse>('copilot_explain', {
        text,
        context: context ?? null,
      })
    } catch (error) {
      console.error('Copilot explain error:', error)
      return null
    }
  }

  /**
   * Help draft a reply to a comment
   */
  async draftReply(context: ReplyContext): Promise<AssistantResponse | null> {
    if (!this.available) {
      return null
    }

    try {
      return await invoke<AssistantResponse>('copilot_draft_reply', { context })
    } catch (error) {
      console.error('Copilot draft reply error:', error)
      return null
    }
  }

  /**
   * Ask a general question
   */
  async ask(prompt: string): Promise<AssistantResponse | null> {
    if (!this.available) {
      return null
    }

    try {
      return await invoke<AssistantResponse>('copilot_ask', { prompt })
    } catch (error) {
      console.error('Copilot ask error:', error)
      return null
    }
  }

  /**
   * Shutdown the Copilot service
   */
  async shutdown(): Promise<void> {
    if (!isTauri() || !this.initialized) {
      return
    }

    try {
      await invoke<void>('copilot_shutdown')
      this.available = false
      this.initialized = false
    } catch (error) {
      console.error('Copilot shutdown error:', error)
    }
  }
}

// Singleton instance
let copilotClient: CopilotClient | null = null

/**
 * Get the global Copilot client instance
 */
export function getCopilotClient(): CopilotClient {
  if (!copilotClient) {
    copilotClient = new CopilotClient()
  }
  return copilotClient
}

/**
 * AI Assistant UI component
 *
 * A collapsible frost-blur panel that provides AI-powered reading assistance.
 * Features include:
 * - Story summarization
 * - Discussion analysis
 * - Term/concept explanation via text selection
 * - Reply drafting assistance
 *
 * The assistant is only available when:
 * 1. Running in Tauri desktop app
 * 2. GitHub Copilot CLI is installed and authenticated
 * 3. User is in Zen mode viewing story details
 *
 * @see docs/rationale/0006_copilot_ai_assistant.md
 * @module assistant-ui
 */

import { extractDomain } from './api'
import {
  type CommentSummary,
  type DiscussionContext,
  getCopilotClient,
  type ReplyContext,
  type StoryContext,
} from './copilot-client'
import type { CommentWithChildren, HNItem } from './types'
import { escapeHtml } from './utils'

/**
 * A single message in the assistant conversation
 */
interface Message {
  /** Message sender: 'user' for user messages, 'assistant' for AI responses */
  role: 'user' | 'assistant'
  /** Message content (plain text for user, may contain markdown for assistant) */
  content: string
  /** Unix timestamp when message was created */
  timestamp: number
}

/**
 * Internal state of the assistant panel
 */
interface AssistantState {
  /** Whether the assistant panel is currently open */
  isOpen: boolean
  /** Whether an AI request is in progress */
  isLoading: boolean
  /** Conversation history */
  messages: Message[]
  /** Current story being viewed (for context) */
  currentStory: HNItem | null
  /** Comments on the current story (for discussion analysis) */
  currentComments: CommentWithChildren[]
}

/** Module-level state singleton */
const state: AssistantState = {
  isOpen: false,
  isLoading: false,
  messages: [],
  currentStory: null,
  currentComments: [],
}

/**
 * Initialize the assistant UI
 * Call this after checking Copilot availability
 */
export async function initAssistant(): Promise<boolean> {
  const client = getCopilotClient()
  const status = await client.check()

  if (!status.available) {
    console.log('AI assistant not available:', status.message)
    return false
  }

  renderToggleButton()
  renderPanel()
  setupKeyboardShortcut()
  initContextMenu()

  return true
}

/**
 * Update the current story context for the assistant
 */
export function setStoryContext(
  story: HNItem,
  comments: CommentWithChildren[] = [],
): void {
  state.currentStory = story
  state.currentComments = comments
  updateQuickActions()
}

/**
 * Clear the story context (when leaving story detail view)
 */
export function clearStoryContext(): void {
  state.currentStory = null
  state.currentComments = []
  updateQuickActions()
}

/**
 * Toggle the assistant panel
 */
export function toggleAssistant(): void {
  state.isOpen = !state.isOpen
  const panel = document.getElementById('assistant-panel')
  const toggleBtn = document.getElementById('assistant-toggle')

  if (panel) {
    panel.classList.toggle('open', state.isOpen)
  }
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', state.isOpen)
    toggleBtn.setAttribute('aria-expanded', String(state.isOpen))
  }

  if (state.isOpen) {
    initializeCopilotIfNeeded()
    const input = document.getElementById('assistant-input') as HTMLInputElement
    input?.focus()
  }
}

/**
 * Close the assistant panel
 */
export function closeAssistant(): void {
  if (state.isOpen) {
    toggleAssistant()
  }
}

/**
 * Update assistant visibility based on Zen mode state and current view
 * The assistant FAB is only visible when in Zen mode AND viewing story details.
 *
 * @param isZen - Whether Zen mode is currently active
 * @param view - Current view identifier ('detail', 'list', etc.)
 */
export function updateAssistantZenMode(isZen: boolean, view: string): void {
  const toggleBtn = document.getElementById('assistant-toggle')
  // AI Assistant FAB only shown in Zen mode + Story Detail view
  const isVisible = isZen && view === 'detail'

  if (toggleBtn) {
    toggleBtn.style.display = isVisible ? 'flex' : 'none'
  }

  // Update a helper class for other UI elements (like Back-to-Top) to react
  document.documentElement.classList.toggle(
    'assistant-toggle-visible',
    isVisible,
  )

  // Auto-close if leaving Zen mode or Detail view while open
  if (!isVisible && state.isOpen) {
    closeAssistant()
  }
}

/**
 * Check if assistant is open
 */
export function isAssistantOpen(): boolean {
  return state.isOpen
}

// ============================================================================
// Private Functions - Panel Rendering and State Management
// ============================================================================

/**
 * Initialize Copilot client if not already done
 * Called lazily when the assistant panel is first opened
 */
async function initializeCopilotIfNeeded(): Promise<void> {
  const client = getCopilotClient()
  if (!client.isInitialized()) {
    await client.init()
  }
}

/**
 * Render the floating action button (FAB) for toggling the assistant
 * Only creates the button if it doesn't already exist
 */
function renderToggleButton(): void {
  const existing = document.getElementById('assistant-toggle')
  if (existing) return

  const button = document.createElement('button')
  button.id = 'assistant-toggle'
  button.className = 'assistant-toggle'
  button.setAttribute('aria-label', 'Toggle AI assistant')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('title', 'AI Assistant (a)')
  button.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
      <circle cx="8" cy="14" r="1"/>
      <circle cx="16" cy="14" r="1"/>
    </svg>
  `
  button.addEventListener('click', toggleAssistant)

  document.body.appendChild(button)

  // Initial visibility check
  const isZen = document.documentElement.classList.contains('zen-mode')
  button.style.display = isZen ? 'flex' : 'none'
}

/**
 * Render the main assistant panel with header, messages, and input
 * Sets up all event listeners for panel interactions
 */
function renderPanel(): void {
  const existing = document.getElementById('assistant-panel')
  if (existing) return

  const panel = document.createElement('div')
  panel.id = 'assistant-panel'
  panel.className = 'assistant-panel'
  panel.setAttribute('role', 'complementary')
  panel.setAttribute('aria-label', 'AI Assistant')

  const initialReadability =
    localStorage.getItem('assistant-readability') === 'true'
  if (initialReadability) {
    panel.classList.add('light-reading-mode')
  }

  panel.innerHTML = `
    <div class="assistant-header">
      <div class="assistant-header-titles">
        <h2>AI Assistant</h2>
        <div class="readability-toggle ${initialReadability ? 'active' : ''}" id="readability-toggle" title="Toggle High Comfort Reading Mode">
          <span class="toggle-label">Reading Mode</span>
          <div class="toggle-switch"></div>
        </div>
      </div>
      <button class="assistant-close" aria-label="Close assistant" title="Close (Esc)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    
    <div class="assistant-quick-actions" id="assistant-quick-actions">
      <!-- Quick action buttons rendered dynamically -->
    </div>
    
    <div class="assistant-messages" id="assistant-messages">
      <div class="assistant-welcome">
        <p>Ask me about this story or discussion.</p>
      </div>
    </div>
    
    <div class="assistant-input-container">
      <input
        type="text"
        id="assistant-input"
        class="assistant-input"
        placeholder="Ask a question..."
        autocomplete="off"
      />
      <button id="assistant-send" class="assistant-send" aria-label="Send message">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  `

  document.body.appendChild(panel)

  // Event listeners
  panel
    .querySelector('.assistant-close')
    ?.addEventListener('click', closeAssistant)

  const readToggle = panel.querySelector('#readability-toggle')
  readToggle?.addEventListener('click', () => {
    const isActive = panel.classList.toggle('light-reading-mode')
    readToggle.classList.toggle('active', isActive)
    localStorage.setItem('assistant-readability', String(isActive))
  })

  const input = panel.querySelector('#assistant-input') as HTMLInputElement
  const sendBtn = panel.querySelector('#assistant-send') as HTMLButtonElement

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
    if (e.key === 'Escape') {
      closeAssistant()
    }
  })

  sendBtn?.addEventListener('click', handleSendMessage)

  updateQuickActions()
}

/**
 * Update the quick action buttons based on current story context
 * Shows different actions depending on whether a story/comments are available
 */
function updateQuickActions(): void {
  const container = document.getElementById('assistant-quick-actions')
  if (!container) return

  const hasStory = state.currentStory !== null
  const hasUrl = state.currentStory?.url != null
  const hasComments = state.currentComments.length > 0

  container.innerHTML = ''

  if (!hasStory) {
    container.innerHTML =
      '<p class="assistant-hint">Open a story to use quick actions</p>'
    return
  }

  if (hasUrl) {
    const summarizeBtn = createQuickActionButton(
      '📝 Summarize',
      handleSummarize,
    )
    container.appendChild(summarizeBtn)
  }

  if (hasComments) {
    const analyzeBtn = createQuickActionButton(
      '💬 Analyze Discussion',
      handleAnalyzeDiscussion,
    )
    container.appendChild(analyzeBtn)
  }

  const askBtn = createQuickActionButton('❓ Ask About This', () => {
    const input = document.getElementById('assistant-input') as HTMLInputElement
    input?.focus()
  })
  container.appendChild(askBtn)
}

/**
 * Create a quick action button element
 * @param label - Button label text (may include emoji)
 * @param onClick - Click handler function
 * @returns Configured button element
 */
function createQuickActionButton(
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'assistant-quick-action'
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

/**
 * Handle sending a user message from the input field
 * Retrieves input value, adds to conversation, and sends to AI
 */
async function handleSendMessage(): Promise<void> {
  const input = document.getElementById('assistant-input') as HTMLInputElement
  const message = input?.value.trim()

  if (!message || state.isLoading) return

  input.value = ''
  addMessage('user', message)
  await sendToAssistant(message)
}

/**
 * Handle the "Summarize" quick action
 * Requests an AI summary of the current story's article
 */
async function handleSummarize(): Promise<void> {
  if (!state.currentStory || state.isLoading) return

  const story = state.currentStory
  addMessage('user', `Summarize: "${story.title}"`)

  const context: StoryContext = {
    title: story.title ?? '',
    url: story.url ?? null,
    domain: extractDomain(story.url ?? null),
    score: story.score ?? 0,
    comment_count: story.descendants ?? 0,
    author: story.by ?? null,
    text: story.text ?? null,
  }

  setLoading(true)
  const client = getCopilotClient()
  const response = await client.summarize(context)
  setLoading(false)

  if (response) {
    addMessage('assistant', response.content)
  } else {
    addMessage('assistant', 'Sorry, I encountered an error. Please try again.')
  }
}

/**
 * Handle the "Analyze Discussion" quick action
 * Requests an AI analysis of the top comments on the current story
 */
async function handleAnalyzeDiscussion(): Promise<void> {
  if (!state.currentStory || state.isLoading) return

  const story = state.currentStory
  addMessage('user', `Analyze discussion: "${story.title}"`)

  const topComments: CommentSummary[] = state.currentComments
    .slice(0, 10)
    .map((c) => ({
      author: c.by ?? 'unknown',
      text_preview: stripHtml(c.text ?? '').slice(0, 200),
      reply_count: c.children?.length ?? 0,
    }))

  const context: DiscussionContext = {
    story_title: story.title ?? '',
    comment_count: story.descendants ?? 0,
    top_comments: topComments,
  }

  setLoading(true)
  const client = getCopilotClient()
  const response = await client.analyzeDiscussion(context)
  setLoading(false)

  if (response) {
    addMessage('assistant', response.content)
  } else {
    addMessage('assistant', 'Sorry, I encountered an error. Please try again.')
  }
}

/**
 * Send a free-form message to the AI assistant
 * Includes current story context in the prompt if available
 * @param message - User's question or request
 */
async function sendToAssistant(message: string): Promise<void> {
  setLoading(true)

  // Add story context to the prompt if available
  let contextualPrompt = message
  if (state.currentStory) {
    const story = state.currentStory
    contextualPrompt = `[Context: Story "${story.title}"${story.url ? ` (${extractDomain(story.url)})` : ''}]\n\n${message}`
  }

  const client = getCopilotClient()
  const response = await client.ask(contextualPrompt)
  setLoading(false)

  if (response) {
    addMessage('assistant', response.content)
  } else {
    addMessage('assistant', 'Sorry, I encountered an error. Please try again.')
  }
}

/**
 * Add a message to the conversation history and re-render
 * @param role - Message sender ('user' or 'assistant')
 * @param content - Message content
 */
function addMessage(role: 'user' | 'assistant', content: string): void {
  state.messages.push({ role, content, timestamp: Date.now() })
  renderMessages()
}

/**
 * Render all messages in the conversation
 * Also shows loading indicator when a request is in progress
 */
function renderMessages(): void {
  const container = document.getElementById('assistant-messages')
  if (!container) return

  if (state.messages.length === 0) {
    container.innerHTML = `
      <div class="assistant-welcome">
        <p>Ask me about this story or discussion.</p>
      </div>
    `
    return
  }

  container.innerHTML = state.messages
    .map(
      (msg) => `
      <div class="assistant-message assistant-message-${msg.role}">
        <div class="assistant-message-content">${msg.role === 'assistant' ? parseMarkdown(msg.content) : escapeHtml(msg.content)}</div>
      </div>
    `,
    )
    .join('')

  if (state.isLoading) {
    container.innerHTML += `
      <div class="assistant-message assistant-message-assistant">
        <div class="assistant-message-content assistant-loading">
          <span class="loading-dot"></span>
          <span class="loading-dot"></span>
          <span class="loading-dot"></span>
        </div>
      </div>
    `
  }

  container.scrollTop = container.scrollHeight
}

/**
 * Set loading state and update UI accordingly
 * Disables input and shows loading animation when true
 * @param loading - Whether a request is in progress
 */
function setLoading(loading: boolean): void {
  state.isLoading = loading
  renderMessages()

  const input = document.getElementById('assistant-input') as HTMLInputElement
  const sendBtn = document.getElementById('assistant-send') as HTMLButtonElement

  if (input) input.disabled = loading
  if (sendBtn) sendBtn.disabled = loading
}

/**
 * Set up the 'a' keyboard shortcut for toggling the assistant
 * Only active when in Zen mode and not focused on an input
 */
function setupKeyboardShortcut(): void {
  document.addEventListener('keydown', (e) => {
    // 'a' to toggle assistant (when not in input)
    if (
      e.key === 'a' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      document.activeElement?.tagName !== 'INPUT' &&
      document.activeElement?.tagName !== 'TEXTAREA'
    ) {
      // Must be in Zen mode to use assistant
      if (!document.documentElement.classList.contains('zen-mode')) return

      e.preventDefault()
      toggleAssistant()
    }
  })
}

// ============================================================================
// Utility Functions - Text Processing
// ============================================================================

/**
 * Strip HTML tags from a string, returning plain text
 * @param html - HTML string to strip
 * @returns Plain text content
 */
function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

/**
 * Parse simple markdown to HTML for AI responses.
 * Supports: code blocks, inline code, headers, bold, italic, lists
 * @param text - Markdown text to parse
 * @returns HTML string
 */
export function parseMarkdown(text: string): string {
  let html = escapeHtml(text)

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Headers - shifted down one level to nest under panel's h2
  // # becomes h3, ## becomes h4, ### becomes h5
  html = html.replace(/^### (.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>')

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

  // Line breaks (double newline = paragraph)
  html = html.replace(/\n\n/g, '</p><p>')
  html = `<p>${html}</p>`
  html = html.replace(/<p><\/p>/g, '')

  return html
}

// ============================================================================
// Context Menu for Text Selection
// ============================================================================

/** Context menu dimensions for positioning calculations */
export const CONTEXT_MENU_WIDTH = 160
export const CONTEXT_MENU_HEIGHT = 80

let contextMenu: HTMLElement | null = null

/**
 * Reset context menu state (for testing only)
 * @internal Exported for testing
 */
export function resetContextMenu(): void {
  if (contextMenu?.parentNode) {
    contextMenu.parentNode.removeChild(contextMenu)
  }
  contextMenu = null
}

/**
 * Initialize the context menu for text selection
 * Call this after initAssistant
 */
export function initContextMenu(): void {
  if (contextMenu) return

  contextMenu = document.createElement('div')
  contextMenu.id = 'assistant-context-menu'
  contextMenu.className = 'assistant-context-menu'
  contextMenu.setAttribute('role', 'menu')
  contextMenu.innerHTML = `
    <button class="context-menu-item" data-action="explain" role="menuitem">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>Explain This</span>
    </button>
    <button class="context-menu-item" data-action="draft-reply" role="menuitem" style="display: none;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="9" y1="10" x2="15" y2="10"/>
      </svg>
      <span>Draft Reply</span>
    </button>
  `
  document.body.appendChild(contextMenu)

  // Event handlers
  contextMenu.addEventListener('click', handleContextMenuClick)
  document.addEventListener('mousedown', (e) => {
    // Don't hide menu if clicking inside it (let the click handler process it)
    if (contextMenu && contextMenu.contains(e.target as Node)) {
      return
    }
    hideContextMenu()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu()
  })

  // Show context menu on text selection (mouseup)
  document.addEventListener('mouseup', handleTextSelection)
}

/**
 * Get the context menu element (for testing)
 * @internal Exported for testing
 */
export function getContextMenu(): HTMLElement | null {
  return contextMenu
}

/**
 * Handle text selection to show context menu
 * @internal Exported for testing
 */
export function handleTextSelection(_e: MouseEvent): void {
  // Only in Zen mode + Detail view
  if (!document.documentElement.classList.contains('zen-mode')) return

  const selection = window.getSelection()
  const selectedText = selection?.toString().trim()

  if (!selectedText || selectedText.length < 3 || !contextMenu) {
    return
  }

  // Check if selection is within story content or comments
  const range = selection?.getRangeAt(0)
  const container = range?.commonAncestorContainer as HTMLElement
  const parent =
    container?.nodeType === Node.TEXT_NODE ? container.parentElement : container

  const isInComment = parent?.closest('.comment-text, .comment-body')
  const isInArticle = parent?.closest(
    '.article-content, .story-detail-text, .story-detail-content',
  )

  if (!isInComment && !isInArticle) {
    return
  }

  // Store selection info for later use
  contextMenu.dataset.selectedText = selectedText

  // Show/hide Draft Reply button based on whether we're in a comment
  const draftReplyBtn = contextMenu.querySelector(
    '[data-action="draft-reply"]',
  ) as HTMLElement
  if (draftReplyBtn) {
    if (isInComment) {
      draftReplyBtn.style.display = 'flex'
      // Store comment info for draft reply
      const commentEl = parent?.closest('.comment[data-id]') as HTMLElement
      if (commentEl) {
        contextMenu.dataset.commentId = commentEl.dataset.id || ''
        const authorEl = commentEl.querySelector('.comment-author')
        contextMenu.dataset.commentAuthor = authorEl?.textContent || 'unknown'
        const textEl = commentEl.querySelector('.comment-text')
        contextMenu.dataset.commentText =
          textEl?.textContent?.slice(0, 500) || ''
      }
    } else {
      draftReplyBtn.style.display = 'none'
    }
  }

  // Position context menu near the selection
  const rect = range?.getBoundingClientRect()
  if (rect && contextMenu) {
    let left = rect.left + rect.width / 2 - CONTEXT_MENU_WIDTH / 2
    let top = rect.top - CONTEXT_MENU_HEIGHT - 8

    // Keep within viewport
    if (left < 8) left = 8
    if (left + CONTEXT_MENU_WIDTH > window.innerWidth - 8)
      left = window.innerWidth - CONTEXT_MENU_WIDTH - 8
    if (top < 8) top = rect.bottom + 8

    contextMenu.style.left = `${left}px`
    contextMenu.style.top = `${top}px`
    contextMenu.classList.add('visible')
  }
}

/**
 * Hide the context menu
 * @internal Exported for testing
 */
export function hideContextMenu(): void {
  if (contextMenu) {
    contextMenu.classList.remove('visible')
  }
}

/**
 * Handle context menu click actions
 * @internal Exported for testing
 */
export async function handleContextMenuClick(e: MouseEvent): Promise<void> {
  const target = e.target as HTMLElement
  const button = target.closest('[data-action]') as HTMLElement

  if (!button || !contextMenu) return

  e.preventDefault()
  e.stopPropagation()

  const action = button.dataset.action
  const selectedText = contextMenu.dataset.selectedText || ''

  hideContextMenu()

  if (action === 'explain') {
    await handleExplainSelection(selectedText)
  } else if (action === 'draft-reply') {
    await handleDraftReplyFromSelection(
      selectedText,
      contextMenu.dataset.commentAuthor || 'unknown',
      contextMenu.dataset.commentText || '',
    )
  }
}

/**
 * Handle "Explain This" action from context menu
 * @internal Exported for testing
 */
export async function handleExplainSelection(text: string): Promise<void> {
  if (!text || state.isLoading) return

  // Open assistant panel if not already open
  if (!state.isOpen) {
    toggleAssistant()
  }

  // Build context from current story
  let context: string | undefined
  if (state.currentStory) {
    context = `From story: "${state.currentStory.title}"`
  }

  addMessage('user', `Explain: "${text}"`)

  setLoading(true)
  const client = getCopilotClient()
  const response = await client.explain(text, context)
  setLoading(false)

  if (response) {
    addMessage('assistant', response.content)
  } else {
    addMessage('assistant', 'Sorry, I encountered an error. Please try again.')
  }
}

/**
 * Handle "Draft Reply" action from context menu
 * @internal Exported for testing
 */
export async function handleDraftReplyFromSelection(
  selectedText: string,
  commentAuthor: string,
  commentText: string,
): Promise<void> {
  if (state.isLoading) return

  // Open assistant panel if not already open
  if (!state.isOpen) {
    toggleAssistant()
  }

  const storyTitle = state.currentStory?.title || 'this story'

  addMessage('user', `Help me reply to ${commentAuthor}'s comment`)

  const context: ReplyContext = {
    parent_comment: commentText,
    parent_author: commentAuthor,
    story_title: storyTitle,
    user_draft: selectedText.length > 10 ? selectedText : null,
  }

  setLoading(true)
  const client = getCopilotClient()
  const response = await client.draftReply(context)
  setLoading(false)

  if (response) {
    addMessage('assistant', response.content)
  } else {
    addMessage('assistant', 'Sorry, I encountered an error. Please try again.')
  }
}

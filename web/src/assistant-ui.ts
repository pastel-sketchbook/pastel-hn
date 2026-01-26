/**
 * AI Assistant UI component
 *
 * A collapsible frost-blur panel that provides AI-powered reading assistance.
 * See docs/rationale/0006_copilot_ai_assistant.md
 */

import { extractDomain } from './api'
import {
  type CommentSummary,
  type DiscussionContext,
  getCopilotClient,
  type StoryContext,
} from './copilot-client'
import type { CommentWithChildren, HNItem } from './types'

/** Message in the assistant conversation */
interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/** Assistant panel state */
interface AssistantState {
  isOpen: boolean
  isLoading: boolean
  messages: Message[]
  currentStory: HNItem | null
  currentComments: CommentWithChildren[]
}

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
 * Check if assistant is open
 */
export function isAssistantOpen(): boolean {
  return state.isOpen
}

// ============================================================================
// Private Functions
// ============================================================================

async function initializeCopilotIfNeeded(): Promise<void> {
  const client = getCopilotClient()
  if (!client.isInitialized()) {
    await client.init()
  }
}

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
}

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
        <h3>AI Assistant</h3>
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

async function handleSendMessage(): Promise<void> {
  const input = document.getElementById('assistant-input') as HTMLInputElement
  const message = input?.value.trim()

  if (!message || state.isLoading) return

  input.value = ''
  addMessage('user', message)
  await sendToAssistant(message)
}

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

function addMessage(role: 'user' | 'assistant', content: string): void {
  state.messages.push({ role, content, timestamp: Date.now() })
  renderMessages()
}

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

function setLoading(loading: boolean): void {
  state.isLoading = loading
  renderMessages()

  const input = document.getElementById('assistant-input') as HTMLInputElement
  const sendBtn = document.getElementById('assistant-send') as HTMLButtonElement

  if (input) input.disabled = loading
  if (sendBtn) sendBtn.disabled = loading
}

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
      e.preventDefault()
      toggleAssistant()
    }
  })
}

// ============================================================================
// Utility Functions
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

function parseMarkdown(text: string): string {
  let html = escapeHtml(text)

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')

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

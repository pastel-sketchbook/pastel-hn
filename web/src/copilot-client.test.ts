import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Tauri's invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import {
  type AssistantResponse,
  CopilotClient,
  type CopilotStatus,
  type DiscussionContext,
  getCopilotClient,
  type ReplyContext,
  type StoryContext,
} from './copilot-client'

const mockInvoke = vi.mocked(invoke)

// Helper to set up Tauri environment
function setupTauriEnvironment(enabled: boolean) {
  if (enabled) {
    ;(
      window as unknown as { __TAURI_INTERNALS__: object }
    ).__TAURI_INTERNALS__ = {}
  } else {
    delete (window as unknown as { __TAURI_INTERNALS__?: object })
      .__TAURI_INTERNALS__
  }
}

describe('CopilotClient', () => {
  let client: CopilotClient
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    client = new CopilotClient()
    setupTauriEnvironment(true)
    // Suppress console noise from error-handling tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setupTauriEnvironment(false)
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('initial state', () => {
    it('starts not initialized', () => {
      expect(client.isInitialized()).toBe(false)
    })

    it('starts not available', () => {
      expect(client.isAvailable()).toBe(false)
    })

    it('has unavailable default status', () => {
      const status = client.getLastStatus()
      expect(status.available).toBe(false)
      expect(status.running).toBe(false)
    })
  })

  describe('check()', () => {
    it('returns unavailable status when not in Tauri', async () => {
      setupTauriEnvironment(false)

      const status = await client.check()

      expect(status.available).toBe(false)
      expect(status.message).toBe('AI assistant requires the desktop app')
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('invokes copilot_check when in Tauri', async () => {
      const mockStatus: CopilotStatus = {
        available: true,
        running: false,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      }
      mockInvoke.mockResolvedValueOnce(mockStatus)

      const status = await client.check()

      expect(mockInvoke).toHaveBeenCalledWith('copilot_check')
      expect(status).toEqual(mockStatus)
      expect(client.isAvailable()).toBe(true)
      expect(client.getLastStatus()).toEqual(mockStatus)
    })

    it('handles check failure gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('CLI not found'))

      const status = await client.check()

      expect(status.available).toBe(false)
      expect(status.message).toBe('CLI not found')
      expect(client.isAvailable()).toBe(false)
    })

    it('handles non-Error rejection', async () => {
      mockInvoke.mockRejectedValueOnce('Unknown error')

      const status = await client.check()

      expect(status.available).toBe(false)
      expect(status.message).toBe('Check failed')
    })
  })

  describe('init()', () => {
    it('returns unavailable status when not in Tauri', async () => {
      setupTauriEnvironment(false)

      const status = await client.init()

      expect(status.available).toBe(false)
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(client.isInitialized()).toBe(false)
    })

    it('initializes successfully when Copilot is available', async () => {
      const mockStatus: CopilotStatus = {
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Service started',
      }
      mockInvoke.mockResolvedValueOnce(mockStatus)

      const status = await client.init()

      expect(mockInvoke).toHaveBeenCalledWith('copilot_init')
      expect(status).toEqual(mockStatus)
      expect(client.isInitialized()).toBe(true)
      expect(client.isAvailable()).toBe(true)
    })

    it('handles init failure gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Auth failed'))

      const status = await client.init()

      expect(status.available).toBe(false)
      expect(status.message).toBe('Auth failed')
      expect(client.isInitialized()).toBe(false)
    })

    it('handles non-Error rejection', async () => {
      mockInvoke.mockRejectedValueOnce({ code: 'UNKNOWN' })

      const status = await client.init()

      expect(status.message).toBe('Failed to initialize')
    })
  })

  describe('summarize()', () => {
    const storyContext: StoryContext = {
      title: 'Test Story',
      url: 'https://example.com/article',
      domain: 'example.com',
      score: 100,
      comment_count: 50,
      author: 'testuser',
      text: null,
    }

    it('returns null when not available', async () => {
      expect(client.isAvailable()).toBe(false)

      const result = await client.summarize(storyContext)

      expect(result).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('invokes copilot_summarize when available', async () => {
      // First make client available
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      const mockResponse: AssistantResponse = {
        content: 'This article discusses...',
      }
      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await client.summarize(storyContext)

      expect(mockInvoke).toHaveBeenCalledWith('copilot_summarize', {
        context: storyContext,
      })
      expect(result).toEqual(mockResponse)
    })

    it('returns null on error', async () => {
      // Make client available
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockRejectedValueOnce(new Error('API error'))

      const result = await client.summarize(storyContext)

      expect(result).toBeNull()
    })
  })

  describe('analyzeDiscussion()', () => {
    const discussionContext: DiscussionContext = {
      story_title: 'Test Story',
      comment_count: 100,
      top_comments: [
        { author: 'user1', text_preview: 'Great article...', reply_count: 5 },
        { author: 'user2', text_preview: 'I disagree...', reply_count: 3 },
      ],
    }

    it('returns null when not available', async () => {
      const result = await client.analyzeDiscussion(discussionContext)
      expect(result).toBeNull()
    })

    it('invokes copilot_analyze_discussion when available', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      const mockResponse: AssistantResponse = {
        content: 'The discussion centers around...',
      }
      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await client.analyzeDiscussion(discussionContext)

      expect(mockInvoke).toHaveBeenCalledWith('copilot_analyze_discussion', {
        context: discussionContext,
      })
      expect(result).toEqual(mockResponse)
    })

    it('returns null on error', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockRejectedValueOnce(new Error('Timeout'))

      const result = await client.analyzeDiscussion(discussionContext)
      expect(result).toBeNull()
    })
  })

  describe('explain()', () => {
    it('returns null when not available', async () => {
      const result = await client.explain('WebAssembly')
      expect(result).toBeNull()
    })

    it('invokes copilot_explain with text and optional context', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      const mockResponse: AssistantResponse = {
        content: 'WebAssembly is a binary instruction format...',
      }
      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await client.explain('WebAssembly', 'programming article')

      expect(mockInvoke).toHaveBeenCalledWith('copilot_explain', {
        text: 'WebAssembly',
        context: 'programming article',
      })
      expect(result).toEqual(mockResponse)
    })

    it('passes null context when not provided', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockResolvedValueOnce({ content: 'Explanation...' })

      await client.explain('term')

      expect(mockInvoke).toHaveBeenCalledWith('copilot_explain', {
        text: 'term',
        context: null,
      })
    })

    it('returns null on error', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockRejectedValueOnce(new Error('Service unavailable'))

      const result = await client.explain('term')
      expect(result).toBeNull()
    })
  })

  describe('draftReply()', () => {
    const replyContext: ReplyContext = {
      parent_comment: 'I think this approach is flawed because...',
      parent_author: 'critic',
      story_title: 'New Framework Released',
      user_draft: 'I would argue that',
    }

    it('returns null when not available', async () => {
      const result = await client.draftReply(replyContext)
      expect(result).toBeNull()
    })

    it('invokes copilot_draft_reply when available', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      const mockResponse: AssistantResponse = {
        content: 'I would argue that the benefits outweigh...',
      }
      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await client.draftReply(replyContext)

      expect(mockInvoke).toHaveBeenCalledWith('copilot_draft_reply', {
        context: replyContext,
      })
      expect(result).toEqual(mockResponse)
    })

    it('returns null on error', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockRejectedValueOnce(new Error('Rate limited'))

      const result = await client.draftReply(replyContext)
      expect(result).toBeNull()
    })
  })

  describe('ask()', () => {
    it('returns null when not available', async () => {
      const result = await client.ask('What is Rust?')
      expect(result).toBeNull()
    })

    it('invokes copilot_ask when available', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      const mockResponse: AssistantResponse = {
        content: 'Rust is a systems programming language...',
      }
      mockInvoke.mockResolvedValueOnce(mockResponse)

      const result = await client.ask('What is Rust?')

      expect(mockInvoke).toHaveBeenCalledWith('copilot_ask', {
        prompt: 'What is Rust?',
      })
      expect(result).toEqual(mockResponse)
    })

    it('returns null on error', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockRejectedValueOnce(new Error('Connection lost'))

      const result = await client.ask('question')
      expect(result).toBeNull()
    })
  })

  describe('shutdown()', () => {
    it('does nothing when not in Tauri', async () => {
      setupTauriEnvironment(false)

      await client.shutdown()

      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('does nothing when not initialized', async () => {
      await client.shutdown()

      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('invokes copilot_shutdown when initialized', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockResolvedValueOnce(undefined)

      await client.shutdown()

      expect(mockInvoke).toHaveBeenCalledWith('copilot_shutdown')
      expect(client.isAvailable()).toBe(false)
      expect(client.isInitialized()).toBe(false)
    })

    it('handles shutdown error gracefully', async () => {
      mockInvoke.mockResolvedValueOnce({
        available: true,
        running: true,
        cli_installed: true,
        cli_authenticated: true,
        message: 'Ready',
      })
      await client.init()

      mockInvoke.mockRejectedValueOnce(new Error('Shutdown failed'))

      // Should not throw
      await expect(client.shutdown()).resolves.toBeUndefined()
    })
  })
})

describe('getCopilotClient', () => {
  it('returns a singleton instance', () => {
    const client1 = getCopilotClient()
    const client2 = getCopilotClient()

    expect(client1).toBe(client2)
    expect(client1).toBeInstanceOf(CopilotClient)
  })
})

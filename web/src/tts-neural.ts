/**
 * Neural TTS client for Piper via Tauri backend
 *
 * This module provides:
 * - High-quality neural voice synthesis
 * - Model download management
 * - Progress tracking for downloads
 * - Automatic fallback to native TTS
 *
 * @module tts-neural
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Debug flag for logging
const DEBUG = false

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[NeuralTTS]', ...args)
  }
}

function debugError(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[NeuralTTS]', ...args)
  }
}

/** Information about a neural voice */
export interface NeuralVoiceInfo {
  id: string
  name: string
  language: string
  description?: string
}

/** Neural TTS status response */
export interface NeuralTtsStatus {
  available: boolean
  isSpeaking: boolean
  currentVoice: string | null
  rate: number
  downloadProgress: number | null
  voices: NeuralVoiceInfo[]
  message: string | null
}

/** Model download progress event */
export interface ModelDownloadProgress {
  modelId: string
  progress: number
  bytesDownloaded: number
  totalBytes: number
}

/** Model information */
export interface ModelInfo {
  id: string
  name: string
  sizeMb: number
  description: string
  isDownloaded: boolean
}

/** Neural TTS preferences */
export interface NeuralTtsPreferences {
  enabled: boolean
  preferredVoiceId: string
  rate: number
  autoDownload: boolean
  useFallbackOnError: boolean
}

/** Sentence event types from the backend */
export type SentenceEvent =
  | { type: 'start'; index: number; text: string }
  | { type: 'end'; index: number }
  | { type: 'finished' }
  | { type: 'stopped' }

/** Callback for sentence events */
export type SentenceEventCallback = (event: SentenceEvent) => void

/** Unavailable status for non-Tauri environments */
const UNAVAILABLE_STATUS: NeuralTtsStatus = {
  available: false,
  isSpeaking: false,
  currentVoice: null,
  rate: 1.0,
  downloadProgress: null,
  voices: [],
  message: 'Neural TTS requires the desktop app',
}

/** Default preferences */
const DEFAULT_PREFERENCES: NeuralTtsPreferences = {
  enabled: true,
  preferredVoiceId: 'piper-en-us',
  rate: 1.0,
  autoDownload: false,
  useFallbackOnError: true,
}

/** Storage key for preferences */
const PREFERENCES_KEY = 'tts-neural-preferences'

/** Check if running in Tauri */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Neural TTS client class
 *
 * Wraps Tauri commands for neural voice synthesis with Piper.
 * Provides automatic fallback to native TTS when neural is unavailable.
 */
export class NeuralTtsClient {
  private initialized = false
  private status: NeuralTtsStatus = UNAVAILABLE_STATUS
  private preferences: NeuralTtsPreferences = { ...DEFAULT_PREFERENCES }
  private downloadProgressListeners: Set<
    (progress: ModelDownloadProgress) => void
  > = new Set()
  private sentenceEventListeners: Set<SentenceEventCallback> = new Set()
  private unlistenFn: UnlistenFn | null = null
  private sentenceUnlistenFn: UnlistenFn | null = null

  /** Check if neural TTS is available */
  isAvailable(): boolean {
    return this.status.available
  }

  /** Check if currently speaking */
  isSpeaking(): boolean {
    return this.status.isSpeaking
  }

  /** Get current status */
  getStatus(): NeuralTtsStatus {
    return this.status
  }

  /** Get current preferences */
  getPreferences(): NeuralTtsPreferences {
    return { ...this.preferences }
  }

  /** Check if initialized */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Initialize the neural TTS client
   * @returns Status indicating whether neural TTS is available
   */
  async init(): Promise<NeuralTtsStatus> {
    debug(
      'init() called, isTauri:',
      isTauri(),
      'already initialized:',
      this.initialized,
    )

    if (!isTauri()) {
      debug('Not in Tauri environment, returning unavailable')
      this.status = UNAVAILABLE_STATUS
      return this.status
    }

    if (this.initialized) {
      debug('Already initialized, returning current status')
      return this.status
    }

    try {
      // Load preferences
      debug('Loading preferences...')
      this.loadPreferences()

      // Initialize neural TTS backend
      debug('Calling tts_neural_init command...')
      await invoke('tts_neural_init')
      debug('tts_neural_init completed')
      this.initialized = true

      // Get current status
      debug('Fetching status...')
      this.status = await this.fetchStatus()
      debug('Status fetched:', this.status)

      // Set up download progress listener
      debug('Setting up progress listener...')
      await this.setupProgressListener()

      return this.status
    } catch (error) {
      console.error('[NeuralTTS] Failed to initialize neural TTS:', error)
      if (error instanceof Error) {
        console.error('[NeuralTTS] Error message:', error.message)
      }
      this.status = {
        ...UNAVAILABLE_STATUS,
        message:
          error instanceof Error ? error.message : 'Failed to initialize',
      }
      return this.status
    }
  }

  /**
   * Get current neural TTS status from backend
   */
  async fetchStatus(): Promise<NeuralTtsStatus> {
    if (!isTauri()) {
      return UNAVAILABLE_STATUS
    }

    try {
      const status = await invoke<NeuralTtsStatus>('tts_neural_status')
      this.status = status
      return status
    } catch (error) {
      debugError('Failed to get neural TTS status:', error)
      return UNAVAILABLE_STATUS
    }
  }

  /**
   * Get list of available neural voices
   */
  async getVoices(): Promise<NeuralVoiceInfo[]> {
    if (!isTauri()) {
      return []
    }

    try {
      const voices = await invoke<NeuralVoiceInfo[]>('tts_neural_voices')
      return voices
    } catch (error) {
      console.error('[NeuralTTS] Failed to get neural voices:', error)
      return []
    }
  }

  /**
   * Get list of available models with download status
   */
  async getModels(): Promise<ModelInfo[]> {
    const voices = await this.getVoices()
    const models: ModelInfo[] = []

    for (const voice of voices) {
      const modelId = this.voiceToModelId(voice.id)
      const isDownloaded = await this.isModelReady(modelId)

      models.push({
        id: modelId,
        name: voice.name,
        sizeMb: modelId === 'piper-en-us' ? 63 : 50,
        description: voice.description || '',
        isDownloaded,
      })
    }

    return models
  }

  /**
   * Check if a model is downloaded and ready
   */
  async isModelReady(modelId: string): Promise<boolean> {
    if (!isTauri()) {
      return false
    }

    try {
      return await invoke<boolean>('tts_is_model_ready', { modelId })
    } catch (error) {
      console.error('[NeuralTTS] Failed to check model status:', error)
      return false
    }
  }

  /**
   * Download a neural voice model
   * @param modelId - Model to download (e.g., "piper-en-us")
   * @param onProgress - Optional callback for download progress
   */
  async downloadModel(
    modelId: string,
    onProgress?: (progress: ModelDownloadProgress) => void,
  ): Promise<boolean> {
    if (!isTauri()) {
      return false
    }

    // Add progress listener if provided
    if (onProgress) {
      this.downloadProgressListeners.add(onProgress)
    }

    try {
      await invoke('tts_download_model', { modelId })

      // Update status after download
      this.status = await this.fetchStatus()

      return true
    } catch (error) {
      console.error('[NeuralTTS] Failed to download model:', modelId, error)
      return false
    } finally {
      // Remove progress listener
      if (onProgress) {
        this.downloadProgressListeners.delete(onProgress)
      }
    }
  }

  /**
   * Speak text using neural TTS
   * The backend will load the model if downloaded but not yet loaded.
   * Falls back to native TTS if neural is unavailable and fallback is enabled.
   * @param text - Text to speak
   * @param voiceId - Optional voice ID (uses preference if not specified)
   */
  async speak(text: string, voiceId?: string): Promise<boolean> {
    debug(
      'speak() called, text length:',
      text?.length || 0,
      'isTauri:',
      isTauri(),
    )

    if (!isTauri()) {
      debug('Not available - not in Tauri environment')
      return false
    }

    // Ensure initialized
    if (!this.initialized) {
      debug('Not initialized, initializing now...')
      await this.init()
      debug('After init - available:', this.status.available)
    }

    try {
      const selectedVoice = voiceId || this.preferences.preferredVoiceId
      debug(
        'Calling tts_neural_speak with voice:',
        selectedVoice,
        'text length:',
        text.length,
      )

      // The Rust backend handles model loading and fallback internally
      await invoke('tts_neural_speak', {
        text,
        voiceId: selectedVoice,
        rate: this.preferences.rate,
      })

      this.status.isSpeaking = true
      debug('tts_neural_speak completed successfully')
      return true
    } catch (error) {
      this.status.isSpeaking = false
      debugError('Failed to speak with neural TTS:', error)
      debugError('Error type:', typeof error)
      if (error instanceof Error) {
        debugError('Error message:', error.message)
        debugError('Error stack:', error.stack)
      }

      // Fall back to native TTS if enabled (for cases where Rust backend also failed)
      if (this.preferences.useFallbackOnError) {
        debug('Falling back to native TTS')
        try {
          const { getTtsClient } = await import('./tts-client')
          const nativeClient = getTtsClient()
          const fallbackResult = await nativeClient.speak(text, true)
          debug('Native fallback result:', fallbackResult)
          return fallbackResult
        } catch (fallbackError) {
          debugError('Native fallback also failed:', fallbackError)
          return false
        }
      }

      return false
    }
  }

  /**
   * Stop neural TTS playback
   */
  async stop(): Promise<boolean> {
    if (!isTauri()) {
      return false
    }

    try {
      await invoke('tts_neural_stop')
      this.status.isSpeaking = false
      return true
    } catch (error) {
      debugError('Failed to stop neural TTS:', error)
      return false
    }
  }

  /**
   * Speak sentences one-by-one with progress events
   *
   * This method processes each sentence individually, emitting events
   * when each sentence starts and ends. Use this for sentence highlighting.
   *
   * @param sentences - Array of sentences to speak
   * @param onSentenceEvent - Callback for sentence events
   * @param voiceId - Optional voice ID (uses preference if not specified)
   * @returns true if started successfully
   */
  async speakSentences(
    sentences: string[],
    onSentenceEvent: SentenceEventCallback,
    voiceId?: string,
  ): Promise<boolean> {
    debug(
      'speakSentences() called, sentences:',
      sentences.length,
      'isTauri:',
      isTauri(),
    )

    if (!isTauri()) {
      debug('Not available - not in Tauri environment')
      return false
    }

    // Ensure initialized
    if (!this.initialized) {
      debug('Not initialized, initializing now...')
      await this.init()
      debug('After init - available:', this.status.available)
    }

    // Set up sentence event listener
    await this.setupSentenceEventListener(onSentenceEvent)

    try {
      const selectedVoice = voiceId || this.preferences.preferredVoiceId
      debug(
        'Calling tts_neural_speak_sentences with voice:',
        selectedVoice,
        'sentences:',
        sentences.length,
      )

      this.status.isSpeaking = true

      // The Rust backend handles model loading and emits events
      await invoke('tts_neural_speak_sentences', {
        sentences,
        voiceId: selectedVoice,
        rate: this.preferences.rate,
      })

      this.status.isSpeaking = false
      debug('tts_neural_speak_sentences completed successfully')
      return true
    } catch (error) {
      this.status.isSpeaking = false
      debugError('Failed to speak sentences with neural TTS:', error)

      // Clean up listener
      await this.cleanupSentenceEventListener()

      return false
    }
  }

  /**
   * Add a listener for sentence events
   * @param callback - Function to call when sentence events occur
   */
  addSentenceEventListener(callback: SentenceEventCallback): void {
    this.sentenceEventListeners.add(callback)
  }

  /**
   * Remove a sentence event listener
   * @param callback - The callback to remove
   */
  removeSentenceEventListener(callback: SentenceEventCallback): void {
    this.sentenceEventListeners.delete(callback)
  }

  /**
   * Set up event listener for sentence events from backend
   */
  private async setupSentenceEventListener(
    callback: SentenceEventCallback,
  ): Promise<void> {
    if (!isTauri()) return

    // Clean up existing listener if any
    await this.cleanupSentenceEventListener()

    // Add the callback
    this.sentenceEventListeners.add(callback)

    try {
      // Listen for sentence events
      this.sentenceUnlistenFn = await listen<SentenceEvent>(
        'tts-sentence',
        (event) => {
          // Always log for debugging timing issues
          console.log(
            '[NeuralTTS] Event received:',
            event.payload.type,
            'index' in event.payload ? `index=${event.payload.index}` : '',
            'at',
            Date.now(),
          )

          // Notify all registered listeners
          this.sentenceEventListeners.forEach((listener) => {
            listener(event.payload)
          })

          // Clean up when finished or stopped
          if (
            event.payload.type === 'finished' ||
            event.payload.type === 'stopped'
          ) {
            this.status.isSpeaking = false
            // Remove the callback after completion
            this.sentenceEventListeners.delete(callback)
          }
        },
      )
    } catch (error) {
      debugError('Failed to setup sentence event listener:', error)
    }
  }

  /**
   * Clean up sentence event listener
   */
  private async cleanupSentenceEventListener(): Promise<void> {
    if (this.sentenceUnlistenFn) {
      this.sentenceUnlistenFn()
      this.sentenceUnlistenFn = null
    }
  }

  /**
   * Set speech rate
   * @param rate - Rate from 0.5 to 2.0 (1.0 is normal)
   */
  async setRate(rate: number): Promise<boolean> {
    const clampedRate = Math.max(0.5, Math.min(2.0, rate))
    this.preferences.rate = clampedRate
    this.savePreferences()
    return true
  }

  /**
   * Set preferred voice
   * @param voiceId - Voice ID to use
   */
  setVoice(voiceId: string): void {
    this.preferences.preferredVoiceId = voiceId
    this.savePreferences()
  }

  /**
   * Enable or disable neural TTS
   * @param enabled - Whether to use neural TTS when available
   */
  setEnabled(enabled: boolean): void {
    this.preferences.enabled = enabled
    this.savePreferences()
  }

  /**
   * Delete a model to free disk space
   * @param modelId - Model to delete
   */
  async deleteModel(modelId: string): Promise<boolean> {
    if (!isTauri()) {
      return false
    }

    try {
      await invoke('tts_delete_model', { modelId })

      // Update status
      this.status = await this.fetchStatus()

      return true
    } catch (error) {
      debugError('Failed to delete model:', error)
      return false
    }
  }

  /**
   * Get model directory path
   */
  async getModelDirectory(): Promise<string | null> {
    if (!isTauri()) {
      return null
    }

    try {
      return await invoke<string>('tts_model_directory')
    } catch (error) {
      debugError('Failed to get model directory:', error)
      return null
    }
  }

  /**
   * Get total disk usage for models
   */
  async getDiskUsage(): Promise<number> {
    if (!isTauri()) {
      return 0
    }

    try {
      return await invoke<number>('tts_model_disk_usage')
    } catch (error) {
      debugError('Failed to get disk usage:', error)
      return 0
    }
  }

  /**
   * Convert voice ID to model ID
   */
  private voiceToModelId(voiceId: string): string {
    if (voiceId.startsWith('piper')) {
      return 'piper-en-us'
    }
    return voiceId
  }

  /**
   * Set up event listener for download progress
   */
  private async setupProgressListener(): Promise<void> {
    if (!isTauri()) return

    try {
      // Listen for download progress events
      this.unlistenFn = await listen<ModelDownloadProgress>(
        'tts-download-progress',
        (event) => {
          // Notify all registered listeners
          this.downloadProgressListeners.forEach((listener) => {
            listener(event.payload)
          })

          // Update status if complete
          if (event.payload.progress >= 100) {
            this.fetchStatus().catch(() => {
              // Ignore errors during status update
            })
          }
        },
      )
    } catch (error) {
      debugError('Failed to setup progress listener:', error)
    }
  }

  /**
   * Save preferences to localStorage
   */
  private savePreferences(): void {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences))
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Load preferences from localStorage
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        this.preferences = { ...DEFAULT_PREFERENCES, ...parsed }
      }
    } catch {
      // Use defaults on error
      this.preferences = { ...DEFAULT_PREFERENCES }
    }
  }

  /**
   * Clean up resources
   */
  async destroy(): Promise<void> {
    if (this.unlistenFn) {
      this.unlistenFn()
      this.unlistenFn = null
    }

    await this.cleanupSentenceEventListener()

    this.downloadProgressListeners.clear()
    this.sentenceEventListeners.clear()
  }
}

// Singleton instance
let neuralClient: NeuralTtsClient | null = null

/**
 * Get the neural TTS client singleton
 */
export function getNeuralTtsClient(): NeuralTtsClient {
  if (!neuralClient) {
    neuralClient = new NeuralTtsClient()
  }
  return neuralClient
}

/**
 * Check if neural TTS is supported in current environment
 */
export function isNeuralTtsSupported(): boolean {
  return isTauri()
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

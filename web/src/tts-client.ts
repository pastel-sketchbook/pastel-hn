/**
 * Text-to-Speech client for Tauri backend
 *
 * This module provides text-to-speech functionality using the system's native
 * speech synthesis (macOS, Windows, Linux). Features include:
 * - Zero cost (uses free OS-provided voices)
 * - Offline support
 * - Voice selection
 * - Speech rate control
 * - Playback control (speak, stop)
 *
 * @module tts-client
 */

import { invoke } from '@tauri-apps/api/core'

/** Information about an available voice */
export interface VoiceInfo {
  /** Voice identifier (platform-specific) */
  id: string
  /** Human-readable voice name */
  name: string
  /** Language code (e.g., "en-US") */
  language: string | null
}

/** TTS service status */
export interface TtsStatus {
  /** Whether TTS is available on this system */
  available: boolean
  /** Whether TTS is currently speaking */
  is_speaking: boolean
  /** Current speech rate (0.0 - 1.0, where 0.5 is normal) */
  rate: number
  /** Supported features on this platform */
  features: TtsFeatures
  /** Error message if not available */
  message: string | null
}

/** Platform-specific TTS features */
export interface TtsFeatures {
  stop: boolean
  rate: boolean
  pitch: boolean
  volume: boolean
  is_speaking: boolean
  voice: boolean
  utterance_callbacks: boolean
}

/** Default unavailable status for non-Tauri environments */
const UNAVAILABLE_STATUS: TtsStatus = {
  available: false,
  is_speaking: false,
  rate: 0.5,
  features: {
    stop: false,
    rate: false,
    pitch: false,
    volume: false,
    is_speaking: false,
    voice: false,
    utterance_callbacks: false,
  },
  message: 'TTS requires the desktop app',
}

/** Check if running in Tauri */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * TTS client for text-to-speech functionality
 *
 * Uses native OS speech synthesis for free, offline text-to-speech.
 */
export class TtsClient {
  private initialized = false
  private available = false
  private lastStatus: TtsStatus = UNAVAILABLE_STATUS
  private voices: VoiceInfo[] = []
  private selectedVoiceId: string | null = null
  private currentRate: number = 0.5

  /** Check if TTS is available */
  isAvailable(): boolean {
    return this.available
  }

  /** Get the last known status */
  getLastStatus(): TtsStatus {
    return this.lastStatus
  }

  /** Check if initialized */
  isInitialized(): boolean {
    return this.initialized
  }

  /** Get available voices */
  getVoices(): VoiceInfo[] {
    return this.voices
  }

  /** Get current speech rate */
  getRate(): number {
    return this.currentRate
  }

  /** Get selected voice ID */
  getSelectedVoiceId(): string | null {
    return this.selectedVoiceId
  }

  /**
   * Initialize the TTS engine
   * @returns Status indicating whether TTS is available
   */
  async init(): Promise<TtsStatus> {
    if (!isTauri()) {
      this.lastStatus = UNAVAILABLE_STATUS
      return this.lastStatus
    }

    try {
      await invoke('tts_init')
      this.initialized = true

      // Get status and voices
      const status = await this.getStatus()
      if (status.available) {
        this.voices = await this.fetchVoices()

        // Load saved preferences
        this.loadPreferences()
      }

      return status
    } catch (error) {
      console.error('Failed to initialize TTS:', error)
      this.lastStatus = {
        ...UNAVAILABLE_STATUS,
        message:
          error instanceof Error ? error.message : 'Failed to initialize',
      }
      return this.lastStatus
    }
  }

  /**
   * Get current TTS status
   */
  async getStatus(): Promise<TtsStatus> {
    if (!isTauri()) {
      return UNAVAILABLE_STATUS
    }

    try {
      const status = await invoke<TtsStatus>('tts_status')
      this.available = status.available
      this.lastStatus = status
      this.currentRate = status.rate
      return status
    } catch (error) {
      console.error('Failed to get TTS status:', error)
      return UNAVAILABLE_STATUS
    }
  }

  /**
   * Speak the given text
   * @param text - Text to speak
   * @param interrupt - If true, stops any current speech first
   */
  async speak(text: string, interrupt: boolean = true): Promise<boolean> {
    if (!isTauri() || !this.available) {
      console.warn('TTS not available')
      return false
    }

    try {
      await invoke('tts_speak', { text, interrupt })
      return true
    } catch (error) {
      console.error('Failed to speak:', error)
      return false
    }
  }

  /**
   * Stop any current speech
   */
  async stop(): Promise<boolean> {
    if (!isTauri() || !this.available) {
      return false
    }

    try {
      await invoke('tts_stop')
      return true
    } catch (error) {
      console.error('Failed to stop TTS:', error)
      return false
    }
  }

  /**
   * Fetch available voices from the system
   */
  private async fetchVoices(): Promise<VoiceInfo[]> {
    if (!isTauri()) {
      return []
    }

    try {
      const voices = await invoke<VoiceInfo[]>('tts_get_voices')
      return voices
    } catch (error) {
      console.error('Failed to get voices:', error)
      return []
    }
  }

  /**
   * Set the active voice
   * @param voiceId - Voice ID from getVoices()
   */
  async setVoice(voiceId: string): Promise<boolean> {
    if (!isTauri() || !this.available) {
      return false
    }

    try {
      await invoke('tts_set_voice', { voiceId })
      this.selectedVoiceId = voiceId
      this.savePreferences()
      return true
    } catch (error) {
      console.error('Failed to set voice:', error)
      return false
    }
  }

  /**
   * Set the speech rate
   * @param rate - Rate from 0.0 to 1.0 (0.5 is normal)
   */
  async setRate(rate: number): Promise<boolean> {
    if (!isTauri() || !this.available) {
      return false
    }

    // Clamp rate to valid range
    const clampedRate = Math.max(0.0, Math.min(1.0, rate))

    try {
      await invoke('tts_set_rate', { rate: clampedRate })
      this.currentRate = clampedRate
      this.savePreferences()
      return true
    } catch (error) {
      console.error('Failed to set rate:', error)
      return false
    }
  }

  /**
   * Save TTS preferences to localStorage
   */
  private savePreferences(): void {
    try {
      const prefs = {
        voiceId: this.selectedVoiceId,
        rate: this.currentRate,
      }
      localStorage.setItem('tts-preferences', JSON.stringify(prefs))
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Load TTS preferences from localStorage
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem('tts-preferences')
      if (stored) {
        const prefs = JSON.parse(stored)
        if (prefs.voiceId && this.voices.some((v) => v.id === prefs.voiceId)) {
          this.setVoice(prefs.voiceId)
        }
        if (typeof prefs.rate === 'number') {
          this.setRate(prefs.rate)
        }
      }
    } catch {
      // Ignore storage errors
    }
  }
}

// Singleton instance
let ttsClient: TtsClient | null = null

/**
 * Get the TTS client singleton
 */
export function getTtsClient(): TtsClient {
  if (!ttsClient) {
    ttsClient = new TtsClient()
  }
  return ttsClient
}

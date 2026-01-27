/**
 * Text-to-Speech UI controls
 *
 * Provides a floating TTS control panel for reading articles aloud.
 * Features:
 * - Play/Stop button
 * - Speed control slider
 * - Voice selection dropdown
 *
 * @module tts-ui
 */

import { icons } from './icons'
import { getTtsClient, type VoiceInfo } from './tts-client'

/** TTS UI state */
interface TtsUiState {
  isInitialized: boolean
  isPlaying: boolean
  currentText: string | null
}

const state: TtsUiState = {
  isInitialized: false,
  isPlaying: false,
  currentText: null,
}

/**
 * Initialize TTS UI
 * Call this on app startup to check TTS availability
 */
export async function initTtsUi(): Promise<boolean> {
  const client = getTtsClient()
  const status = await client.init()

  if (status.available) {
    state.isInitialized = true
    console.log('TTS initialized successfully')
    return true
  } else {
    console.log('TTS not available:', status.message)
    return false
  }
}

/**
 * Check if TTS is available
 */
export function isTtsAvailable(): boolean {
  return state.isInitialized && getTtsClient().isAvailable()
}

/**
 * Check if TTS is currently playing
 */
export function isTtsPlaying(): boolean {
  return state.isPlaying
}

/**
 * Create the TTS control button HTML
 * Always shows the button - it will initialize TTS on first click if needed
 * @param isPlaying - Whether TTS is currently playing
 */
export function createTtsButton(isPlaying: boolean = false): string {
  const icon = isPlaying ? icons.speakerOff : icons.speaker
  const label = isPlaying ? 'Stop Reading' : 'Read Aloud'
  const title = isPlaying ? 'Stop text-to-speech' : 'Read article aloud (uses system voice)'

  return `
    <button class="story-action-btn tts-btn${isPlaying ? ' playing' : ''}" 
            data-action="tts-toggle" 
            title="${title}"
            aria-pressed="${isPlaying}">
      ${icon}
      <span>${label}</span>
    </button>
  `
}

/**
 * Create the TTS settings panel HTML
 */
export function createTtsSettingsPanel(): string {
  if (!isTtsAvailable()) {
    return ''
  }

  const client = getTtsClient()
  const voices = client.getVoices()
  const currentRate = client.getRate()
  const selectedVoiceId = client.getSelectedVoiceId()

  // Filter to English voices for better UX (can be expanded later)
  const englishVoices = voices.filter(
    (v) => !v.language || v.language.startsWith('en'),
  )
  const displayVoices = englishVoices.length > 0 ? englishVoices : voices

  const voiceOptions = displayVoices
    .map(
      (v) =>
        `<option value="${v.id}"${v.id === selectedVoiceId ? ' selected' : ''}>${v.name}${v.language ? ` (${v.language})` : ''}</option>`,
    )
    .join('')

  // Convert rate (0-1) to percentage for display
  const ratePercent = Math.round(currentRate * 200) // 0.5 = 100%

  return `
    <div class="tts-settings" id="tts-settings">
      <div class="tts-settings-header">
        <span>Text-to-Speech Settings</span>
        <button class="tts-settings-close" data-action="tts-settings-close" aria-label="Close settings">
          <svg viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="tts-setting-row">
        <label for="tts-voice">Voice</label>
        <select id="tts-voice" class="tts-voice-select">
          ${voiceOptions}
        </select>
      </div>
      <div class="tts-setting-row">
        <label for="tts-rate">Speed: <span id="tts-rate-value">${ratePercent}%</span></label>
        <input type="range" id="tts-rate" class="tts-rate-slider" 
               min="0" max="100" value="${currentRate * 100}" 
               aria-label="Speech rate">
      </div>
    </div>
  `
}

/**
 * Start reading text aloud
 * Initializes TTS on first use if needed
 * @param text - Text to read
 */
export async function startReading(text: string): Promise<boolean> {
  // Initialize TTS on first use if needed
  if (!state.isInitialized) {
    const success = await initTtsUi()
    if (!success) {
      console.warn('TTS not available on this system')
      return false
    }
  }

  if (!isTtsAvailable()) {
    return false
  }

  const client = getTtsClient()
  const success = await client.speak(text, true)

  if (success) {
    state.isPlaying = true
    state.currentText = text
    updateTtsButtonState(true)
  }

  return success
}

/**
 * Stop reading
 */
export async function stopReading(): Promise<boolean> {
  state.isPlaying = false
  state.currentText = null
  updateTtsButtonState(false)

  if (!isTtsAvailable()) {
    return true // Already stopped/not playing
  }

  const client = getTtsClient()
  await client.stop()

  return true
}

/**
 * Toggle reading state
 * @param text - Text to read (only used when starting)
 */
export async function toggleReading(text: string): Promise<boolean> {
  if (state.isPlaying) {
    return stopReading()
  } else {
    return startReading(text)
  }
}

/**
 * Update TTS button visual state
 */
function updateTtsButtonState(isPlaying: boolean): void {
  const buttons = document.querySelectorAll('.tts-btn')
  buttons.forEach((btn) => {
    const button = btn as HTMLButtonElement
    button.classList.toggle('playing', isPlaying)
    button.setAttribute('aria-pressed', String(isPlaying))
    button.title = isPlaying ? 'Stop text-to-speech' : 'Read article aloud'

    const icon = button.querySelector('svg')
    if (icon) {
      icon.outerHTML = isPlaying ? icons.speakerOff : icons.speaker
    }

    const label = button.querySelector('span')
    if (label) {
      label.textContent = isPlaying ? 'Stop Reading' : 'Read Aloud'
    }
  })
}

/**
 * Handle TTS voice change
 */
export async function handleVoiceChange(voiceId: string): Promise<void> {
  const client = getTtsClient()
  await client.setVoice(voiceId)
}

/**
 * Handle TTS rate change
 */
export async function handleRateChange(rate: number): Promise<void> {
  const client = getTtsClient()
  // Convert from slider value (0-100) to rate (0-1)
  const normalizedRate = rate / 100
  await client.setRate(normalizedRate)

  // Update display
  const rateValue = document.getElementById('tts-rate-value')
  if (rateValue) {
    rateValue.textContent = `${Math.round(normalizedRate * 200)}%`
  }
}

/**
 * Extract readable text from an article container
 * @param container - DOM element containing article content
 */
export function extractArticleText(container: HTMLElement): string {
  // Clone to avoid modifying the original
  const clone = container.cloneNode(true) as HTMLElement

  // Remove elements that shouldn't be read
  const removeSelectors = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    '.article-loading',
    '.skeleton',
    'button',
    '.tts-settings',
  ]
  removeSelectors.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((el) => {
      el.remove()
    })
  })

  // Get text content and clean it up
  let text = clone.textContent || ''

  // Clean up whitespace
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()

  return text
}

/**
 * Setup TTS event listeners for a container
 */
export function setupTtsListeners(container: HTMLElement): void {
  // TTS toggle button
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const action = target.closest('[data-action]')?.getAttribute('data-action')

    if (action === 'tts-toggle') {
      e.preventDefault()
      const articleContent =
        container.querySelector('.article-content') ||
        container.querySelector('.story-detail-text')

      if (articleContent) {
        const text = extractArticleText(articleContent as HTMLElement)
        if (text) {
          await toggleReading(text)
        }
      }
    }

    if (action === 'tts-settings-close') {
      const settings = document.getElementById('tts-settings')
      settings?.classList.remove('open')
    }
  })

  // Voice selection
  container.addEventListener('change', async (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'tts-voice') {
      const select = target as HTMLSelectElement
      await handleVoiceChange(select.value)
    }
  })

  // Rate slider
  container.addEventListener('input', async (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'tts-rate') {
      const slider = target as HTMLInputElement
      await handleRateChange(Number(slider.value))
    }
  })
}

/**
 * Get available voices (for external use)
 */
export function getAvailableVoices(): VoiceInfo[] {
  return getTtsClient().getVoices()
}

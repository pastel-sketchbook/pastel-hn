/**
 * Text-to-Speech UI controls
 *
 * Provides a floating TTS control panel for reading articles aloud.
 * Features:
 * - Play/Stop button
 * - Speed control slider
 * - Voice selection dropdown (native and neural)
 * - Neural TTS model download UI
 * - Automatic fallback between native and neural
 *
 * @module tts-ui
 */

import { icons } from './icons'

// Debug flag for logging
const DEBUG = false

function debug(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[TTS]', ...args)
  }
}

function debugError(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[TTS]', ...args)
  }
}

import { toastError, toastInfo, toastWarning } from './toast'
import { getTtsClient, type VoiceInfo } from './tts-client'
import {
  getNeuralTtsClient,
  isNeuralTtsSupported,
  type ModelDownloadProgress,
  type ModelInfo,
  type SentenceEvent,
} from './tts-neural'

/** Unified voice info that works for both native and neural */
export interface UnifiedVoiceInfo {
  id: string
  name: string
  language: string | null
  type: 'native' | 'neural'
  description?: string
  modelId?: string
  isDownloaded?: boolean
  sizeMb?: number
}

/** TTS UI state */
interface TtsUiState {
  isInitialized: boolean
  isPlaying: boolean
  currentText: string | null
  useNeural: boolean
  neuralAvailable: boolean
  nativeAvailable: boolean
  downloadProgress: number | null
  isDownloading: boolean
  unifiedVoices: UnifiedVoiceInfo[]
  selectedVoiceId: string | null
  models: ModelInfo[]
  /** Current sentence index being spoken (for highlighting) */
  currentSentenceIndex: number | null
  /** Array of sentence texts for the current reading session */
  sentences: string[]
}

const state: TtsUiState = {
  isInitialized: false,
  isPlaying: false,
  currentText: null,
  useNeural: true,
  neuralAvailable: false,
  nativeAvailable: false,
  downloadProgress: null,
  isDownloading: false,
  unifiedVoices: [],
  selectedVoiceId: null,
  models: [],
  currentSentenceIndex: null,
  sentences: [],
}

/** Get the native TTS client */
function getNativeClient() {
  return getTtsClient()
}

/** Get the neural TTS client */
function getNeuralClient() {
  return getNeuralTtsClient()
}

/**
 * Initialize TTS UI
 * Call this on app startup to check TTS availability
 */
export async function initTtsUi(): Promise<boolean> {
  console.log(
    '[TTS] initTtsUi() called, already initialized:',
    state.isInitialized,
  )

  if (state.isInitialized) {
    debug('Already initialized, returning true')
    return true
  }

  try {
    // Initialize native TTS
    debug('Initializing native TTS client...')
    const nativeClient = getNativeClient()
    const nativeStatus = await nativeClient.init()
    state.nativeAvailable = nativeStatus.available
    debug('Native TTS status:', nativeStatus)

    // Initialize neural TTS if supported
    debug('Checking neural TTS support:', isNeuralTtsSupported())
    if (isNeuralTtsSupported()) {
      debug('Neural TTS is supported, initializing...')
      const neuralClient = getNeuralClient()
      debug('Got neural client, calling init()...')
      const neuralStatus = await neuralClient.init()
      state.neuralAvailable = neuralStatus.available
      console.log(
        '[TTS] Neural TTS status:',
        neuralStatus,
        'available:',
        neuralStatus.available,
      )

      // Note: init() already called fetchStatus() internally, so we don't
      // need to call it again here. The status is available in neuralStatus.
    } else {
      debug('Neural TTS not supported (not in Tauri environment)')
      state.neuralAvailable = false
    }

    // Load preferences
    debug('Loading preferences...')
    loadPreferences()

    // Build unified voice list
    debug('Building unified voice list...')
    await rebuildVoiceList()
    console.log(
      '[TTS] Voice list built,',
      state.unifiedVoices.length,
      'voices available',
    )

    state.isInitialized = state.nativeAvailable || state.neuralAvailable

    if (state.isInitialized) {
      debug('TTS initialized successfully')
      console.log(
        '[TTS] Native TTS:',
        state.nativeAvailable ? 'available' : 'unavailable',
      )
      console.log(
        '[TTS] Neural TTS:',
        state.neuralAvailable ? 'available' : 'unavailable',
      )
      return true
    } else {
      console.warn(
        '[TTS] TTS not available - neither native nor neural is available',
      )
      toastWarning('Text-to-speech is not available on this system')
      return false
    }
  } catch (error) {
    debugError('Error during TTS initialization:', error)
    toastError('Failed to initialize text-to-speech')
    state.isInitialized = false
    state.nativeAvailable = false
    state.neuralAvailable = false
    return false
  }
}

/**
 * Rebuild the unified voice list from both native and neural sources
 */
async function rebuildVoiceList(): Promise<void> {
  const unifiedVoices: UnifiedVoiceInfo[] = []

  // Add native voices
  if (state.nativeAvailable) {
    const nativeClient = getNativeClient()
    const nativeVoices = nativeClient.getVoices()
    for (const voice of nativeVoices) {
      unifiedVoices.push({
        id: `native:${voice.id}`,
        name: voice.name,
        language: voice.language,
        type: 'native',
      })
    }
  }

  // Add neural voices
  // Always try to get neural voices if we're in a Tauri environment
  // This allows users to see and download models even if not yet available
  if (isNeuralTtsSupported()) {
    debug('rebuildVoiceList: Getting neural voices...')
    const neuralClient = getNeuralClient()
    const neuralVoices = await neuralClient.getVoices()
    debug('rebuildVoiceList: Got', neuralVoices.length, 'neural voices')
    state.models = await neuralClient.getModels()
    debug('rebuildVoiceList: Got', state.models.length, 'models')

    for (const voice of neuralVoices) {
      const model = state.models.find(
        (m) => voice.id.includes(m.id) || m.name === voice.name,
      )
      debug(
        'rebuildVoiceList: Adding voice',
        voice.name,
        'model:',
        model?.id,
        'isDownloaded:',
        model?.isDownloaded,
      )
      unifiedVoices.push({
        id: `neural:${voice.id}`,
        name: `${voice.name} (Neural)`,
        language: voice.language,
        type: 'neural',
        description: voice.description,
        modelId: model?.id,
        isDownloaded: model?.isDownloaded ?? false,
        sizeMb: model?.sizeMb,
      })
    }

    // Add Piper voice if no neural voices returned from backend
    // This ensures the download flow works even when model isn't downloaded yet
    if (neuralVoices.length === 0) {
      debug('rebuildVoiceList: No neural voices from backend, adding Piper')
      const isPiperDownloaded = await neuralClient.isModelReady('piper-en-us')
      unifiedVoices.push({
        id: 'neural:piper-en-us',
        name: 'Piper US English (Neural)',
        language: 'en',
        type: 'neural',
        description: 'Lightweight neural voice (~63MB)',
        modelId: 'piper-en-us',
        isDownloaded: isPiperDownloaded,
        sizeMb: 63,
      })
    }
  } else {
    debug('rebuildVoiceList: Neural TTS not supported, skipping neural voices')
  }

  state.unifiedVoices = unifiedVoices
}

/**
 * Check if TTS is available
 */
export function isTtsAvailable(): boolean {
  return state.isInitialized && (state.nativeAvailable || state.neuralAvailable)
}

/**
 * Check if neural TTS is available
 */
export function isNeuralTtsAvailable(): boolean {
  return state.neuralAvailable
}

/**
 * Refresh the neural TTS status and voice list
 * Call this after model download to update availability
 */
export async function refreshNeuralStatus(): Promise<void> {
  if (!isNeuralTtsSupported()) {
    return
  }

  const neuralClient = getNeuralClient()

  // Force refetch status from backend
  const neuralStatus = await neuralClient.fetchStatus()
  state.neuralAvailable = neuralStatus.available

  console.log(
    '[TTS] refreshNeuralStatus: neuralAvailable updated to',
    state.neuralAvailable,
  )

  // Rebuild voice list with updated model status
  await rebuildVoiceList()
}

/**
 * Check if TTS is currently playing
 */
export function isTtsPlaying(): boolean {
  return state.isPlaying
}

/**
 * Get current download progress
 */
export function getDownloadProgress(): number | null {
  return state.downloadProgress
}

/**
 * Check if a model is currently being downloaded
 */
export function isDownloading(): boolean {
  return state.isDownloading
}

/**
 * Enable or disable neural TTS
 */
export function setUseNeural(enabled: boolean): void {
  state.useNeural = enabled
  savePreferences()
}

/**
 * Check if neural TTS is enabled
 */
export function getUseNeural(): boolean {
  return state.useNeural
}

/**
 * Create the TTS control button HTML
 * Always shows the button - it will initialize TTS on first click if needed
 * @param isPlaying - Whether TTS is currently playing
 */
export function createTtsButton(isPlaying: boolean = false): string {
  const icon = isPlaying ? icons.speakerOff : icons.speaker
  const label = isPlaying ? 'Stop Reading' : 'Read Aloud'
  const title = isPlaying
    ? 'Stop text-to-speech'
    : 'Read article aloud (system voice)'

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
 * Create the Neural TTS button HTML for high-quality voice synthesis
 * This button specifically uses the Rust backend neural TTS (Piper)
 * @param isPlaying - Whether TTS is currently playing
 * @param isModelReady - Whether the neural model is downloaded
 */
export function createNeuralTtsButton(
  isPlaying: boolean = false,
  isModelReady: boolean = false,
): string {
  const icon = isPlaying ? icons.speakerOff : icons.speaker
  const label = isPlaying ? 'Stop Neural' : 'Read Neural'
  const title = isPlaying
    ? 'Stop neural text-to-speech'
    : isModelReady
      ? 'Read with high-quality neural voice (Rust backend)'
      : 'Neural voice not downloaded - click to setup'

  return `
    <button class="story-action-btn neural-tts-btn${isPlaying ? ' playing' : ''}${isModelReady ? '' : ' needs-download'}" 
            data-action="neural-tts-toggle" 
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

  // Get current rate from appropriate client
  let currentRate = 0.5
  if (state.useNeural && state.neuralAvailable) {
    currentRate = getNeuralClient().getPreferences().rate
  } else if (state.nativeAvailable) {
    currentRate = getNativeClient().getRate()
  }

  const selectedVoiceId = state.selectedVoiceId || getDefaultVoiceId()

  // Filter to English voices for better UX
  const englishVoices = state.unifiedVoices.filter(
    (v) => !v.language || v.language.startsWith('en'),
  )
  const displayVoices =
    englishVoices.length > 0 ? englishVoices : state.unifiedVoices

  // Group voices by type
  const nativeVoices = displayVoices.filter((v) => v.type === 'native')
  const neuralVoices = displayVoices.filter((v) => v.type === 'neural')

  const createVoiceOption = (v: UnifiedVoiceInfo) => {
    const downloadIndicator = v.type === 'neural' && !v.isDownloaded ? ' ⬇️' : ''
    const sizeInfo = v.type === 'neural' && v.sizeMb ? ` (${v.sizeMb} MB)` : ''
    return `<option value="${v.id}"${v.id === selectedVoiceId ? ' selected' : ''}>${v.name}${sizeInfo}${downloadIndicator}</option>`
  }

  const nativeOptions =
    nativeVoices.length > 0
      ? `<optgroup label="System Voices">${nativeVoices.map(createVoiceOption).join('')}</optgroup>`
      : ''

  const neuralOptions =
    neuralVoices.length > 0
      ? `<optgroup label="Neural Voices (High Quality)">${neuralVoices.map(createVoiceOption).join('')}</optgroup>`
      : ''

  // Convert rate to percentage for display
  const ratePercent = Math.round(currentRate * 200)

  // Neural toggle
  const neuralToggle = state.neuralAvailable
    ? `
    <div class="tts-setting-row">
      <label class="tts-toggle-label">
        <input type="checkbox" id="tts-use-neural" ${state.useNeural ? 'checked' : ''}>
        <span>Use Neural TTS (higher quality)</span>
      </label>
    </div>
  `
    : ''

  // Download UI for selected neural voice
  let downloadUi = ''
  const selectedVoice = state.unifiedVoices.find(
    (v) => v.id === selectedVoiceId,
  )
  if (
    selectedVoice?.type === 'neural' &&
    !selectedVoice.isDownloaded &&
    !state.isDownloading
  ) {
    downloadUi = `
      <div class="tts-setting-row tts-download-row">
        <span class="tts-download-info">${selectedVoice.name} requires download (${selectedVoice.sizeMb} MB)</span>
        <button class="tts-download-btn" data-action="tts-download-model" data-model-id="${selectedVoice.modelId}">
          Download
        </button>
      </div>
    `
  } else if (state.isDownloading) {
    const progress = state.downloadProgress ?? 0
    downloadUi = `
      <div class="tts-setting-row tts-download-row">
        <span class="tts-download-info">Downloading model...</span>
        <div class="tts-download-progress">
          <div class="tts-progress-bar" style="width: ${progress}%"></div>
          <span class="tts-progress-text">${Math.round(progress)}%</span>
        </div>
      </div>
    `
  }

  return `
    <div class="tts-settings" id="tts-settings">
      <div class="tts-settings-header">
        <span>Text-to-Speech Settings</span>
        <button class="tts-settings-close" data-action="tts-settings-close" aria-label="Close settings">
          <svg viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      ${neuralToggle}
      <div class="tts-setting-row">
        <label for="tts-voice">Voice</label>
        <select id="tts-voice" class="tts-voice-select">
          ${nativeOptions}
          ${neuralOptions}
        </select>
      </div>
      ${downloadUi}
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
 * Get default voice ID
 */
function getDefaultVoiceId(): string {
  // Prefer neural if enabled and available
  if (state.useNeural && state.neuralAvailable) {
    const neuralVoice = state.unifiedVoices.find((v) => v.type === 'neural')
    if (neuralVoice) return neuralVoice.id
  }

  // Fall back to first available voice
  if (state.unifiedVoices.length > 0) {
    return state.unifiedVoices[0].id
  }

  return ''
}

/**
 * Parse voice ID to get type and actual voice ID
 */
function parseVoiceId(unifiedId: string): {
  type: 'native' | 'neural'
  voiceId: string
} {
  if (unifiedId.startsWith('native:')) {
    return { type: 'native', voiceId: unifiedId.replace('native:', '') }
  } else if (unifiedId.startsWith('neural:')) {
    return { type: 'neural', voiceId: unifiedId.replace('neural:', '') }
  }
  // Default to native if no prefix
  return { type: 'native', voiceId: unifiedId }
}

/**
 * Get the effective voice ID for speaking
 * Returns neural voice if enabled and available, otherwise native
 */
function getEffectiveVoiceId(): { type: 'native' | 'neural'; voiceId: string } {
  const selectedId = state.selectedVoiceId || getDefaultVoiceId()
  const parsed = parseVoiceId(selectedId)

  // Check if we should use neural
  if (state.useNeural && state.neuralAvailable && parsed.type === 'neural') {
    const voice = state.unifiedVoices.find((v) => v.id === selectedId)
    if (voice?.isDownloaded) {
      return parsed
    }
  }

  // Fall back to native
  if (state.nativeAvailable) {
    // If a native voice is selected, use it
    if (parsed.type === 'native') {
      return parsed
    }
    // Otherwise use first native voice
    const nativeVoice = state.unifiedVoices.find((v) => v.type === 'native')
    if (nativeVoice) {
      return parseVoiceId(nativeVoice.id)
    }
  }

  // Last resort: try neural even if not downloaded (will trigger download)
  if (state.neuralAvailable && parsed.type === 'neural') {
    return parsed
  }

  return parsed
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
      toastWarning('Text-to-speech is not available')
      return false
    }
  }

  if (!isTtsAvailable()) {
    return false
  }

  const effectiveVoice = getEffectiveVoiceId()
  let success = false

  if (effectiveVoice.type === 'neural' && state.neuralAvailable) {
    const neuralClient = getNeuralClient()
    success = await neuralClient.speak(text, effectiveVoice.voiceId)
  } else if (state.nativeAvailable) {
    const nativeClient = getNativeClient()
    success = await nativeClient.speak(text, true)
    if (success && effectiveVoice.voiceId) {
      await nativeClient.setVoice(effectiveVoice.voiceId)
    }
  }

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

  // Stop both clients to be safe
  if (state.neuralAvailable) {
    await getNeuralClient().stop()
  }
  if (state.nativeAvailable) {
    await getNativeClient().stop()
  }

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
 * Toggle neural reading state specifically using Rust backend neural TTS
 * @param text - Text to read (only used when starting)
 */
export async function toggleNeuralReading(text: string): Promise<boolean> {
  debug('===== toggleNeuralReading START =====')
  console.log(
    '[TTS] toggleNeuralReading called with text length:',
    text?.length || 0,
  )
  console.log(
    '[TTS] Current state - isPlaying:',
    state.isPlaying,
    'isInitialized:',
    state.isInitialized,
    'neuralAvailable:',
    state.neuralAvailable,
  )
  debug('unifiedVoices available:', state.unifiedVoices.length)

  if (state.isPlaying) {
    debug('Stopping neural playback...')
    state.isPlaying = false
    state.currentText = null
    state.currentSentenceIndex = null
    state.sentences = []
    updateNeuralTtsButtonState(false)
    clearSentenceHighlighting()
    try {
      const stopResult = await getNeuralClient().stop()
      debug('Neural stop result:', stopResult)
      return true
    } catch (error) {
      debugError('Error stopping neural TTS:', error)
      toastError('Failed to stop speech')
      return false
    }
  } else {
    // Initialize if needed
    if (!state.isInitialized) {
      debug('TTS not initialized, initializing now...')
      const initSuccess = await initTtsUi()
      console.log(
        '[TTS] Initialization result:',
        initSuccess,
        'neuralAvailable after init:',
        state.neuralAvailable,
      )
      if (!initSuccess) {
        console.warn('[TTS] TTS initialization failed')
        toastWarning('TTS not available on this system')
        return false
      }
    }

    console.log(
      '[TTS] Checking neural availability - state.neuralAvailable:',
      state.neuralAvailable,
      'state.isInitialized:',
      state.isInitialized,
    )
    debug('unifiedVoices count:', state.unifiedVoices.length)
    console.log(
      '[TTS] unifiedVoices neural voices:',
      state.unifiedVoices
        .filter((v) => v.type === 'neural')
        .map((v) => ({
          id: v.id,
          name: v.name,
          modelId: v.modelId,
          isDownloaded: v.isDownloaded,
        })),
    )

    if (!state.neuralAvailable) {
      console.warn(
        '[TTS] Neural TTS not available block entered. Initialized:',
        state.isInitialized,
        'neuralAvailable:',
        state.neuralAvailable,
      )

      // Check if already downloading
      if (state.isDownloading) {
        debug('Already downloading, returning false')
        toastWarning('Voice model download in progress. Please wait...')
        return false
      }

      // Find a neural voice - first try one that needs downloading, then any with modelId
      const neuralVoices = state.unifiedVoices.filter(
        (v) => v.type === 'neural' && v.modelId,
      )
      const downloadableVoice =
        neuralVoices.find((v) => !v.isDownloaded) || neuralVoices[0]

      debug('downloadableVoice found:', !!downloadableVoice)
      if (downloadableVoice) {
        debug('downloadableVoice details:', {
          type: downloadableVoice.type,
          modelId: downloadableVoice.modelId,
          isDownloaded: downloadableVoice.isDownloaded,
          name: downloadableVoice.name,
        })
      }

      if (downloadableVoice?.modelId) {
        const modelId = downloadableVoice.modelId
        console.log(
          '[TTS] ENTERING DOWNLOAD PROMPT BLOCK - should show confirm dialog',
        )

        // Different message depending on whether model appears downloaded but isn't working
        const isRedownload = downloadableVoice.isDownloaded
        const confirmMessage = isRedownload
          ? `Re-download ${downloadableVoice.name} voice model?\n\nThe existing model may be corrupted. This will download approximately ${downloadableVoice.sizeMb || 63}MB of data. Continue?`
          : `Download ${downloadableVoice.name} voice model?\n\nThis will download approximately ${downloadableVoice.sizeMb || 63}MB of data. Continue?`

        const wantsToDownload = confirm(confirmMessage)

        if (!wantsToDownload) {
          debug('User cancelled download dialog')
          return false
        }

        // User confirmed - show info toast that download is starting
        toastInfo(
          `Downloading ${downloadableVoice.name}... This may take a moment.`,
        )

        // Start downloading automatically
        debug('User confirmed download, starting download for model:', modelId)
        const success = await downloadModel(modelId)
        debug('downloadModel returned:', success)

        if (success) {
          // After successful download, refresh the neural status
          console.log(
            '[TTS] Model downloaded successfully, refreshing neural status...',
          )
          await refreshNeuralStatus()
          console.log(
            '[TTS] Refresh complete, neuralAvailable:',
            state.neuralAvailable,
          )
          if (!state.neuralAvailable) {
            console.warn(
              '[TTS] Model downloaded but neural still not available',
            )
            toastWarning(
              'Model downloaded but neural TTS is not yet available. Please try again in a moment.',
            )
            console.log(
              '[TTS] ===== toggleNeuralReading END - refresh failed =====',
            )
            return false
          }
          // Neural is now available, continue with speaking
          console.log('[TTS] Refresh successful, proceeding with speech')
        } else {
          debug('downloadModel returned false')
          // Toast already shown by downloadModel, don't duplicate
          debug('===== toggleNeuralReading END - download failed =====')
          return false
        }
      } else {
        console.warn(
          '[TTS] No neural voice found. unifiedVoices count:',
          state.unifiedVoices.length,
          'neural voices:',
          state.unifiedVoices.filter((v) => v.type === 'neural').length,
          'All neural voices:',
          state.unifiedVoices
            .filter((v) => v.type === 'neural')
            .map((v) => ({
              id: v.id,
              modelId: v.modelId,
              isDownloaded: v.isDownloaded,
            })),
        )
        toastWarning(
          'Neural voice not available. Please check the backend is running.',
        )
        debug('===== toggleNeuralReading END - neural not available =====')
        return false
      }
    }

    // Provide immediate visual feedback
    console.log(
      '[TTS] Providing immediate visual feedback - setting loading state',
    )
    setNeuralButtonLoadingState(true)

    try {
      // Find the article container for inline highlighting
      const articleContainer =
        document.querySelector('.article-content') ||
        document.querySelector('.story-detail-text')

      // Split text into sentences for sentence-by-sentence playback with highlighting
      const sentences = splitIntoSentences(text)
      console.log(
        '[TTS] Split text into',
        sentences.length,
        'sentences for highlighting',
      )

      if (sentences.length === 0) {
        debug('No sentences to speak')
        toastWarning('No readable text found')
        setNeuralButtonLoadingState(false)
        return false
      }

      // Store sentences in state for progress tracking
      state.sentences = sentences
      state.currentSentenceIndex = null

      // Prepare article for inline highlighting (wrap sentences in spans)
      if (articleContainer) {
        prepareArticleForTts(articleContainer as HTMLElement)
      }

      console.log(
        '[TTS] Calling neuralClient.speakSentences() with',
        sentences.length,
        'sentences',
      )

      // Use sentence-by-sentence playback with event callbacks
      const success = await getNeuralClient().speakSentences(
        sentences,
        handleSentenceEvent,
      )
      debug('Neural speakSentences result:', success)

      if (success) {
        state.isPlaying = true
        state.currentText = text
        updateNeuralTtsButtonState(true)
        debug('Playback started successfully')
      } else {
        debug('Neural speakSentences returned false')
        toastError('Failed to start speech playback')
        setNeuralButtonLoadingState(false)
        clearSentenceHighlighting()
      }
      debug('===== toggleNeuralReading END - success =====')
      return success
    } catch (error) {
      debugError('Error in neuralClient.speakSentences():', error)
      toastError(
        `Speech playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      setNeuralButtonLoadingState(false)
      clearSentenceHighlighting()
      debug('===== toggleNeuralReading END - error =====')
      return false
    }
  }
}

/**
 * Update Neural TTS button visual state
 */
function updateNeuralTtsButtonState(isPlaying: boolean): void {
  debug('Updating neural button state, isPlaying:', isPlaying)
  const buttons = document.querySelectorAll('.neural-tts-btn')
  debug('Found', buttons.length, 'neural-tts-btn elements')

  buttons.forEach((btn, index) => {
    const button = btn as HTMLButtonElement
    button.classList.remove('loading')
    button.classList.toggle('playing', isPlaying)
    button.setAttribute('aria-pressed', String(isPlaying))
    button.title = isPlaying
      ? 'Stop neural text-to-speech'
      : 'Read with high-quality neural voice (Rust backend)'
    button.disabled = false

    const icon = button.querySelector('svg')
    if (icon) {
      icon.outerHTML = isPlaying ? icons.speakerOff : icons.speaker
    }

    const label = button.querySelector('span')
    if (label) {
      label.textContent = isPlaying ? 'Stop Neural' : 'Read Neural'
    }
    debug('Updated button', index, 'to isPlaying:', isPlaying)
  })
}

/**
 * Set neural button loading state (provides visual feedback while preparing speech)
 */
function setNeuralButtonLoadingState(isLoading: boolean): void {
  debug('Setting neural button loading state:', isLoading)
  const buttons = document.querySelectorAll('.neural-tts-btn')

  buttons.forEach((btn) => {
    const button = btn as HTMLButtonElement
    button.classList.toggle('loading', isLoading)
    button.disabled = isLoading

    const label = button.querySelector('span')
    if (label && isLoading) {
      label.textContent = 'Loading...'
    }
  })
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
  state.selectedVoiceId = voiceId
  savePreferences()

  const parsed = parseVoiceId(voiceId)

  if (parsed.type === 'native' && state.nativeAvailable) {
    const nativeClient = getNativeClient()
    await nativeClient.setVoice(parsed.voiceId)
  } else if (parsed.type === 'neural' && state.neuralAvailable) {
    const neuralClient = getNeuralClient()
    neuralClient.setVoice(parsed.voiceId)
  }

  // Refresh settings panel to show/hide download UI
  refreshSettingsPanel()
}

/**
 * Handle TTS rate change
 */
export async function handleRateChange(rate: number): Promise<void> {
  // Convert from slider value (0-100) to rate (0-1 for native, 0.5-2.0 for neural)
  const normalizedRate = rate / 100

  // Update both clients
  if (state.nativeAvailable) {
    const nativeClient = getNativeClient()
    await nativeClient.setRate(normalizedRate)
  }

  if (state.neuralAvailable) {
    const neuralClient = getNeuralClient()
    // Neural uses 0.5-2.0 range, convert from 0-1
    const neuralRate = 0.5 + normalizedRate * 1.5
    await neuralClient.setRate(neuralRate)
  }

  // Update display
  const rateValue = document.getElementById('tts-rate-value')
  if (rateValue) {
    rateValue.textContent = `${Math.round(normalizedRate * 200)}%`
  }
}

/**
 * Handle neural toggle change
 */
export async function handleNeuralToggle(enabled: boolean): Promise<void> {
  setUseNeural(enabled)

  // Refresh settings panel to update UI
  refreshSettingsPanel()
}

/**
 * Download a neural voice model
 */
export async function downloadModel(modelId: string): Promise<boolean> {
  if (!modelId) {
    debug('downloadModel: no modelId provided')
    return false
  }

  // Note: We allow download even if state.neuralAvailable is false
  // because that's the whole point - we're downloading to make it available!
  debug(
    'downloadModel: starting download for',
    modelId,
    'neuralAvailable:',
    state.neuralAvailable,
  )

  state.isDownloading = true
  state.downloadProgress = 0
  refreshSettingsPanel()

  const neuralClient = getNeuralClient()

  // Set up progress tracking
  const onProgress = (progress: ModelDownloadProgress) => {
    state.downloadProgress = progress.progress
    refreshSettingsPanel()
  }

  try {
    const success = await neuralClient.downloadModel(modelId, onProgress)

    if (success) {
      // Refresh voice list and models
      await rebuildVoiceList()
    } else {
      // Download failed (error already logged in neural client)
      toastError('Failed to download voice model')
    }

    return success
  } catch (error) {
    console.error('[TTS] downloadModel exception:', error)
    toastError('Failed to download voice model')
    return false
  } finally {
    state.isDownloading = false
    state.downloadProgress = null
    refreshSettingsPanel()
  }
}

/**
 * Refresh the settings panel in the DOM
 */
function refreshSettingsPanel(): void {
  const panel = document.getElementById('tts-settings')
  if (panel) {
    panel.outerHTML = createTtsSettingsPanel()
    // Re-attach event listeners
    attachSettingsListeners(panel.parentElement || document.body)
  }
}

/**
 * Attach event listeners to settings panel elements
 */
function attachSettingsListeners(container: HTMLElement): void {
  // Voice selection
  const voiceSelect = container.querySelector('#tts-voice')
  if (voiceSelect) {
    voiceSelect.addEventListener('change', async (e) => {
      const select = e.target as HTMLSelectElement
      await handleVoiceChange(select.value)
    })
  }

  // Rate slider
  const rateSlider = container.querySelector('#tts-rate')
  if (rateSlider) {
    rateSlider.addEventListener('input', async (e) => {
      const slider = e.target as HTMLInputElement
      await handleRateChange(Number(slider.value))
    })
  }

  // Neural toggle
  const neuralToggle = container.querySelector('#tts-use-neural')
  if (neuralToggle) {
    neuralToggle.addEventListener('change', async (e) => {
      const checkbox = e.target as HTMLInputElement
      await handleNeuralToggle(checkbox.checked)
    })
  }

  // Download button
  const downloadBtn = container.querySelector(
    '[data-action="tts-download-model"]',
  )
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      const btn = e.currentTarget as HTMLButtonElement
      const modelId = btn.getAttribute('data-model-id')
      if (modelId) {
        btn.disabled = true
        btn.textContent = 'Downloading...'
        await downloadModel(modelId)
      }
    })
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
 * Split text into sentences using common sentence boundaries
 * Combines short sentences to create chunks of ~200-350 characters
 * for better TTS pacing and highlighting visibility
 *
 * @param text - Text to split into sentences
 * @returns Array of sentence strings
 */
export function splitIntoSentences(text: string): string[] {
  // Target sentence length range (in characters)
  // Shorter sentences are combined until reaching this threshold
  const MIN_CHUNK_LENGTH = 200
  const MAX_CHUNK_LENGTH = 400

  // Split on sentence-ending punctuation followed by space
  const rawSentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim())

  if (rawSentences.length === 0 && text.trim().length > 0) {
    return [text.trim()]
  }

  // Combine short sentences into longer chunks
  const chunks: string[] = []
  let currentChunk = ''

  for (const sentence of rawSentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue

    // If current chunk is empty, start with this sentence
    if (!currentChunk) {
      currentChunk = trimmed
      continue
    }

    // Check if adding this sentence would exceed max length
    const combined = `${currentChunk} ${trimmed}`

    if (combined.length <= MAX_CHUNK_LENGTH) {
      // If current chunk is below minimum, always combine
      if (currentChunk.length < MIN_CHUNK_LENGTH) {
        currentChunk = combined
      } else {
        // Current chunk is already good size, start new chunk
        chunks.push(currentChunk)
        currentChunk = trimmed
      }
    } else {
      // Would exceed max - push current and start new
      chunks.push(currentChunk)
      currentChunk = trimmed
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(currentChunk)
  }

  return chunks
}

/**
 * Prepare article content for TTS with sentence highlighting
 *
 * This function wraps each sentence in a span with a data-sentence-index attribute,
 * allowing the TTS to highlight the current sentence being spoken.
 *
 * @param container - The article content container
 * @returns Object with sentences array and whether preparation was successful
 */
export function prepareArticleForTts(container: HTMLElement): {
  sentences: string[]
  success: boolean
} {
  // Check if already prepared
  if (container.querySelector('[data-sentence-index]')) {
    // Already prepared - extract sentences from existing spans
    const spans = container.querySelectorAll('[data-sentence-index]')
    const sentences: string[] = []
    spans.forEach((span) => {
      sentences.push(span.textContent || '')
    })
    return { sentences, success: true }
  }

  // Extract text and split into sentences
  const text = extractArticleText(container)
  const sentences = splitIntoSentences(text)

  if (sentences.length === 0) {
    return { sentences: [], success: false }
  }

  // Store sentences for reference
  state.sentences = sentences

  // Wrap sentences in spans for inline highlighting
  wrapSentencesInContainer(container, sentences)

  return { sentences, success: true }
}

/**
 * Wrap sentences in the container with span elements for highlighting
 * This modifies the DOM to enable inline sentence highlighting
 */
function wrapSentencesInContainer(
  container: HTMLElement,
  sentences: string[],
): void {
  // Store original HTML for restoration later
  if (!container.hasAttribute('data-original-html')) {
    container.setAttribute('data-original-html', container.innerHTML)
  }

  // Get the full text content
  const fullText = container.textContent || ''

  // Build a map of sentence positions in the text
  let searchStart = 0
  const sentencePositions: Array<{ start: number; end: number; text: string }> =
    []

  for (const sentence of sentences) {
    const pos = fullText.indexOf(sentence, searchStart)
    if (pos !== -1) {
      sentencePositions.push({
        start: pos,
        end: pos + sentence.length,
        text: sentence,
      })
      searchStart = pos + sentence.length
    }
  }

  // Now we need to walk through text nodes and wrap them
  // This is a simplified approach that works for most cases
  wrapTextNodesWithSentences(container, sentencePositions)
}

/**
 * Walk through text nodes and wrap sentence content with spans
 */
function wrapTextNodesWithSentences(
  container: HTMLElement,
  sentencePositions: Array<{ start: number; end: number; text: string }>,
): void {
  // Create a TreeWalker to find all text nodes
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      // Skip empty text nodes
      if (!node.textContent?.trim()) {
        return NodeFilter.FILTER_SKIP
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  // Collect all text nodes first (modifying during iteration causes issues)
  const textNodes: Text[] = []
  let node: Node | null = walker.nextNode()
  while (node) {
    textNodes.push(node as Text)
    node = walker.nextNode()
  }

  // Track position in the full text
  let globalOffset = 0

  for (const textNode of textNodes) {
    const text = textNode.textContent || ''
    const nodeStart = globalOffset
    const nodeEnd = globalOffset + text.length

    // Find sentences that overlap with this text node
    const overlappingSentences = sentencePositions
      .map((s, idx) => ({ ...s, index: idx }))
      .filter((s) => s.start < nodeEnd && s.end > nodeStart)

    if (overlappingSentences.length > 0) {
      // Split and wrap this text node
      const fragment = document.createDocumentFragment()
      let currentPos = 0

      for (const sentence of overlappingSentences) {
        // Calculate overlap within this text node
        const overlapStart = Math.max(0, sentence.start - nodeStart)
        const overlapEnd = Math.min(text.length, sentence.end - nodeStart)

        // Add text before the sentence (if any)
        if (overlapStart > currentPos) {
          fragment.appendChild(
            document.createTextNode(text.slice(currentPos, overlapStart)),
          )
        }

        // Add the sentence span
        const span = document.createElement('span')
        span.className = 'tts-sentence'
        span.setAttribute('data-sentence-index', String(sentence.index))
        span.textContent = text.slice(overlapStart, overlapEnd)
        fragment.appendChild(span)

        currentPos = overlapEnd
      }

      // Add remaining text after the last sentence
      if (currentPos < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(currentPos)))
      }

      // Replace the text node with our fragment
      textNode.parentNode?.replaceChild(fragment, textNode)
    }

    globalOffset += text.length
  }
}

/**
 * Handle sentence event from TTS backend
 * Updates the visual highlighting of the current sentence
 */
function handleSentenceEvent(event: SentenceEvent): void {
  // Always log sentence events for debugging sync issues
  console.log('[TTS] Sentence event:', event.type, 'index' in event ? event.index : '', Date.now())

  switch (event.type) {
    case 'start':
      state.currentSentenceIndex = event.index
      highlightCurrentSentence(event.index)
      break

    case 'end':
      // Sentence finished - could add transition effect here
      break

    case 'finished':
      state.isPlaying = false
      state.currentSentenceIndex = null
      state.sentences = []
      clearSentenceHighlighting()
      updateNeuralTtsButtonState(false)
      break

    case 'stopped':
      state.isPlaying = false
      state.currentSentenceIndex = null
      state.sentences = []
      clearSentenceHighlighting()
      updateNeuralTtsButtonState(false)
      break
  }
}

/**
 * Highlight the current sentence being spoken
 * Uses both progress indicator and inline highlighting
 */
function highlightCurrentSentence(index: number): void {
  console.log('[TTS] highlightCurrentSentence called with index:', index, 'total sentences:', state.sentences.length)
  
  // Get the article content container
  const container =
    document.querySelector('.article-content') ||
    document.querySelector('.story-detail-text')

  if (!container) return

  // Update progress indicator
  updateSentenceProgressIndicator(index, state.sentences.length)

  // Remove highlight from previous sentence
  document.querySelectorAll('.tts-sentence.tts-active').forEach((el) => {
    el.classList.remove('tts-active')
  })

  // Highlight current sentence spans
  const currentSpans = document.querySelectorAll(
    `[data-sentence-index="${index}"]`,
  )
  
  console.log('[TTS] Found', currentSpans.length, 'spans for sentence index', index)
  
  currentSpans.forEach((span) => {
    span.classList.add('tts-active')

    // Scroll into view if needed (only for first span of the sentence)
    if (span === currentSpans[0]) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })

  debug(`Highlighting sentence ${index + 1} of ${state.sentences.length}`)
}

/**
 * Clear all sentence highlighting and restore original content
 */
function clearSentenceHighlighting(): void {
  // Remove progress indicator
  const indicator = document.querySelector('.tts-sentence-indicator')
  if (indicator) {
    indicator.remove()
  }

  // Restore original HTML content
  const containers = document.querySelectorAll('[data-original-html]')
  containers.forEach((container) => {
    const originalHtml = container.getAttribute('data-original-html')
    if (originalHtml) {
      container.innerHTML = originalHtml
      container.removeAttribute('data-original-html')
    }
  })

  // Reset any highlighted elements (fallback)
  document.querySelectorAll('.tts-sentence.tts-active').forEach((el) => {
    el.classList.remove('tts-active')
  })
}

/**
 * Update the sentence progress indicator
 * Shows which sentence is currently being read
 */
function updateSentenceProgressIndicator(
  currentIndex: number,
  totalSentences: number,
): void {
  let indicator = document.querySelector(
    '.tts-sentence-indicator',
  ) as HTMLElement | null

  if (!indicator) {
    // Create the indicator
    indicator = document.createElement('div')
    indicator.className = 'tts-sentence-indicator'

    // Find the article container and add indicator
    const articleContainer =
      document.querySelector('.article-content') ||
      document.querySelector('.story-detail-text')
    if (articleContainer) {
      // Insert before the article content
      articleContainer.parentElement?.insertBefore(indicator, articleContainer)
    }
  }

  const progress = ((currentIndex + 1) / totalSentences) * 100
  const currentSentence = state.sentences[currentIndex] || ''
  const previewText =
    currentSentence.length > 100
      ? `${currentSentence.substring(0, 100)}...`
      : currentSentence

  indicator.innerHTML = `
    <div class="tts-progress-bar">
      <div class="tts-progress-fill" style="width: ${progress}%"></div>
    </div>
    <div class="tts-progress-text">
      <span class="tts-progress-count">${currentIndex + 1} / ${totalSentences}</span>
      <span class="tts-current-text">${escapeHtml(previewText)}</span>
    </div>
  `
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Track containers that already have TTS listeners attached
const listenersAttachedTo = new WeakSet<HTMLElement>()

/**
 * Setup TTS event listeners for a container
 */
export function setupTtsListeners(container: HTMLElement): void {
  // Prevent duplicate event listener registration
  if (listenersAttachedTo.has(container)) {
    debug('TTS listeners already attached to this container, skipping')
    return
  }
  listenersAttachedTo.add(container)

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

    if (action === 'neural-tts-toggle') {
      e.preventDefault()
      debug('===== Neural TTS button clicked =====')
      debug('Button element:', target.closest('.neural-tts-btn'))
      console.log(
        '[TTS] Current state at click - isInitialized:',
        state.isInitialized,
        'neuralAvailable:',
        state.neuralAvailable,
        'isDownloading:',
        state.isDownloading,
      )

      const articleContent =
        container.querySelector('.article-content') ||
        container.querySelector('.story-detail-text')

      debug('Article content element found:', !!articleContent)

      if (articleContent) {
        const text = extractArticleText(articleContent as HTMLElement)
        debug('Extracted text length:', text?.length || 0)

        if (text && text.length > 0) {
          debug('Calling toggleNeuralReading...')
          const result = await toggleNeuralReading(text)
          debug('toggleNeuralReading result:', result)
        } else {
          debug('No text extracted from article')
          toastWarning('No readable text found in article')
        }
      } else {
        debug('No article content element found')
        toastWarning('Article content not found')
      }
    }

    if (action === 'tts-settings-close') {
      const settings = document.getElementById('tts-settings')
      settings?.classList.remove('open')
    }

    if (action === 'tts-download-model') {
      e.preventDefault()
      const btn = target.closest('[data-model-id]') as HTMLButtonElement
      const modelId = btn?.getAttribute('data-model-id')
      if (modelId) {
        btn.disabled = true
        btn.textContent = 'Downloading...'
        await downloadModel(modelId)
      }
    }
  })

  // Voice selection
  container.addEventListener('change', async (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'tts-voice') {
      const select = target as HTMLSelectElement
      await handleVoiceChange(select.value)
    }

    if (target.id === 'tts-use-neural') {
      const checkbox = target as HTMLInputElement
      await handleNeuralToggle(checkbox.checked)
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
 * Returns unified voice list with both native and neural voices
 */
export function getAvailableVoices(): UnifiedVoiceInfo[] {
  return [...state.unifiedVoices]
}

/**
 * Get available native voices (backward compatibility)
 */
export function getNativeVoices(): VoiceInfo[] {
  return getNativeClient().getVoices()
}

/**
 * Save preferences to localStorage
 */
function savePreferences(): void {
  try {
    const prefs = {
      useNeural: state.useNeural,
      selectedVoiceId: state.selectedVoiceId,
    }
    localStorage.setItem('tts-ui-preferences', JSON.stringify(prefs))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load preferences from localStorage
 */
function loadPreferences(): void {
  try {
    const stored = localStorage.getItem('tts-ui-preferences')
    if (stored) {
      const prefs = JSON.parse(stored)
      if (typeof prefs.useNeural === 'boolean') {
        state.useNeural = prefs.useNeural
      }
      if (prefs.selectedVoiceId) {
        state.selectedVoiceId = prefs.selectedVoiceId
      }
    }
  } catch {
    // Use defaults on error
  }
}

/**
 * Get current TTS UI state (for debugging/monitoring)
 */
export function getTtsUiState(): Readonly<TtsUiState> {
  return { ...state }
}

/**
 * Check if the default neural voice model is downloaded and ready
 * Returns true if a neural voice is selected and its model is downloaded
 */
export function isDefaultNeuralModelReady(): boolean {
  // Find the currently selected voice or default to first neural voice
  const selectedId = state.selectedVoiceId || getDefaultVoiceId()
  const selectedVoice = state.unifiedVoices.find((v) => v.id === selectedId)

  console.log('[TTS] isDefaultNeuralModelReady check:', {
    selectedId,
    foundVoice: !!selectedVoice,
    voiceType: selectedVoice?.type,
    isDownloaded: selectedVoice?.isDownloaded,
  })

  // If a neural voice is selected, check if it's downloaded
  if (selectedVoice?.type === 'neural') {
    return selectedVoice.isDownloaded ?? false
  }

  // If no neural voice selected, check if any neural voice is available and downloaded
  const anyNeuralReady = state.unifiedVoices.some(
    (v) => v.type === 'neural' && v.isDownloaded,
  )

  debug('No neural voice selected, any neural ready:', anyNeuralReady)

  return anyNeuralReady
}

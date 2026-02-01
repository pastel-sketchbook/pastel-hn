/**
 * YouTube URL detection, parsing, and embed utilities.
 * Provides functions for detecting YouTube URLs, extracting video IDs,
 * and generating embeds using the YouTube IFrame Player API.
 */

import { icons } from './icons'

// Track if YouTube IFrame API is loaded
let youtubeApiLoaded = false
let youtubeApiLoading = false
const pendingPlayers: Array<() => void> = []

/**
 * Load the YouTube IFrame Player API script.
 * This is required for proper embedding in Tauri/webview contexts.
 */
function loadYouTubeApi(): Promise<void> {
  if (youtubeApiLoaded) {
    return Promise.resolve()
  }

  if (youtubeApiLoading) {
    return new Promise((resolve) => {
      pendingPlayers.push(resolve)
    })
  }

  youtubeApiLoading = true

  return new Promise((resolve) => {
    // Define the callback that YouTube API calls when ready
    ;(
      window as unknown as { onYouTubeIframeAPIReady: () => void }
    ).onYouTubeIframeAPIReady = () => {
      youtubeApiLoaded = true
      youtubeApiLoading = false
      resolve()
      // Resolve any pending players
      for (const cb of pendingPlayers) {
        cb()
      }
      pendingPlayers.length = 0
    }

    // Load the API script
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
  })
}

/**
 * Information about a YouTube video extracted from a URL.
 */
export interface YouTubeVideoInfo {
  /** The YouTube video ID (11 characters) */
  videoId: string
  /** Embed URL (youtube.com) */
  embedUrl: string
  /** Thumbnail image URL */
  thumbnailUrl: string
  /** The original URL that was parsed */
  originalUrl: string
}

/**
 * Thumbnail quality options for YouTube videos.
 */
export type ThumbnailQuality = 'default' | 'hq' | 'maxres'

/** YouTube video ID pattern: 11 characters of alphanumeric, dash, or underscore */
const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

/**
 * Check if a URL is a YouTube video URL.
 * Returns true for watch, embed, v, and youtu.be URLs.
 * Returns false for channel, playlist, and other non-video YouTube pages.
 *
 * @param url - The URL to check
 * @returns true if the URL is a YouTube video URL
 */
export function isYouTubeUrl(url: string): boolean {
  return extractVideoId(url) !== null
}

/**
 * Extract the video ID from a YouTube URL.
 * Supports multiple YouTube URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 *
 * @param url - The YouTube URL
 * @returns The 11-character video ID, or null if not found
 */
export function extractVideoId(url: string): string | null {
  if (!url) return null

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const hostname = parsed.hostname.toLowerCase()

  // Handle youtu.be short URLs
  if (hostname === 'youtu.be') {
    const videoId = parsed.pathname.slice(1) // Remove leading slash
    return isValidVideoId(videoId) ? videoId : null
  }

  // Handle youtube.com URLs
  if (hostname === 'www.youtube.com' || hostname === 'youtube.com') {
    // /watch?v=VIDEO_ID
    if (parsed.pathname === '/watch') {
      const videoId = parsed.searchParams.get('v')
      return videoId && isValidVideoId(videoId) ? videoId : null
    }

    // /embed/VIDEO_ID or /v/VIDEO_ID
    const embedMatch = parsed.pathname.match(
      /^\/(embed|v)\/([a-zA-Z0-9_-]{11})/,
    )
    if (embedMatch) {
      return embedMatch[2]
    }
  }

  return null
}

/**
 * Validate a YouTube video ID.
 * Video IDs are exactly 11 characters of alphanumeric, dash, or underscore.
 *
 * @param videoId - The video ID to validate
 * @returns true if the video ID is valid
 */
function isValidVideoId(videoId: string): boolean {
  return VIDEO_ID_PATTERN.test(videoId)
}

/**
 * Generate an embed URL for a YouTube video.
 * Uses standard youtube.com domain for maximum compatibility with webviews.
 *
 * @param videoId - The YouTube video ID
 * @param autoplay - Whether to autoplay the video (default: false)
 * @returns The embed URL
 */
export function getEmbedUrl(videoId: string, autoplay = false): string {
  const base = `https://www.youtube.com/embed/${videoId}`
  const params = new URLSearchParams()

  if (autoplay) {
    params.set('autoplay', '1')
  }

  // Required for proper embedding in webviews (Tauri, Electron, etc.)
  // origin parameter tells YouTube which domain is embedding the video
  params.set('origin', window.location.origin)
  params.set('enablejsapi', '1') // Enable JS API for better control
  params.set('rel', '0') // Don't show related videos from other channels
  params.set('modestbranding', '1') // Minimal YouTube branding

  const paramString = params.toString()
  return paramString ? `${base}?${paramString}` : base
}

/**
 * Generate a thumbnail URL for a YouTube video.
 *
 * @param videoId - The YouTube video ID
 * @param quality - Thumbnail quality: 'default' (120x90), 'hq' (480x360), 'maxres' (1280x720)
 * @returns The thumbnail URL
 */
export function getThumbnailUrl(
  videoId: string,
  quality: ThumbnailQuality = 'hq',
): string {
  const qualityMap: Record<ThumbnailQuality, string> = {
    default: 'default.jpg',
    hq: 'hqdefault.jpg',
    maxres: 'maxresdefault.jpg',
  }
  return `https://i.ytimg.com/vi/${videoId}/${qualityMap[quality]}`
}

/**
 * Parse a YouTube URL and extract video information.
 * Returns null if the URL is not a valid YouTube video URL.
 *
 * @param url - The YouTube URL to parse
 * @returns Video information object, or null if invalid
 */
export function parseYouTubeUrl(url: string): YouTubeVideoInfo | null {
  const videoId = extractVideoId(url)
  if (!videoId) return null

  return {
    videoId,
    embedUrl: getEmbedUrl(videoId),
    thumbnailUrl: getThumbnailUrl(videoId),
    originalUrl: url,
  }
}

/**
 * Render a YouTube video embed component.
 * Returns HTML for a lazy-loading video embed with:
 * - Thumbnail preview with play button overlay
 * - Click-to-load iframe behavior (for privacy)
 * - Fallback link to open in YouTube
 *
 * The actual iframe is loaded via JavaScript when the user clicks play.
 * Use `setupYouTubeEmbedListeners()` to enable click-to-play behavior.
 *
 * @param videoInfo - YouTube video information from parseYouTubeUrl
 * @returns HTML string for the embed component
 */
export function renderYouTubeEmbed(videoInfo: YouTubeVideoInfo): string {
  const { videoId, embedUrl, thumbnailUrl, originalUrl } = videoInfo

  return `
    <div class="youtube-embed" data-video-id="${videoId}" data-embed-url="${embedUrl}">
      <div class="youtube-embed-container">
        <div class="youtube-placeholder">
          <img 
            class="youtube-thumbnail" 
            src="${thumbnailUrl}" 
            alt="Video thumbnail" 
            loading="lazy"
          />
          <button class="youtube-play-btn" aria-label="Play video" type="button">
            ${icons.play}
          </button>
        </div>
      </div>
      <a class="youtube-external-link" href="${originalUrl}" target="_blank" rel="noopener">
        ${icons.youtube}
        <span>Open in YouTube</span>
      </a>
    </div>
  `
}

/**
 * Set up click-to-play behavior for YouTube embeds.
 * When the play button is clicked, uses the YouTube IFrame Player API
 * to create the player (required for proper embedding in Tauri/webview).
 *
 * @param container - The container element to search for YouTube embeds
 */
export function setupYouTubeEmbedListeners(container: HTMLElement): void {
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const playBtn = target.closest('.youtube-play-btn') as HTMLElement | null

    if (!playBtn) return

    const embed = playBtn.closest('.youtube-embed') as HTMLElement | null
    if (!embed) return

    const videoId = embed.dataset.videoId
    if (!videoId) return

    // Get the container for the player
    const embedContainer = embed.querySelector(
      '.youtube-embed-container',
    ) as HTMLElement | null
    if (!embedContainer) return

    // Show loading state
    playBtn.classList.add('loading')

    // Load YouTube API if not already loaded
    await loadYouTubeApi()

    // Create a unique ID for the player div
    const playerId = `yt-player-${videoId}-${Date.now()}`
    embedContainer.innerHTML = `<div id="${playerId}"></div>`

    // Create player using YouTube IFrame API
    // biome-ignore lint/suspicious/noExplicitAny: YouTube IFrame API is dynamically loaded without types
    const YT = (window as any).YT
    new YT.Player(playerId, {
      videoId: videoId,
      width: '100%',
      height: '100%',
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          embed.classList.add('youtube-embed--playing')
        },
        onError: (event: { data: number }) => {
          const errorCode = event.data
          const errorMessages: Record<number, string> = {
            2: 'Invalid video ID',
            5: 'HTML5 player error',
            100: 'Video not found',
            101: 'Embedding disabled by owner',
            150: 'Embedding disabled by owner',
            153: 'Missing referer header',
          }
          const errorMsg = errorMessages[errorCode] || 'Unknown error'
          console.error(`[YouTube] Player error ${errorCode}: ${errorMsg}`)

          embedContainer.innerHTML = `
            <div class="youtube-error">
              <p>Error ${errorCode}: ${errorMsg}</p>
              <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank" rel="noopener">
                Watch on YouTube
              </a>
            </div>
          `
        },
      },
    })
  })
}

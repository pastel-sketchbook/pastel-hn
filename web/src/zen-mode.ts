/**
 * Zen mode functionality - fullscreen, distraction-free reading experience
 */
import { toastInfo } from './toast'

// Zen mode state
let zenModeActive = false
let zenModeTransitioning = false // Lock to prevent rapid toggling

// Animation duration constants
const FULLSCREEN_EXIT_DELAY_MS = 300 // ms - delay for macOS fullscreen exit reliability
const FULLSCREEN_EXIT_MAX_WAIT_MS = 2000 // ms - maximum time to wait for fullscreen exit
const FULLSCREEN_EXIT_POLL_INTERVAL_MS = 50 // ms - polling interval for fullscreen exit check

// Callback for external state updates
type ZenModeChangeCallback = (isActive: boolean) => void
let onZenModeChangeCallback: ZenModeChangeCallback | null = null

/**
 * Check if zen mode is currently active
 */
export function isZenModeActive(): boolean {
  return zenModeActive
}

/**
 * Check if zen mode is currently transitioning
 */
export function isZenModeTransitioning(): boolean {
  return zenModeTransitioning
}

/**
 * Set a callback to be called when zen mode changes
 * This allows external code to react to zen mode state changes
 */
export function setZenModeChangeCallback(
  callback: ZenModeChangeCallback | null,
): void {
  onZenModeChangeCallback = callback
}

/**
 * Wait for the window to fully exit fullscreen mode
 * Uses polling to detect when isFullscreen() returns false
 * This ensures window decorations can be properly restored on macOS
 */
async function waitForFullscreenExit(appWindow: {
  isFullscreen: () => Promise<boolean>
}): Promise<void> {
  const startTime = Date.now()

  // First, wait the minimum delay
  await new Promise((resolve) => setTimeout(resolve, FULLSCREEN_EXIT_DELAY_MS))

  // Then poll until fullscreen is actually exited or timeout
  while (Date.now() - startTime < FULLSCREEN_EXIT_MAX_WAIT_MS) {
    const isFullscreen = await appWindow.isFullscreen()
    if (!isFullscreen) {
      // Window has fully exited fullscreen
      return
    }
    // Wait before next poll
    await new Promise((resolve) =>
      setTimeout(resolve, FULLSCREEN_EXIT_POLL_INTERVAL_MS),
    )
  }

  // Timeout reached - log warning but don't throw (graceful degradation)
  console.warn(
    'Timeout waiting for fullscreen exit, proceeding with decorations restore',
  )
}

/**
 * Toggle zen mode - fullscreen, hides header, maximizes content area
 * Press 'z' to toggle, Escape also exits zen mode
 */
export async function toggleZenMode(): Promise<void> {
  // Prevent rapid toggling while transition is in progress
  if (zenModeTransitioning) return
  zenModeTransitioning = true

  const enteringZen = !zenModeActive

  // Toggle fullscreen and decorations via Tauri API first (before CSS changes)
  // This ensures window state is correct before visual updates
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const appWindow = getCurrentWindow()

    if (enteringZen) {
      // Hide window decorations (title bar) and go fullscreen
      await appWindow.setDecorations(false)
      await appWindow.setFullscreen(true)
    } else {
      // Restore window decorations and exit fullscreen
      // Important: Exit fullscreen first, then restore decorations
      await appWindow.setFullscreen(false)
      // Wait for fullscreen exit to complete before restoring decorations
      // Use polling to ensure window is fully out of fullscreen (macOS reliability)
      await waitForFullscreenExit(appWindow)
      await appWindow.setDecorations(true)
    }

    // Only update state after Tauri API calls succeed
    zenModeActive = enteringZen
    document.documentElement.classList.toggle('zen-mode', zenModeActive)

    // Notify callback of state change
    onZenModeChangeCallback?.(zenModeActive)

    if (zenModeActive) {
      showZenModeBadge()
      toastInfo('Zen mode enabled. Press Z or Escape to exit.')
    } else {
      hideZenModeBadge()
    }
  } catch (error) {
    // Fallback for non-Tauri environment (browser dev)
    console.warn('Tauri window API not available:', error)
    zenModeActive = enteringZen
    document.documentElement.classList.toggle('zen-mode', zenModeActive)

    // Notify callback of state change
    onZenModeChangeCallback?.(zenModeActive)

    if (zenModeActive) {
      showZenModeBadge()
      toastInfo('Zen mode enabled. Press Z or Escape to exit.')
    } else {
      hideZenModeBadge()
    }
  } finally {
    // Release lock after a short delay to ensure transitions complete
    setTimeout(() => {
      zenModeTransitioning = false
    }, 200)
  }
}

/**
 * Exit zen mode if active
 */
export async function exitZenMode(): Promise<void> {
  // Prevent rapid toggling while transition is in progress
  if (zenModeTransitioning) return

  if (zenModeActive) {
    zenModeTransitioning = true

    // Exit fullscreen and restore decorations via Tauri API first
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const appWindow = getCurrentWindow()
      // Exit fullscreen first, then restore decorations
      await appWindow.setFullscreen(false)
      // Wait for fullscreen exit to complete before restoring decorations
      // Use polling to ensure window is fully out of fullscreen (macOS reliability)
      await waitForFullscreenExit(appWindow)
      await appWindow.setDecorations(true)
    } catch (error) {
      console.warn('Tauri window API not available:', error)
    } finally {
      // Release lock after a short delay to ensure transitions complete
      setTimeout(() => {
        zenModeTransitioning = false
      }, 200)
    }

    // Update state after Tauri API calls
    zenModeActive = false
    document.documentElement.classList.remove('zen-mode')
    hideZenModeBadge()

    // Notify callback of state change
    onZenModeChangeCallback?.(false)
  }
}

/**
 * Show zen mode badge indicator
 */
function showZenModeBadge(): void {
  // Remove existing badge if any
  hideZenModeBadge()

  const badge = document.createElement('div')
  badge.className = 'zen-mode-badge'
  badge.innerHTML = `
    <span class="zen-badge-icon">Z</span>
    <span class="zen-badge-text">Zen Mode</span>
  `
  badge.title = 'Press Z or Escape to exit Zen mode'
  badge.addEventListener('click', () => toggleZenMode())
  document.body.appendChild(badge)
}

/**
 * Hide zen mode badge
 */
function hideZenModeBadge(): void {
  const badge = document.querySelector('.zen-mode-badge')
  if (badge) {
    badge.remove()
  }
}

/**
 * Offline detection and indicator module
 * Shows a visual indicator when the app is offline
 */

import { announce } from './accessibility'
import { icons } from './icons'

let isOffline = false
let indicatorElement: HTMLElement | null = null

/**
 * Check if currently offline
 */
export function isCurrentlyOffline(): boolean {
  return isOffline
}

/**
 * Initialize offline detection
 * Sets up event listeners for online/offline events
 */
export function initOfflineDetection(): void {
  // Check initial state
  isOffline = !navigator.onLine

  // Create indicator element
  createIndicator()

  // Update visibility based on initial state
  updateIndicatorVisibility()

  // Listen for online/offline events
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
}

/**
 * Clean up offline detection (for testing)
 */
export function destroyOfflineDetection(): void {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)

  if (indicatorElement) {
    indicatorElement.remove()
    indicatorElement = null
  }

  isOffline = false
}

function handleOnline(): void {
  isOffline = false
  updateIndicatorVisibility()
  announce('Connection restored')
}

function handleOffline(): void {
  isOffline = true
  updateIndicatorVisibility()
  announce('You are offline. Some features may be unavailable.')
}

function createIndicator(): void {
  // Check if indicator already exists
  if (document.getElementById('offline-indicator')) {
    indicatorElement = document.getElementById('offline-indicator')
    return
  }

  indicatorElement = document.createElement('div')
  indicatorElement.id = 'offline-indicator'
  indicatorElement.className = 'offline-indicator'
  indicatorElement.setAttribute('role', 'status')
  indicatorElement.setAttribute('aria-live', 'polite')
  indicatorElement.innerHTML = `
    ${icons.wifiOff}
    <span>Offline</span>
  `

  // Insert into header, before theme toggle
  const header = document.querySelector('.header-inner')
  const themeToggle = document.getElementById('theme-toggle')

  if (header && themeToggle) {
    header.insertBefore(indicatorElement, themeToggle)
  } else if (header) {
    header.appendChild(indicatorElement)
  }
}

function updateIndicatorVisibility(): void {
  if (!indicatorElement) return

  if (isOffline) {
    indicatorElement.classList.add('visible')
    indicatorElement.setAttribute('aria-hidden', 'false')
  } else {
    indicatorElement.classList.remove('visible')
    indicatorElement.setAttribute('aria-hidden', 'true')
  }
}

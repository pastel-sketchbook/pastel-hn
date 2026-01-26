import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  destroyOfflineDetection,
  initOfflineDetection,
  isCurrentlyOffline,
} from './offline'

describe('offline', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div class="header-inner">
        <button id="theme-toggle"></button>
      </div>
    `
    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    destroyOfflineDetection()
    vi.restoreAllMocks()
  })

  describe('initOfflineDetection', () => {
    it('creates offline indicator element', () => {
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator).not.toBeNull()
      expect(indicator?.classList.contains('offline-indicator')).toBe(true)
    })

    it('inserts indicator before theme toggle', () => {
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      const themeToggle = document.getElementById('theme-toggle')

      expect(indicator?.nextElementSibling).toBe(themeToggle)
    })

    it('indicator is hidden when online', () => {
      Object.defineProperty(navigator, 'onLine', { value: true })

      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.classList.contains('visible')).toBe(false)
    })

    it('indicator is visible when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false })

      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.classList.contains('visible')).toBe(true)
    })

    it('does not create duplicate indicators', () => {
      initOfflineDetection()
      initOfflineDetection()

      const indicators = document.querySelectorAll('#offline-indicator')
      expect(indicators.length).toBe(1)
    })
  })

  describe('isCurrentlyOffline', () => {
    it('returns false when online', () => {
      Object.defineProperty(navigator, 'onLine', { value: true })

      initOfflineDetection()

      expect(isCurrentlyOffline()).toBe(false)
    })

    it('returns true when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false })

      initOfflineDetection()

      expect(isCurrentlyOffline()).toBe(true)
    })
  })

  describe('online/offline events', () => {
    it('shows indicator when going offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: true })
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.classList.contains('visible')).toBe(false)

      // Simulate going offline
      window.dispatchEvent(new Event('offline'))

      expect(indicator?.classList.contains('visible')).toBe(true)
      expect(isCurrentlyOffline()).toBe(true)
    })

    it('hides indicator when coming back online', () => {
      Object.defineProperty(navigator, 'onLine', { value: false })
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.classList.contains('visible')).toBe(true)

      // Simulate coming back online
      window.dispatchEvent(new Event('online'))

      expect(indicator?.classList.contains('visible')).toBe(false)
      expect(isCurrentlyOffline()).toBe(false)
    })
  })

  describe('destroyOfflineDetection', () => {
    it('removes the indicator element', () => {
      initOfflineDetection()
      expect(document.getElementById('offline-indicator')).not.toBeNull()

      destroyOfflineDetection()

      expect(document.getElementById('offline-indicator')).toBeNull()
    })

    it('resets offline state', () => {
      Object.defineProperty(navigator, 'onLine', { value: false })
      initOfflineDetection()
      expect(isCurrentlyOffline()).toBe(true)

      destroyOfflineDetection()

      expect(isCurrentlyOffline()).toBe(false)
    })

    it('removes event listeners', () => {
      initOfflineDetection()
      destroyOfflineDetection()

      // Re-create DOM for new init
      document.body.innerHTML = `
        <div class="header-inner">
          <button id="theme-toggle"></button>
        </div>
      `

      // Events should not affect state after destroy
      window.dispatchEvent(new Event('offline'))
      expect(isCurrentlyOffline()).toBe(false)
    })
  })

  describe('accessibility', () => {
    it('indicator has role="status"', () => {
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.getAttribute('role')).toBe('status')
    })

    it('indicator has aria-live="polite"', () => {
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.getAttribute('aria-live')).toBe('polite')
    })

    it('sets aria-hidden when online', () => {
      Object.defineProperty(navigator, 'onLine', { value: true })
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.getAttribute('aria-hidden')).toBe('true')
    })

    it('sets aria-hidden when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false })
      initOfflineDetection()

      const indicator = document.getElementById('offline-indicator')
      expect(indicator?.getAttribute('aria-hidden')).toBe('false')
    })
  })
})

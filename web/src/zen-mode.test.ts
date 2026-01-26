import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We need to reset the module state between tests
// Use dynamic import to get fresh state

describe('zen-mode', () => {
  // Store reference to the imported module functions
  let isZenModeActive: () => boolean
  let isZenModeTransitioning: () => boolean
  let setZenModeChangeCallback: (callback: ((isActive: boolean) => void) | null) => void
  let toggleZenMode: () => Promise<void>
  let exitZenMode: () => Promise<void>

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = ''
    document.documentElement.classList.remove('zen-mode')

    // Mock the Tauri window API before importing the module
    vi.doMock('@tauri-apps/api/window', () => ({
      getCurrentWindow: () => ({
        setDecorations: vi.fn().mockResolvedValue(undefined),
        setFullscreen: vi.fn().mockResolvedValue(undefined),
      }),
    }))

    // Mock the toast module
    vi.doMock('./toast', () => ({
      toastInfo: vi.fn(),
    }))

    // Reset module cache and reimport to get fresh state
    vi.resetModules()
    const zenMode = await import('./zen-mode')
    isZenModeActive = zenMode.isZenModeActive
    isZenModeTransitioning = zenMode.isZenModeTransitioning
    setZenModeChangeCallback = zenMode.setZenModeChangeCallback
    toggleZenMode = zenMode.toggleZenMode
    exitZenMode = zenMode.exitZenMode
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('isZenModeActive', () => {
    it('returns false initially', () => {
      expect(isZenModeActive()).toBe(false)
    })
  })

  describe('isZenModeTransitioning', () => {
    it('returns false initially', () => {
      expect(isZenModeTransitioning()).toBe(false)
    })
  })

  describe('toggleZenMode', () => {
    it('activates zen mode when currently inactive', async () => {
      await toggleZenMode()
      // Wait for the transition delay
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(isZenModeActive()).toBe(true)
    })

    it('adds zen-mode class to document element', async () => {
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(document.documentElement.classList.contains('zen-mode')).toBe(true)
    })

    it('shows zen mode badge when activated', async () => {
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      const badge = document.querySelector('.zen-mode-badge')
      expect(badge).not.toBeNull()
    })

    it('badge has correct content', async () => {
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      const icon = document.querySelector('.zen-badge-icon')
      const text = document.querySelector('.zen-badge-text')
      expect(icon?.textContent).toBe('Z')
      expect(text?.textContent).toBe('Zen Mode')
    })

    it('badge has correct title', async () => {
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      const badge = document.querySelector('.zen-mode-badge') as HTMLElement
      expect(badge).not.toBeNull()
      expect(badge.title).toContain('exit Zen mode')
    })

    it('deactivates zen mode when currently active', async () => {
      // First activate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(isZenModeActive()).toBe(true)

      // Then deactivate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(isZenModeActive()).toBe(false)
    })

    it('removes zen-mode class when deactivated', async () => {
      // Activate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      // Deactivate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(document.documentElement.classList.contains('zen-mode')).toBe(false)
    })

    it('removes badge when deactivated', async () => {
      // Activate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(document.querySelector('.zen-mode-badge')).not.toBeNull()

      // Deactivate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(document.querySelector('.zen-mode-badge')).toBeNull()
    })

    it('calls change callback when activated', async () => {
      const callback = vi.fn()
      setZenModeChangeCallback(callback)

      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(callback).toHaveBeenCalledWith(true)
    })

    it('calls change callback when deactivated', async () => {
      const callback = vi.fn()

      // Activate first
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      setZenModeChangeCallback(callback)
      callback.mockClear()

      // Deactivate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(callback).toHaveBeenCalledWith(false)
    })
  })

  describe('exitZenMode', () => {
    it('does nothing when zen mode is not active', async () => {
      const callback = vi.fn()
      setZenModeChangeCallback(callback)

      await exitZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(callback).not.toHaveBeenCalled()
      expect(isZenModeActive()).toBe(false)
    })

    it('exits zen mode when active', async () => {
      // First activate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(isZenModeActive()).toBe(true)

      // Then exit
      await exitZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(isZenModeActive()).toBe(false)
    })

    it('removes zen-mode class', async () => {
      // Activate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      // Exit
      await exitZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(document.documentElement.classList.contains('zen-mode')).toBe(false)
    })

    it('removes badge', async () => {
      // Activate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      // Exit
      await exitZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(document.querySelector('.zen-mode-badge')).toBeNull()
    })

    it('calls change callback with false', async () => {
      const callback = vi.fn()

      // Activate
      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      setZenModeChangeCallback(callback)

      // Exit
      await exitZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(callback).toHaveBeenCalledWith(false)
    })
  })

  describe('setZenModeChangeCallback', () => {
    it('can set callback to null', async () => {
      setZenModeChangeCallback(vi.fn())
      setZenModeChangeCallback(null)
      // Should not throw when toggling
      await expect(toggleZenMode()).resolves.not.toThrow()
    })

    it('replaces previous callback', async () => {
      const firstCallback = vi.fn()
      const secondCallback = vi.fn()

      setZenModeChangeCallback(firstCallback)
      setZenModeChangeCallback(secondCallback)

      await toggleZenMode()
      await new Promise((resolve) => setTimeout(resolve, 250))

      expect(firstCallback).not.toHaveBeenCalled()
      expect(secondCallback).toHaveBeenCalled()
    })
  })
})

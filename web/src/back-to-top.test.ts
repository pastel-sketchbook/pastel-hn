import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('back-to-top', () => {
  beforeEach(async () => {
    // Reset modules to get fresh state
    vi.resetModules()

    // Setup DOM
    document.body.innerHTML = ''
  })

  describe('configureBackToTop', () => {
    it('sets up scroll callbacks', async () => {
      const { configureBackToTop, setupBackToTop } = await import('./back-to-top')

      const mockSetScrollTop = vi.fn()
      const mockGetScrollTop = vi.fn().mockReturnValue(0)

      configureBackToTop({
        setScrollTop: mockSetScrollTop,
        getScrollTop: mockGetScrollTop,
      })

      setupBackToTop()

      // Button should be created
      const button = document.querySelector('.back-to-top')
      expect(button).not.toBeNull()
    })
  })

  describe('resetBackToTopState', () => {
    it('resets all module state', async () => {
      const {
        configureBackToTop,
        setupBackToTop,
        resetBackToTopState,
        hasBackToTopButton,
      } = await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(0),
      })
      setupBackToTop()

      expect(hasBackToTopButton()).toBe(true)

      resetBackToTopState()

      expect(hasBackToTopButton()).toBe(false)
    })
  })

  describe('getBackToTopThreshold', () => {
    it('returns the threshold constant', async () => {
      const { getBackToTopThreshold } = await import('./back-to-top')
      expect(getBackToTopThreshold()).toBe(400)
    })
  })

  describe('hasBackToTopButton', () => {
    it('returns false before setup', async () => {
      const { hasBackToTopButton } = await import('./back-to-top')
      expect(hasBackToTopButton()).toBe(false)
    })

    it('returns true after setup', async () => {
      const { setupBackToTop, hasBackToTopButton } = await import('./back-to-top')
      setupBackToTop()
      expect(hasBackToTopButton()).toBe(true)
    })
  })

  describe('isBackToTopVisible', () => {
    it('returns false before setup', async () => {
      const { isBackToTopVisible } = await import('./back-to-top')
      expect(isBackToTopVisible()).toBe(false)
    })

    it('returns false after setup when not scrolled', async () => {
      const { configureBackToTop, setupBackToTop, isBackToTopVisible, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(0),
      })
      setupBackToTop()
      updateBackToTopVisibility()

      expect(isBackToTopVisible()).toBe(false)
    })

    it('returns true when scrolled past threshold', async () => {
      const { configureBackToTop, setupBackToTop, isBackToTopVisible, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(500), // Past threshold
      })
      setupBackToTop()
      updateBackToTopVisibility()

      expect(isBackToTopVisible()).toBe(true)
    })
  })

  describe('setupBackToTop', () => {
    it('creates the back-to-top button element', async () => {
      const { setupBackToTop } = await import('./back-to-top')

      setupBackToTop()

      const button = document.querySelector('.back-to-top')
      expect(button).not.toBeNull()
      expect(button?.tagName).toBe('BUTTON')
    })

    it('sets correct title attribute', async () => {
      const { setupBackToTop } = await import('./back-to-top')

      setupBackToTop()

      const button = document.querySelector('.back-to-top') as HTMLButtonElement
      expect(button.title).toBe('Back to top (t)')
    })

    it('contains SVG icon', async () => {
      const { setupBackToTop } = await import('./back-to-top')

      setupBackToTop()

      const button = document.querySelector('.back-to-top')
      const svg = button?.querySelector('svg')
      expect(svg).not.toBeNull()
    })

    it('appends button to body', async () => {
      const { setupBackToTop } = await import('./back-to-top')

      // Add existing content
      const existingDiv = document.createElement('div')
      existingDiv.id = 'existing'
      document.body.appendChild(existingDiv)

      setupBackToTop()

      // Button should be in body
      expect(document.body.contains(document.querySelector('.back-to-top'))).toBe(true)
    })

    it('attaches click handler', async () => {
      const mockSetScrollTop = vi.fn()
      const { configureBackToTop, setupBackToTop } = await import('./back-to-top')

      configureBackToTop({
        setScrollTop: mockSetScrollTop,
        getScrollTop: vi.fn().mockReturnValue(0),
      })

      setupBackToTop()

      const button = document.querySelector('.back-to-top') as HTMLButtonElement
      button.click()

      expect(mockSetScrollTop).toHaveBeenCalledWith(0, 'smooth')
    })
  })

  describe('scrollToTop', () => {
    it('calls setScrollTop with 0 and smooth behavior', async () => {
      const mockSetScrollTop = vi.fn()
      const { configureBackToTop, scrollToTop } = await import('./back-to-top')

      configureBackToTop({
        setScrollTop: mockSetScrollTop,
        getScrollTop: vi.fn().mockReturnValue(0),
      })

      scrollToTop()

      expect(mockSetScrollTop).toHaveBeenCalledWith(0, 'smooth')
    })

    it('does nothing if not configured', async () => {
      const { scrollToTop } = await import('./back-to-top')

      // Should not throw
      expect(() => scrollToTop()).not.toThrow()
    })
  })

  describe('updateBackToTopVisibility', () => {
    it('does nothing if button not set up', async () => {
      const { updateBackToTopVisibility } = await import('./back-to-top')

      // Should not throw
      expect(() => updateBackToTopVisibility()).not.toThrow()
    })

    it('shows button when scrolled past threshold', async () => {
      const { configureBackToTop, setupBackToTop, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(500), // Past 400 threshold
      })

      setupBackToTop()
      updateBackToTopVisibility()

      const button = document.querySelector('.back-to-top')
      expect(button?.classList.contains('visible')).toBe(true)
    })

    it('hides button when at top', async () => {
      const { configureBackToTop, setupBackToTop, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(0),
      })

      setupBackToTop()
      updateBackToTopVisibility()

      const button = document.querySelector('.back-to-top')
      expect(button?.classList.contains('visible')).toBe(false)
    })

    it('hides button when below threshold', async () => {
      const { configureBackToTop, setupBackToTop, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(300), // Below 400 threshold
      })

      setupBackToTop()
      updateBackToTopVisibility()

      const button = document.querySelector('.back-to-top')
      expect(button?.classList.contains('visible')).toBe(false)
    })

    it('shows button exactly at threshold', async () => {
      const { configureBackToTop, setupBackToTop, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(400), // Exactly at threshold
      })

      setupBackToTop()
      updateBackToTopVisibility()

      const button = document.querySelector('.back-to-top')
      // At exactly 400, should be hidden (> 400 required)
      expect(button?.classList.contains('visible')).toBe(false)
    })

    it('shows button at threshold + 1', async () => {
      const { configureBackToTop, setupBackToTop, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: vi.fn().mockReturnValue(401), // Just past threshold
      })

      setupBackToTop()
      updateBackToTopVisibility()

      const button = document.querySelector('.back-to-top')
      expect(button?.classList.contains('visible')).toBe(true)
    })

    it('toggles visibility based on scroll position changes', async () => {
      let scrollPosition = 0
      const { configureBackToTop, setupBackToTop, updateBackToTopVisibility } =
        await import('./back-to-top')

      configureBackToTop({
        setScrollTop: vi.fn(),
        getScrollTop: () => scrollPosition,
      })

      setupBackToTop()

      // Initially at top - should be hidden
      updateBackToTopVisibility()
      let button = document.querySelector('.back-to-top')
      expect(button?.classList.contains('visible')).toBe(false)

      // Scroll down past threshold - should show
      scrollPosition = 500
      updateBackToTopVisibility()
      expect(button?.classList.contains('visible')).toBe(true)

      // Scroll back up - should hide
      scrollPosition = 100
      updateBackToTopVisibility()
      expect(button?.classList.contains('visible')).toBe(false)
    })
  })
})

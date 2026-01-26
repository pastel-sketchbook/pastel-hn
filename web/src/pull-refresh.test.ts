import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('pull-refresh', () => {
  beforeEach(async () => {
    // Reset modules to get fresh state
    vi.resetModules()

    // Setup DOM
    document.body.innerHTML = ''
  })

  describe('configurePullRefresh', () => {
    it('sets up callbacks for refresh actions', async () => {
      const { configurePullRefresh, setupPullToRefresh } = await import(
        './pull-refresh'
      )

      const mockOnRefresh = vi.fn().mockResolvedValue(undefined)
      const mockGetScrollTop = vi.fn().mockReturnValue(0)
      const mockCanRefresh = vi.fn().mockReturnValue(true)
      const mockIsLoading = vi.fn().mockReturnValue(false)

      configurePullRefresh({
        onRefresh: mockOnRefresh,
        getScrollTop: mockGetScrollTop,
        canRefresh: mockCanRefresh,
        isLoading: mockIsLoading,
      })

      setupPullToRefresh()

      // Indicator should be created
      const indicator = document.querySelector('.pull-refresh-indicator')
      expect(indicator).not.toBeNull()
    })
  })

  describe('resetPullRefreshState', () => {
    it('resets all module state', async () => {
      const {
        configurePullRefresh,
        resetPullRefreshState,
        isPullActive,
        isPullRefreshEnabled,
        getPullDistance,
      } = await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: vi.fn().mockResolvedValue(undefined),
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      resetPullRefreshState()

      expect(isPullActive()).toBe(false)
      expect(isPullRefreshEnabled()).toBe(true)
      expect(getPullDistance()).toBe(0)
    })
  })

  describe('isPullActive', () => {
    it('returns false by default', async () => {
      const { isPullActive } = await import('./pull-refresh')
      expect(isPullActive()).toBe(false)
    })
  })

  describe('isPullRefreshEnabled', () => {
    it('returns true by default', async () => {
      const { isPullRefreshEnabled } = await import('./pull-refresh')
      expect(isPullRefreshEnabled()).toBe(true)
    })
  })

  describe('getPullDistance', () => {
    it('returns 0 by default', async () => {
      const { getPullDistance } = await import('./pull-refresh')
      expect(getPullDistance()).toBe(0)
    })
  })

  describe('getPullThreshold', () => {
    it('returns the threshold constant', async () => {
      const { getPullThreshold } = await import('./pull-refresh')
      expect(getPullThreshold()).toBe(80)
    })
  })

  describe('setupPullToRefresh', () => {
    it('creates the pull refresh indicator element', async () => {
      const { setupPullToRefresh } = await import('./pull-refresh')

      setupPullToRefresh()

      const indicator = document.querySelector('.pull-refresh-indicator')
      expect(indicator).not.toBeNull()
    })

    it('creates indicator with correct structure', async () => {
      const { setupPullToRefresh } = await import('./pull-refresh')

      setupPullToRefresh()

      const content = document.querySelector('.pull-refresh-content')
      const spinner = document.querySelector('.pull-refresh-spinner')
      const text = document.querySelector('.pull-refresh-text')

      expect(content).not.toBeNull()
      expect(spinner).not.toBeNull()
      expect(text).not.toBeNull()
      expect(text?.textContent).toBe('Pull to refresh')
    })

    it('prepends indicator to body', async () => {
      const { setupPullToRefresh } = await import('./pull-refresh')

      // Add existing content
      const existingDiv = document.createElement('div')
      existingDiv.id = 'existing'
      document.body.appendChild(existingDiv)

      setupPullToRefresh()

      // Indicator should be first child
      expect(document.body.firstElementChild?.className).toBe(
        'pull-refresh-indicator',
      )
    })
  })

  describe('updatePullIndicator', () => {
    it('updates indicator position and opacity based on distance', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(40, false) // Half of threshold

      const indicator = document.querySelector(
        '.pull-refresh-indicator',
      ) as HTMLElement
      expect(indicator.style.opacity).toBe('0.5') // 40/80 = 0.5
    })

    it('clamps progress to 1.5 max', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(200, false) // Well above threshold

      const indicator = document.querySelector(
        '.pull-refresh-indicator',
      ) as HTMLElement
      expect(indicator.style.opacity).toBe('1') // Clamped to 1
    })

    it('shows "Release to refresh" when threshold reached', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(80, false) // At threshold

      const text = document.querySelector('.pull-refresh-text')
      expect(text?.textContent).toBe('Release to refresh')
    })

    it('shows "Pull to refresh" when below threshold', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(40, false) // Below threshold

      const text = document.querySelector('.pull-refresh-text')
      expect(text?.textContent).toBe('Pull to refresh')
    })

    it('shows "Refreshing..." when loading', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(80, true) // Loading state

      const text = document.querySelector('.pull-refresh-text')
      expect(text?.textContent).toBe('Refreshing...')
    })

    it('adds spinning class when loading', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(80, true)

      const spinner = document.querySelector('.pull-refresh-spinner')
      expect(spinner?.classList.contains('spinning')).toBe(true)
    })

    it('removes spinning class when not loading', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(80, true) // Add spinning
      updatePullIndicator(80, false) // Remove spinning

      const spinner = document.querySelector('.pull-refresh-spinner')
      expect(spinner?.classList.contains('spinning')).toBe(false)
    })

    it('does nothing if indicator not found', async () => {
      const { updatePullIndicator } = await import('./pull-refresh')

      // Should not throw
      expect(() => updatePullIndicator(80, false)).not.toThrow()
    })

    it('hides indicator when distance is 0', async () => {
      const { setupPullToRefresh, updatePullIndicator } = await import(
        './pull-refresh'
      )

      setupPullToRefresh()
      updatePullIndicator(0, false)

      const indicator = document.querySelector(
        '.pull-refresh-indicator',
      ) as HTMLElement
      expect(indicator.style.opacity).toBe('0')
      expect(indicator.style.transform).toBe('translateY(-60px)')
    })
  })

  describe('touch events', () => {
    it('initiates pull on touchstart when at top', async () => {
      const { configurePullRefresh, setupPullToRefresh, isPullActive } =
        await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: vi.fn().mockResolvedValue(undefined),
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Simulate touchstart
      const touchStartEvent = new TouchEvent('touchstart', {
        touches: [{ clientY: 100 } as Touch],
      })
      document.dispatchEvent(touchStartEvent)

      expect(isPullActive()).toBe(true)
    })

    it('does not initiate pull when not at top', async () => {
      const { configurePullRefresh, setupPullToRefresh, isPullActive } =
        await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: vi.fn().mockResolvedValue(undefined),
        getScrollTop: vi.fn().mockReturnValue(100), // Not at top
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      const touchStartEvent = new TouchEvent('touchstart', {
        touches: [{ clientY: 100 } as Touch],
      })
      document.dispatchEvent(touchStartEvent)

      expect(isPullActive()).toBe(false)
    })

    it('does not initiate pull when loading', async () => {
      const { configurePullRefresh, setupPullToRefresh, isPullActive } =
        await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: vi.fn().mockResolvedValue(undefined),
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(true), // Loading
      })

      setupPullToRefresh()

      const touchStartEvent = new TouchEvent('touchstart', {
        touches: [{ clientY: 100 } as Touch],
      })
      document.dispatchEvent(touchStartEvent)

      expect(isPullActive()).toBe(false)
    })

    it('does not initiate pull when canRefresh returns false', async () => {
      const { configurePullRefresh, setupPullToRefresh, isPullActive } =
        await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: vi.fn().mockResolvedValue(undefined),
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(false), // Can't refresh
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      const touchStartEvent = new TouchEvent('touchstart', {
        touches: [{ clientY: 100 } as Touch],
      })
      document.dispatchEvent(touchStartEvent)

      expect(isPullActive()).toBe(false)
    })

    it('updates pull distance on touchmove', async () => {
      const { configurePullRefresh, setupPullToRefresh, getPullDistance } =
        await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: vi.fn().mockResolvedValue(undefined),
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Start touch
      document.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientY: 100 } as Touch],
        }),
      )

      // Move touch down
      document.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientY: 150 } as Touch],
        }),
      )

      expect(getPullDistance()).toBe(50)
    })

    it('triggers refresh on touchend when threshold met', async () => {
      const mockOnRefresh = vi.fn().mockResolvedValue(undefined)
      const { configurePullRefresh, setupPullToRefresh } = await import(
        './pull-refresh'
      )

      configurePullRefresh({
        onRefresh: mockOnRefresh,
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Start touch
      document.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientY: 100 } as Touch],
        }),
      )

      // Move touch beyond threshold
      document.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientY: 200 } as Touch], // 100px pull
        }),
      )

      // End touch
      document.dispatchEvent(new TouchEvent('touchend'))

      // Wait for async refresh
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(mockOnRefresh).toHaveBeenCalled()
    })

    it('does not trigger refresh if below threshold', async () => {
      const mockOnRefresh = vi.fn().mockResolvedValue(undefined)
      const { configurePullRefresh, setupPullToRefresh } = await import(
        './pull-refresh'
      )

      configurePullRefresh({
        onRefresh: mockOnRefresh,
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Start touch
      document.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientY: 100 } as Touch],
        }),
      )

      // Move touch below threshold
      document.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientY: 130 } as Touch], // Only 30px pull
        }),
      )

      // End touch
      document.dispatchEvent(new TouchEvent('touchend'))

      expect(mockOnRefresh).not.toHaveBeenCalled()
    })

    it('resets state on touchend', async () => {
      const { configurePullRefresh, setupPullToRefresh, isPullActive, getPullDistance } =
        await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: vi.fn().mockResolvedValue(undefined),
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Start and move touch
      document.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [{ clientY: 100 } as Touch],
        }),
      )
      document.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [{ clientY: 130 } as Touch],
        }),
      )

      // End touch
      document.dispatchEvent(new TouchEvent('touchend'))

      expect(isPullActive()).toBe(false)
      expect(getPullDistance()).toBe(0)
    })
  })

  describe('wheel events', () => {
    it('does not trigger refresh when scrolling down', async () => {
      const mockOnRefresh = vi.fn().mockResolvedValue(undefined)
      const { configurePullRefresh, setupPullToRefresh } = await import(
        './pull-refresh'
      )

      configurePullRefresh({
        onRefresh: mockOnRefresh,
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Scroll down (positive deltaY)
      document.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 100,
        }),
      )

      expect(mockOnRefresh).not.toHaveBeenCalled()
    })

    it('does not trigger when not at top', async () => {
      const mockOnRefresh = vi.fn().mockResolvedValue(undefined)
      const { configurePullRefresh, setupPullToRefresh } = await import(
        './pull-refresh'
      )

      configurePullRefresh({
        onRefresh: mockOnRefresh,
        getScrollTop: vi.fn().mockReturnValue(100), // Not at top
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Scroll up at position not at top
      document.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -200,
        }),
      )

      expect(mockOnRefresh).not.toHaveBeenCalled()
    })

    it('triggers refresh after accumulated wheel events exceed threshold', async () => {
      const mockOnRefresh = vi.fn().mockResolvedValue(undefined)
      const { configurePullRefresh, setupPullToRefresh } = await import(
        './pull-refresh'
      )

      configurePullRefresh({
        onRefresh: mockOnRefresh,
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Multiple wheel events to exceed threshold (80 * 2 = 160)
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -50, // Scrolling up
          }),
        )
      }

      // Wait for async
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(mockOnRefresh).toHaveBeenCalled()
    })

    it('disables temporarily after refresh to prevent rapid refreshes', async () => {
      const mockOnRefresh = vi.fn().mockResolvedValue(undefined)
      const { configurePullRefresh, setupPullToRefresh, isPullRefreshEnabled } =
        await import('./pull-refresh')

      configurePullRefresh({
        onRefresh: mockOnRefresh,
        getScrollTop: vi.fn().mockReturnValue(0),
        canRefresh: vi.fn().mockReturnValue(true),
        isLoading: vi.fn().mockReturnValue(false),
      })

      setupPullToRefresh()

      // Trigger refresh with wheel
      for (let i = 0; i < 5; i++) {
        document.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: -50,
          }),
        )
      }

      await new Promise((resolve) => setTimeout(resolve, 50))

      // Should be disabled
      expect(isPullRefreshEnabled()).toBe(false)

      // Should re-enable after delay
      await new Promise((resolve) => setTimeout(resolve, 1100))
      expect(isPullRefreshEnabled()).toBe(true)
    })
  })
})

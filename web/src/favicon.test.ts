import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFaviconElement,
  destroyFaviconLazyLoading,
  getFaviconUrl,
  handleFaviconError,
  initFaviconLazyLoading,
} from './favicon'

describe('favicon', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  afterEach(() => {
    destroyFaviconLazyLoading()
    vi.unstubAllGlobals()
  })

  describe('getFaviconUrl', () => {
    it('returns Google favicon service URL for domain', () => {
      const url = getFaviconUrl('example.com')
      expect(url).toBe(
        'https://www.google.com/s2/favicons?domain=example.com&sz=16',
      )
    })

    it('handles domains with subdomains', () => {
      const url = getFaviconUrl('blog.example.com')
      expect(url).toBe(
        'https://www.google.com/s2/favicons?domain=blog.example.com&sz=16',
      )
    })

    it('returns empty string for empty domain', () => {
      const url = getFaviconUrl('')
      expect(url).toBe('')
    })

    it('returns empty string for null domain', () => {
      const url = getFaviconUrl(null as unknown as string)
      expect(url).toBe('')
    })
  })

  describe('createFaviconElement', () => {
    it('creates img element with correct attributes', () => {
      const html = createFaviconElement('example.com')
      expect(html).toContain('<img')
      expect(html).toContain('class="favicon"')
      expect(html).toContain('loading="lazy"')
      expect(html).toContain('width="16"')
      expect(html).toContain('height="16"')
      expect(html).toContain('alt=""')
    })

    it('uses data-domain for lazy loading', () => {
      const html = createFaviconElement('example.com')
      expect(html).toContain('data-domain="example.com"')
    })

    it('returns empty string for empty domain', () => {
      const html = createFaviconElement('')
      expect(html).toBe('')
    })

    it('escapes domain to prevent XSS', () => {
      const html = createFaviconElement('"><script>alert(1)</script>')
      // escapeHtml converts < to &lt; and > to &gt;
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })
  })

  describe('handleFaviconError', () => {
    it('hides the favicon image on error', () => {
      const img = document.createElement('img')
      img.style.display = 'inline'
      document.body.appendChild(img)

      handleFaviconError(img)

      expect(img.style.display).toBe('none')
    })

    it('removes onerror handler to prevent loops', () => {
      const img = document.createElement('img')
      img.onerror = vi.fn()
      document.body.appendChild(img)

      handleFaviconError(img)

      expect(img.onerror).toBeNull()
    })
  })

  describe('initFaviconLazyLoading', () => {
    it('creates IntersectionObserver when available', () => {
      const mockObserve = vi.fn()
      const mockConstructor = vi.fn()
      class MockIntersectionObserver {
        observe = mockObserve
        unobserve = vi.fn()
        disconnect = vi.fn()
        constructor(
          public callback: IntersectionObserverCallback,
          public options?: IntersectionObserverInit,
        ) {
          mockConstructor(callback, options)
        }
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      initFaviconLazyLoading()

      // Verify observer was created with correct options
      expect(mockConstructor).toHaveBeenCalledTimes(1)
      expect(mockConstructor).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          rootMargin: '200px',
          threshold: 0,
        }),
      )
    })

    it('falls back to loading all favicons when IntersectionObserver unavailable', () => {
      // Remove IntersectionObserver to simulate older browser
      vi.stubGlobal('IntersectionObserver', undefined)

      document.body.innerHTML = `
        <img class="favicon" data-domain="example.com">
        <img class="favicon" data-domain="test.com">
      `

      initFaviconLazyLoading()

      // All favicons should be loaded immediately
      const favicons = document.querySelectorAll<HTMLImageElement>('.favicon')
      expect(favicons[0].getAttribute('src')).toContain('example.com')
      expect(favicons[1].getAttribute('src')).toContain('test.com')
    })

    it('observes existing favicon elements', () => {
      const mockObserve = vi.fn()
      class MockIntersectionObserver {
        observe = mockObserve
        unobserve = vi.fn()
        disconnect = vi.fn()
        constructor(public callback: IntersectionObserverCallback) {}
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      document.body.innerHTML = `
        <img class="favicon" data-domain="example.com">
        <img class="favicon" data-domain="test.com">
      `

      initFaviconLazyLoading()

      expect(mockObserve).toHaveBeenCalledTimes(2)
    })

    it('loads favicon when element becomes visible', () => {
      let capturedCallback: IntersectionObserverCallback | null = null
      class MockIntersectionObserver {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
        constructor(callback: IntersectionObserverCallback) {
          capturedCallback = callback
        }
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      document.body.innerHTML = `
        <img class="favicon" data-domain="example.com">
      `

      initFaviconLazyLoading()

      const img = document.querySelector('.favicon') as HTMLImageElement

      // Simulate intersection
      capturedCallback?.(
        [
          {
            isIntersecting: true,
            target: img,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      )

      expect(img.src).toContain('example.com')
    })

    it('sets up error handler when loading favicon', () => {
      let capturedCallback: IntersectionObserverCallback | null = null
      class MockIntersectionObserver {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
        constructor(callback: IntersectionObserverCallback) {
          capturedCallback = callback
        }
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      document.body.innerHTML = `
        <img class="favicon" data-domain="example.com">
      `

      initFaviconLazyLoading()

      const img = document.querySelector('.favicon') as HTMLImageElement

      // Verify no onerror before loading
      expect(img.onerror).toBeNull()

      // Simulate intersection to trigger loading
      capturedCallback?.(
        [
          {
            isIntersecting: true,
            target: img,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      )

      // Error handler should be set after loading
      expect(img.onerror).not.toBeNull()

      // Trigger error and verify handler hides the image
      img.onerror?.(new Event('error'))
      expect(img.style.display).toBe('none')
    })

    it('does not load favicon when element is not visible', () => {
      let capturedCallback: IntersectionObserverCallback | null = null
      class MockIntersectionObserver {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
        constructor(callback: IntersectionObserverCallback) {
          capturedCallback = callback
        }
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      document.body.innerHTML = `
        <img class="favicon" data-domain="example.com">
      `

      initFaviconLazyLoading()

      const img = document.querySelector('.favicon') as HTMLImageElement

      // Simulate no intersection
      capturedCallback?.(
        [
          {
            isIntersecting: false,
            target: img,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      )

      // Use getAttribute to check raw attribute (browser resolves img.src to full URL)
      expect(img.getAttribute('src')).toBeNull()
    })

    it('unobserves element after loading', () => {
      let capturedCallback: IntersectionObserverCallback | null = null
      const mockUnobserve = vi.fn()
      class MockIntersectionObserver {
        observe = vi.fn()
        unobserve = mockUnobserve
        disconnect = vi.fn()
        constructor(callback: IntersectionObserverCallback) {
          capturedCallback = callback
        }
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      document.body.innerHTML = `
        <img class="favicon" data-domain="example.com">
      `

      initFaviconLazyLoading()

      const img = document.querySelector('.favicon') as HTMLImageElement

      capturedCallback?.(
        [
          {
            isIntersecting: true,
            target: img,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      )

      expect(mockUnobserve).toHaveBeenCalledWith(img)
    })
  })

  describe('destroyFaviconLazyLoading', () => {
    it('disconnects the observer', () => {
      const mockDisconnect = vi.fn()
      class MockIntersectionObserver {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = mockDisconnect
        constructor(public callback: IntersectionObserverCallback) {}
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      initFaviconLazyLoading()
      destroyFaviconLazyLoading()

      expect(mockDisconnect).toHaveBeenCalled()
    })

    it('does nothing if not initialized', () => {
      // Should not throw
      expect(() => destroyFaviconLazyLoading()).not.toThrow()
    })
  })

  describe('observeNewFavicons', () => {
    it('observes newly added favicon elements', async () => {
      const mockObserve = vi.fn()
      class MockIntersectionObserver {
        observe = mockObserve
        unobserve = vi.fn()
        disconnect = vi.fn()
        constructor(public callback: IntersectionObserverCallback) {}
      }
      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

      initFaviconLazyLoading()

      // Clear initial observe calls
      mockObserve.mockClear()

      // Dynamically add a new favicon element
      const newFavicon = document.createElement('img')
      newFavicon.className = 'favicon'
      newFavicon.dataset.domain = 'newsite.com'
      document.body.appendChild(newFavicon)

      // Import and call observeNewFavicons
      const { observeNewFavicons } = await import('./favicon')
      observeNewFavicons()

      expect(mockObserve).toHaveBeenCalledWith(newFavicon)
    })
  })
})

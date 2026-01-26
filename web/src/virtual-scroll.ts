/**
 * Virtual Scroll implementation for efficient rendering of large lists.
 * Only renders items that are visible in the viewport plus a buffer zone.
 */

export interface VirtualScrollOptions<T> {
  /** Container element to render items into */
  container: HTMLElement
  /** Element that handles scrolling (defaults to finding scrollable parent) */
  scrollElement?: HTMLElement
  /** Estimated height of each item in pixels */
  itemHeight: number
  /** Number of items to render outside the viewport as buffer */
  bufferSize?: number
  /** Callback to render an item to HTML string */
  renderItem: (item: T, index: number) => string
  /** Callback when user scrolls near the end (for infinite scroll) */
  onNearEnd?: () => void
  /** Distance from bottom to trigger onNearEnd */
  nearEndThreshold?: number
}

export interface VirtualScrollState<T> {
  items: T[]
  scrollTop: number
  containerHeight: number
  startIndex: number
  endIndex: number
  offsetY: number
}

export class VirtualScroll<T> {
  private container: HTMLElement
  private scrollElement: HTMLElement | null = null
  private itemHeight: number
  private bufferSize: number
  private renderItem: (item: T, index: number) => string
  private onNearEnd?: () => void
  private nearEndThreshold: number

  private items: T[] = []
  private scrollTop = 0
  private containerHeight = 0
  private startIndex = 0
  private endIndex = 0
  private isNearEndTriggered = false
  private isRendering = false

  // Inner containers
  private scrollSpacer: HTMLElement | null = null
  private itemsContainer: HTMLElement | null = null

  // Cached item heights for variable height support (future enhancement)
  private measuredHeights: Map<number, number> = new Map()

  // Scroll handler reference for cleanup
  private scrollHandler: (() => void) | null = null
  private resizeObserver: ResizeObserver | null = null

  constructor(options: VirtualScrollOptions<T>) {
    this.container = options.container
    this.scrollElement = options.scrollElement ?? null
    this.itemHeight = options.itemHeight
    this.bufferSize = options.bufferSize ?? 5
    this.renderItem = options.renderItem
    this.onNearEnd = options.onNearEnd
    this.nearEndThreshold = options.nearEndThreshold ?? 200
  }

  /**
   * Find the scrollable parent element
   */
  private findScrollParent(): HTMLElement | null {
    let element: HTMLElement | null = this.container.parentElement
    while (element) {
      const style = getComputedStyle(element)
      if (
        style.overflowY === 'auto' ||
        style.overflowY === 'scroll' ||
        element.tagName === 'MAIN'
      ) {
        return element
      }
      element = element.parentElement
    }
    return null
  }

  /**
   * Initialize the virtual scroll with items
   */
  init(items: T[]): void {
    this.items = items
    this.isNearEndTriggered = false
    this.measuredHeights.clear()

    // Find scroll element if not provided
    if (!this.scrollElement) {
      this.scrollElement = this.findScrollParent()
    }

    // Create scroll structure
    this.container.innerHTML = ''
    this.container.style.position = 'relative'

    // Spacer to maintain scroll height
    this.scrollSpacer = document.createElement('div')
    this.scrollSpacer.className = 'virtual-scroll-spacer'
    this.scrollSpacer.style.height = `${this.getTotalHeight()}px`
    this.scrollSpacer.style.position = 'relative'
    this.container.appendChild(this.scrollSpacer)

    // Items container (positioned absolutely)
    this.itemsContainer = document.createElement('div')
    this.itemsContainer.className = 'virtual-scroll-items'
    this.itemsContainer.style.position = 'absolute'
    this.itemsContainer.style.top = '0'
    this.itemsContainer.style.left = '0'
    this.itemsContainer.style.right = '0'
    this.scrollSpacer.appendChild(this.itemsContainer)

    // Set up scroll listener on scroll element or window
    this.scrollHandler = this.handleScroll.bind(this)
    if (this.scrollElement) {
      this.scrollElement.addEventListener('scroll', this.scrollHandler, {
        passive: true,
      })
    } else {
      window.addEventListener('scroll', this.scrollHandler, { passive: true })
    }

    // Set up resize observer with debounce
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    this.resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        this.updateContainerHeight()
        this.render()
      }, 100)
    })
    if (this.scrollElement) {
      this.resizeObserver.observe(this.scrollElement)
    } else {
      this.resizeObserver.observe(document.documentElement)
    }

    // Initial render
    this.updateContainerHeight()
    this.render()
  }

  /**
   * Update items (for infinite scroll append)
   */
  updateItems(items: T[]): void {
    this.items = items
    this.isNearEndTriggered = false

    if (this.scrollSpacer) {
      this.scrollSpacer.style.height = `${this.getTotalHeight()}px`
    }

    this.render()
  }

  /**
   * Append items to the end
   */
  appendItems(newItems: T[]): void {
    this.items = [...this.items, ...newItems]
    this.isNearEndTriggered = false

    if (this.scrollSpacer) {
      this.scrollSpacer.style.height = `${this.getTotalHeight()}px`
    }

    this.render()
  }

  /**
   * Get total scrollable height
   */
  private getTotalHeight(): number {
    return this.items.length * this.itemHeight
  }

  /**
   * Update container height based on scroll element
   */
  private updateContainerHeight(): void {
    if (this.scrollElement) {
      this.containerHeight = this.scrollElement.clientHeight
    } else {
      this.containerHeight = window.innerHeight
    }
  }

  /**
   * Handle scroll events
   */
  private handleScroll(): void {
    if (this.scrollElement) {
      this.scrollTop = this.scrollElement.scrollTop
    } else {
      this.scrollTop = window.scrollY
    }
    this.render()

    // Check if near end for infinite scroll
    if (this.onNearEnd && !this.isNearEndTriggered) {
      const totalHeight = this.getTotalHeight()
      const scrolledDistance = this.scrollTop + this.containerHeight

      if (scrolledDistance >= totalHeight - this.nearEndThreshold) {
        this.isNearEndTriggered = true
        this.onNearEnd()
      }
    }
  }

  /**
   * Calculate which items should be visible
   */
  private calculateVisibleRange(): { start: number; end: number } {
    // Calculate visible range based on scroll position
    const start = Math.floor(this.scrollTop / this.itemHeight)
    const visibleCount = Math.ceil(this.containerHeight / this.itemHeight)
    const end = start + visibleCount

    // Add buffer
    const bufferedStart = Math.max(0, start - this.bufferSize)
    const bufferedEnd = Math.min(this.items.length, end + this.bufferSize)

    return { start: bufferedStart, end: bufferedEnd }
  }

  /**
   * Render visible items
   */
  private render(): void {
    if (!this.itemsContainer || this.items.length === 0 || this.isRendering)
      return

    const { start, end } = this.calculateVisibleRange()

    // Only re-render if range changed significantly
    if (start === this.startIndex && end === this.endIndex) return

    this.isRendering = true

    try {
      this.startIndex = start
      this.endIndex = end

      // Calculate offset for positioned items
      const offsetY = start * this.itemHeight
      this.itemsContainer.style.top = `${offsetY}px`

      // Render visible items
      const visibleItems = this.items.slice(start, end)
      const html = visibleItems
        .map((item, idx) => this.renderItem(item, start + idx))
        .join('')

      this.itemsContainer.innerHTML = html
    } finally {
      this.isRendering = false
    }
  }

  /**
   * Force re-render of all visible items (useful when styling changes)
   */
  forceRender(): void {
    // Reset indices to force a full re-render
    this.startIndex = -1
    this.endIndex = -1
    this.render()
  }

  /**
   * Scroll to a specific item index
   */
  scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth'): void {
    const targetY = index * this.itemHeight
    if (this.scrollElement) {
      this.scrollElement.scrollTo({ top: targetY, behavior })
    } else {
      window.scrollTo({ top: targetY, behavior })
    }
  }

  /**
   * Get currently visible items
   */
  getVisibleItems(): T[] {
    return this.items.slice(this.startIndex, this.endIndex)
  }

  /**
   * Get the index of the first visible item
   */
  getFirstVisibleIndex(): number {
    return this.startIndex
  }

  /**
   * Reset the near-end trigger (call after loading more items)
   */
  resetNearEndTrigger(): void {
    this.isNearEndTriggered = false
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    if (this.scrollHandler) {
      if (this.scrollElement) {
        this.scrollElement.removeEventListener('scroll', this.scrollHandler)
      } else {
        window.removeEventListener('scroll', this.scrollHandler)
      }
      this.scrollHandler = null
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    this.items = []
    this.measuredHeights.clear()
  }

  /**
   * Get state for debugging/testing
   */
  getState(): VirtualScrollState<T> {
    return {
      items: this.items,
      scrollTop: this.scrollTop,
      containerHeight: this.containerHeight,
      startIndex: this.startIndex,
      endIndex: this.endIndex,
      offsetY: this.startIndex * this.itemHeight,
    }
  }
}

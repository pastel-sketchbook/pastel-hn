/**
 * Virtual Scroll implementation for efficient rendering of large lists.
 * Only renders items that are visible in the viewport plus a buffer zone.
 */

export interface VirtualScrollOptions<T> {
  /** Container element to render items into */
  container: HTMLElement
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
    this.itemHeight = options.itemHeight
    this.bufferSize = options.bufferSize ?? 5
    this.renderItem = options.renderItem
    this.onNearEnd = options.onNearEnd
    this.nearEndThreshold = options.nearEndThreshold ?? 200
  }

  /**
   * Initialize the virtual scroll with items
   */
  init(items: T[]): void {
    this.items = items
    this.isNearEndTriggered = false
    this.measuredHeights.clear()

    // Create scroll structure
    this.container.innerHTML = ''
    this.container.style.position = 'relative'
    this.container.style.overflow = 'visible' // Let window handle scroll

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
    this.itemsContainer.style.zIndex = '1' // Stay below sticky header (z-index: 100)
    this.scrollSpacer.appendChild(this.itemsContainer)

    // Set up scroll listener on window
    this.scrollHandler = this.handleScroll.bind(this)
    window.addEventListener('scroll', this.scrollHandler, { passive: true })

    // Set up resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.updateContainerHeight()
      this.render()
    })
    this.resizeObserver.observe(document.documentElement)

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
   * Get the offset of the container from the top of the page
   */
  private getContainerOffset(): number {
    return this.container.getBoundingClientRect().top + window.scrollY
  }

  /**
   * Update container height based on viewport
   */
  private updateContainerHeight(): void {
    this.containerHeight = window.innerHeight
  }

  /**
   * Handle scroll events
   */
  private handleScroll(): void {
    this.scrollTop = window.scrollY
    this.render()

    // Check if near end for infinite scroll
    if (this.onNearEnd && !this.isNearEndTriggered) {
      const totalHeight = this.getTotalHeight()
      const scrolledDistance =
        this.scrollTop - this.getContainerOffset() + this.containerHeight

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
    const containerOffset = this.getContainerOffset()
    const relativeScrollTop = Math.max(0, this.scrollTop - containerOffset)

    // Calculate visible range
    const start = Math.floor(relativeScrollTop / this.itemHeight)
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
    if (!this.itemsContainer || this.items.length === 0) return

    const { start, end } = this.calculateVisibleRange()

    // Only re-render if range changed significantly
    if (start === this.startIndex && end === this.endIndex) return

    this.startIndex = start
    this.endIndex = end

    // Calculate offset for positioned items
    const offsetY = start * this.itemHeight
    this.itemsContainer.style.transform = `translateY(${offsetY}px)`

    // Render visible items
    const visibleItems = this.items.slice(start, end)
    const html = visibleItems
      .map((item, idx) => this.renderItem(item, start + idx))
      .join('')

    this.itemsContainer.innerHTML = html
  }

  /**
   * Scroll to a specific item index
   */
  scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth'): void {
    const targetY = this.getContainerOffset() + index * this.itemHeight
    window.scrollTo({ top: targetY, behavior })
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
      window.removeEventListener('scroll', this.scrollHandler)
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

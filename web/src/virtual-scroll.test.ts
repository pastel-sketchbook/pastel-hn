import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VirtualScroll } from './virtual-scroll'

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

interface TestItem {
  id: number
  text?: string
}

describe('VirtualScroll', () => {
  let container: HTMLElement
  let mockWindow: Window & typeof globalThis
  let originalResizeObserver: typeof ResizeObserver | undefined

  beforeEach(() => {
    // Set up a mock DOM
    const dom = new JSDOM('<!DOCTYPE html><div id="container"></div>', {
      url: 'http://localhost',
    })
    mockWindow = dom.window as unknown as Window & typeof globalThis
    // @ts-expect-error - overriding globals for testing
    globalThis.window = mockWindow
    // @ts-expect-error - overriding globals for testing
    globalThis.document = dom.window.document
    const el = document.getElementById('container')
    if (!el) throw new Error('Test container not found')
    container = el

    // Mock ResizeObserver
    originalResizeObserver = globalThis.ResizeObserver
    // @ts-expect-error - mock implementation
    globalThis.ResizeObserver = MockResizeObserver
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    }
  })

  it('initializes with correct structure', () => {
    const items: TestItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      text: `Item ${i}`,
    }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div class="item">${item.text}</div>`,
    })

    vs.init(items)

    expect(container.querySelector('.virtual-scroll-spacer')).toBeTruthy()
    expect(container.querySelector('.virtual-scroll-items')).toBeTruthy()

    vs.destroy()
  })

  it('calculates total height correctly', () => {
    const items: TestItem[] = Array.from({ length: 100 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div>${item.id}</div>`,
    })

    vs.init(items)

    const spacer = container.querySelector(
      '.virtual-scroll-spacer',
    ) as HTMLElement
    expect(spacer.style.height).toBe('5000px') // 100 items * 50px

    vs.destroy()
  })

  it('appends items correctly', () => {
    const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div>${item.id}</div>`,
    })

    vs.init(items)

    const newItems: TestItem[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 10,
    }))
    vs.appendItems(newItems)

    const state = vs.getState()
    expect(state.items.length).toBe(15)

    const spacer = container.querySelector(
      '.virtual-scroll-spacer',
    ) as HTMLElement
    expect(spacer.style.height).toBe('750px') // 15 items * 50px

    vs.destroy()
  })

  it('cleans up on destroy', () => {
    const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div>${item.id}</div>`,
    })

    vs.init(items)
    vs.destroy()

    const state = vs.getState()
    expect(state.items.length).toBe(0)
  })

  it('tracks near end trigger state', () => {
    const onNearEnd = vi.fn()
    const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div>${item.id}</div>`,
      onNearEnd,
      nearEndThreshold: 200,
    })

    vs.init(items)

    // The onNearEnd callback is set up - verify state is initialized
    const state = vs.getState()
    expect(state.items.length).toBe(10)

    // Reset trigger should work without error
    vs.resetNearEndTrigger()

    vs.destroy()
  })

  it('provides correct visible item range', () => {
    const items: TestItem[] = Array.from({ length: 100 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      bufferSize: 3,
      renderItem: (item) => `<div>${item.id}</div>`,
    })

    vs.init(items)

    const visibleItems = vs.getVisibleItems()
    expect(visibleItems.length).toBeGreaterThan(0)
    expect(vs.getFirstVisibleIndex()).toBeGreaterThanOrEqual(0)

    vs.destroy()
  })

  it('resets near end trigger', () => {
    const onNearEnd = vi.fn()
    const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div>${item.id}</div>`,
      onNearEnd,
      nearEndThreshold: 200,
    })

    vs.init(items)
    vs.resetNearEndTrigger()

    // Should be able to trigger again
    const state = vs.getState()
    expect(state.items.length).toBe(10)

    vs.destroy()
  })

  it('prevents re-entrant renders using isRendering guard', async () => {
    let renderCount = 0
    const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => {
        renderCount++
        // Trigger another render inside the render loop!
        if (renderCount === 1) {
          vs.forceRender()
        }
        return `<div>${item.id}</div>`
      },
    })

    vs.init(items)

    // Initial init should trigger one render pass (10 items)
    // The first item render will call forceRender()
    // but the guard should prevent that second pass from starting.
    expect(renderCount).toBe(10)

    vs.destroy()
  })

  it('renders headerHtml before scroll content', () => {
    const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div class="item">${item.id}</div>`,
      headerHtml: '<h1 class="feed-title">Test Stories</h1>',
    })

    vs.init(items)

    // Header should be rendered
    const header = container.querySelector('.feed-title')
    expect(header).toBeTruthy()
    expect(header?.textContent).toBe('Test Stories')
    expect(header?.tagName).toBe('H1')

    // Header should come before the scroll spacer
    const children = Array.from(container.children)
    const headerIndex = children.indexOf(header as Element)
    const spacerIndex = children.indexOf(
      container.querySelector('.virtual-scroll-spacer') as Element,
    )
    expect(headerIndex).toBeLessThan(spacerIndex)

    vs.destroy()
  })

  it('works without headerHtml', () => {
    const items: TestItem[] = Array.from({ length: 10 }, (_, i) => ({ id: i }))

    const vs = new VirtualScroll<TestItem>({
      container,
      itemHeight: 50,
      renderItem: (item) => `<div class="item">${item.id}</div>`,
      // No headerHtml provided
    })

    vs.init(items)

    // Should still work, just no header
    const header = container.querySelector('.feed-title')
    expect(header).toBeFalsy()

    // Spacer should be first child
    expect(container.firstChild).toBe(
      container.querySelector('.virtual-scroll-spacer'),
    )

    vs.destroy()
  })
})

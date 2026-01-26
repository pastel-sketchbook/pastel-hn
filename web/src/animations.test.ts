import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  animateDetailEnter,
  animateDetailExit,
  animateListEnter,
  animateStoriesAway,
  applyStaggerAnimation,
  TRANSITION_DURATION,
} from './animations'

describe('TRANSITION_DURATION', () => {
  it('exports the correct duration', () => {
    expect(TRANSITION_DURATION).toBe(350)
  })
})

describe('animateStoriesAway', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="stories">
        <div class="story" data-id="1">Story 1</div>
        <div class="story" data-id="2">Story 2</div>
        <div class="story" data-id="3">Story 3</div>
      </div>
    `
    // Mock reduced motion to allow animations
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds animation classes to stories', async () => {
    const stories = document.querySelectorAll('.story')
    const clickedStory = stories[1] as HTMLElement

    // Don't await - just start the animation
    const promise = animateStoriesAway(clickedStory)

    // Check classes were added immediately
    expect(stories[0].classList.contains('view-transition')).toBe(true)
    expect(stories[0].classList.contains('view-exit-up')).toBe(true)
    expect(stories[1].classList.contains('view-anchor-fade')).toBe(true)
    expect(stories[2].classList.contains('view-exit-down')).toBe(true)

    await promise
  })

  it('does nothing when reduced motion is preferred', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )

    const stories = document.querySelectorAll('.story')
    const clickedStory = stories[1] as HTMLElement

    await animateStoriesAway(clickedStory)

    expect(stories[0].classList.contains('view-transition')).toBe(false)
  })

  it('does nothing when container is not found', async () => {
    document.body.innerHTML = ''
    const fakeElement = document.createElement('div')

    // Should not throw
    await animateStoriesAway(fakeElement)
  })

  it('does nothing when clicked element is not in container', async () => {
    const fakeElement = document.createElement('div')
    fakeElement.className = 'story'

    const stories = document.querySelectorAll('.story')
    await animateStoriesAway(fakeElement)

    // No classes should be added
    expect(stories[0].classList.contains('view-transition')).toBe(false)
  })
})

describe('animateDetailEnter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds and removes animation classes', async () => {
    const container = document.createElement('div')

    const promise = animateDetailEnter(container)

    // Classes should be added immediately
    expect(container.classList.contains('view-transition')).toBe(true)
    expect(container.classList.contains('view-enter-from-bottom')).toBe(true)

    await promise

    // Classes should be removed after animation
    expect(container.classList.contains('view-transition')).toBe(false)
    expect(container.classList.contains('view-enter-from-bottom')).toBe(false)
  })

  it('does nothing when reduced motion is preferred', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )

    const container = document.createElement('div')
    await animateDetailEnter(container)

    expect(container.classList.contains('view-transition')).toBe(false)
  })
})

describe('animateDetailExit', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds and removes animation classes', async () => {
    const container = document.createElement('div')

    const promise = animateDetailExit(container)

    // Classes should be added immediately
    expect(container.classList.contains('view-transition')).toBe(true)
    expect(container.classList.contains('view-fade-out')).toBe(true)

    await promise

    // Classes should be removed after animation
    expect(container.classList.contains('view-transition')).toBe(false)
    expect(container.classList.contains('view-fade-out')).toBe(false)
  })

  it('does nothing when reduced motion is preferred', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )

    const container = document.createElement('div')
    await animateDetailExit(container)

    expect(container.classList.contains('view-transition')).toBe(false)
  })
})

describe('animateListEnter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds and removes animation classes', async () => {
    const container = document.createElement('div')

    const promise = animateListEnter(container)

    // Classes should be added immediately
    expect(container.classList.contains('view-transition')).toBe(true)
    expect(container.classList.contains('view-enter-from-top')).toBe(true)

    await promise

    // Classes should be removed after animation
    expect(container.classList.contains('view-transition')).toBe(false)
    expect(container.classList.contains('view-enter-from-top')).toBe(false)
  })

  it('does nothing when reduced motion is preferred', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )

    const container = document.createElement('div')
    await animateListEnter(container)

    expect(container.classList.contains('view-transition')).toBe(false)
  })
})

describe('applyStaggerAnimation', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds stagger-in class to first 10 items', () => {
    const container = document.createElement('div')
    for (let i = 0; i < 15; i++) {
      const item = document.createElement('div')
      item.className = 'item'
      container.appendChild(item)
    }

    applyStaggerAnimation(container, '.item')

    const items = container.querySelectorAll('.item')
    for (let i = 0; i < 10; i++) {
      expect(items[i].classList.contains('stagger-in')).toBe(true)
    }
    for (let i = 10; i < 15; i++) {
      expect(items[i].classList.contains('stagger-in')).toBe(false)
    }
  })

  it('does nothing when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )

    const container = document.createElement('div')
    for (let i = 0; i < 5; i++) {
      const item = document.createElement('div')
      item.className = 'item'
      container.appendChild(item)
    }

    applyStaggerAnimation(container, '.item')

    const items = container.querySelectorAll('.item')
    items.forEach((item) => {
      expect(item.classList.contains('stagger-in')).toBe(false)
    })
  })

  it('handles empty containers', () => {
    const container = document.createElement('div')
    // Should not throw
    applyStaggerAnimation(container, '.item')
  })
})

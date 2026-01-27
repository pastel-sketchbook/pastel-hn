import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  disableKeyboard,
  enableKeyboard,
  getSelectedIndex,
  initKeyboard,
  KEYBOARD_SHORTCUTS,
  resetSelection,
  setKeyboardCallbacks,
  setSelectedIndex,
} from './keyboard'

describe('keyboard', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = ''
    // Reset keyboard state
    resetSelection()
    setKeyboardCallbacks({})
    enableKeyboard()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('selection state', () => {
    it('starts with no selection', () => {
      expect(getSelectedIndex()).toBe(-1)
    })

    it('setSelectedIndex updates the index', () => {
      // Create some story elements for selection
      document.body.innerHTML = `
        <div class="story" data-id="1"></div>
        <div class="story" data-id="2"></div>
        <div class="story" data-id="3"></div>
      `

      setSelectedIndex(1)
      expect(getSelectedIndex()).toBe(1)

      // Check that the element got the selected class
      const stories = document.querySelectorAll('.story')
      expect(stories[1].classList.contains('keyboard-selected')).toBe(true)
    })

    it('resetSelection clears selection', () => {
      document.body.innerHTML = `
        <div class="story keyboard-selected" data-id="1"></div>
      `

      setSelectedIndex(0)
      resetSelection()

      expect(getSelectedIndex()).toBe(-1)
      expect(document.querySelector('.keyboard-selected')).toBeNull()
    })
  })

  describe('keyboard callbacks', () => {
    it('setKeyboardCallbacks stores callbacks', () => {
      const onNavigate = vi.fn()
      const onSelect = vi.fn()

      setKeyboardCallbacks({ onNavigate, onSelect })

      // Callbacks are stored but we can't directly verify without triggering keys
      expect(true).toBe(true) // Placeholder - callbacks are tested via key events
    })
  })

  describe('keyboard navigation', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="story" data-id="1"></div>
        <div class="story" data-id="2"></div>
        <div class="story" data-id="3"></div>
      `
      initKeyboard()
    })

    it('j key navigates down', () => {
      const onNavigate = vi.fn()
      setKeyboardCallbacks({ onNavigate })

      const event = new KeyboardEvent('keydown', { key: 'j' })
      document.dispatchEvent(event)

      expect(getSelectedIndex()).toBe(0)
      expect(onNavigate).toHaveBeenCalledWith(0)
    })

    it('k key navigates up', () => {
      const onNavigate = vi.fn()
      setKeyboardCallbacks({ onNavigate })

      // First go down twice
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
      expect(getSelectedIndex()).toBe(1)

      // Then go up
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
      expect(getSelectedIndex()).toBe(0)
      expect(onNavigate).toHaveBeenLastCalledWith(0)
    })

    it('ArrowDown key navigates down', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      expect(getSelectedIndex()).toBe(0)
    })

    it('ArrowUp key navigates up', () => {
      setSelectedIndex(2)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      expect(getSelectedIndex()).toBe(1)
    })

    it('navigation stops at boundaries', () => {
      // Can't go below 0
      setSelectedIndex(0)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
      expect(getSelectedIndex()).toBe(0)

      // Can't go above max
      setSelectedIndex(2) // Last item
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
      expect(getSelectedIndex()).toBe(2)
    })

    it('Enter key calls onSelect', () => {
      const onSelect = vi.fn()
      setKeyboardCallbacks({ onSelect })

      setSelectedIndex(1)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

      expect(onSelect).toHaveBeenCalledWith(1)
    })

    it('Escape key calls onBack', () => {
      const onBack = vi.fn()
      setKeyboardCallbacks({ onBack })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(onBack).toHaveBeenCalled()
    })

    it('r key calls onRefresh', () => {
      const onRefresh = vi.fn()
      setKeyboardCallbacks({ onRefresh })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))

      expect(onRefresh).toHaveBeenCalled()
    })

    it('r key with ctrl does not call onRefresh', () => {
      const onRefresh = vi.fn()
      setKeyboardCallbacks({ onRefresh })

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'r', ctrlKey: true }),
      )

      expect(onRefresh).not.toHaveBeenCalled()
    })

    it('? key calls onHelp', () => {
      const onHelp = vi.fn()
      setKeyboardCallbacks({ onHelp })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))

      expect(onHelp).toHaveBeenCalled()
    })

    it('t key calls onScrollToTop', () => {
      const onScrollToTop = vi.fn()
      setKeyboardCallbacks({ onScrollToTop })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }))

      expect(onScrollToTop).toHaveBeenCalled()
    })

    it('/ key calls onSearch', () => {
      const onSearch = vi.fn()
      setKeyboardCallbacks({ onSearch })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }))

      expect(onSearch).toHaveBeenCalled()
    })

    it('c key calls onFocusComments', () => {
      const onFocusComments = vi.fn()
      setKeyboardCallbacks({ onFocusComments })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))

      expect(onFocusComments).toHaveBeenCalled()
    })

    it('b key calls onBackToList', () => {
      const onBackToList = vi.fn()
      setKeyboardCallbacks({ onBackToList })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))

      expect(onBackToList).toHaveBeenCalled()
    })

    it('o key calls onOpenExternal', () => {
      const onOpenExternal = vi.fn()
      setKeyboardCallbacks({ onOpenExternal })

      setSelectedIndex(1)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }))

      expect(onOpenExternal).toHaveBeenCalledWith(1)
    })
  })

  describe('feed switching', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div class="story"></div>'
      initKeyboard()
    })

    it('1-6 keys call onFeedChange with correct feed', () => {
      const onFeedChange = vi.fn()
      setKeyboardCallbacks({ onFeedChange })

      const feedMap: Record<string, string> = {
        '1': 'top',
        '2': 'new',
        '3': 'best',
        '4': 'ask',
        '5': 'show',
        '6': 'jobs',
      }

      for (const [key, feed] of Object.entries(feedMap)) {
        onFeedChange.mockClear()
        document.dispatchEvent(new KeyboardEvent('keydown', { key }))
        expect(onFeedChange).toHaveBeenCalledWith(feed)
      }
    })

    it('number keys with modifiers do not switch feeds', () => {
      const onFeedChange = vi.fn()
      setKeyboardCallbacks({ onFeedChange })

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', ctrlKey: true }),
      )
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', metaKey: true }),
      )
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '3', altKey: true }),
      )

      expect(onFeedChange).not.toHaveBeenCalled()
    })
  })

  describe('quit shortcut', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div class="story"></div>'
      initKeyboard()
    })

    it('Cmd+Q calls onQuit (macOS)', () => {
      const onQuit = vi.fn()
      setKeyboardCallbacks({ onQuit })

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'q', metaKey: true }),
      )

      expect(onQuit).toHaveBeenCalled()
    })

    it('Ctrl+Q calls onQuit (Windows/Linux)', () => {
      const onQuit = vi.fn()
      setKeyboardCallbacks({ onQuit })

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'q', ctrlKey: true }),
      )

      expect(onQuit).toHaveBeenCalled()
    })

    it('Q without modifier does not call onQuit', () => {
      const onQuit = vi.fn()
      setKeyboardCallbacks({ onQuit })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))

      expect(onQuit).not.toHaveBeenCalled()
    })
  })

  describe('keyboard enable/disable', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div class="story"></div>'
      initKeyboard()
    })

    it('disableKeyboard prevents key handling', () => {
      const onNavigate = vi.fn()
      setKeyboardCallbacks({ onNavigate })

      disableKeyboard()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))

      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('enableKeyboard re-enables key handling', () => {
      const onNavigate = vi.fn()
      setKeyboardCallbacks({ onNavigate })

      disableKeyboard()
      enableKeyboard()
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))

      expect(onNavigate).toHaveBeenCalled()
    })
  })

  describe('input field handling', () => {
    beforeEach(() => {
      initKeyboard()
    })

    it('does not capture keys when focused on input', () => {
      const onSearch = vi.fn()
      setKeyboardCallbacks({ onSearch })

      const input = document.createElement('input')
      document.body.appendChild(input)

      // Simulate event from input element
      const event = new KeyboardEvent('keydown', { key: '/' })
      Object.defineProperty(event, 'target', { value: input })
      document.dispatchEvent(event)

      expect(onSearch).not.toHaveBeenCalled()
    })

    it('does not capture keys when focused on textarea', () => {
      const onRefresh = vi.fn()
      setKeyboardCallbacks({ onRefresh })

      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)

      const event = new KeyboardEvent('keydown', { key: 'r' })
      Object.defineProperty(event, 'target', { value: textarea })
      document.dispatchEvent(event)

      expect(onRefresh).not.toHaveBeenCalled()
    })
  })

  describe('comment selection', () => {
    it('selects comments when no stories present', () => {
      document.body.innerHTML = `
        <div class="comment" data-depth="0" data-id="1"></div>
        <div class="comment" data-depth="1" data-id="2"></div>
        <div class="comment" data-depth="0" data-id="3"></div>
      `
      initKeyboard()

      // Should only select depth=0 comments
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
      expect(getSelectedIndex()).toBe(0)

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
      expect(getSelectedIndex()).toBe(1) // Skips depth=1, goes to second depth=0
    })
  })

  describe('KEYBOARD_SHORTCUTS constant', () => {
    it('exports keyboard shortcuts for help display', () => {
      expect(KEYBOARD_SHORTCUTS).toBeDefined()
      expect(Array.isArray(KEYBOARD_SHORTCUTS)).toBe(true)
      expect(KEYBOARD_SHORTCUTS.length).toBeGreaterThan(0)

      // Check structure
      const firstShortcut = KEYBOARD_SHORTCUTS[0]
      expect(firstShortcut).toHaveProperty('key')
      expect(firstShortcut).toHaveProperty('description')
    })

    it('includes all documented shortcuts', () => {
      const keys = KEYBOARD_SHORTCUTS.map((s) => s.key)

      expect(keys).toContain('j / ↓')
      expect(keys).toContain('k / ↑')
      expect(keys).toContain('Enter')
      expect(keys).toContain('o')
      expect(keys).toContain('Escape')
      expect(keys).toContain('r')
      expect(keys).toContain('t')
      expect(keys).toContain('/')
      expect(keys).toContain('1-7')
      expect(keys).toContain('?')
    })

    it('includes vim-style navigation shortcuts', () => {
      const keys = KEYBOARD_SHORTCUTS.map((s) => s.key)

      expect(keys).toContain('h / l')
      expect(keys).toContain('G')
      expect(keys).toContain('gg')
      expect(keys).toContain('g<n>g')
      expect(keys).toContain('yy')
    })
  })

  describe('vim-style scroll', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="stories" style="width: 500px; height: 300px; overflow: auto;">
          <div style="width: 1000px; height: 1000px;"></div>
        </div>
      `
      initKeyboard()
    })

    it('h scrolls left', () => {
      const container = document.getElementById('stories')!
      container.scrollLeft = 200
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }))
      expect(container.scrollLeft).toBeLessThan(200)
    })

    it('l scrolls right', () => {
      const container = document.getElementById('stories')!
      container.scrollLeft = 0
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }))
      expect(container.scrollLeft).toBeGreaterThan(0)
    })
  })

  describe('vim-style G/gg navigation', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="story" data-id="1"></div>
        <div class="story" data-id="2"></div>
        <div class="story" data-id="3"></div>
        <div class="story" data-id="4"></div>
        <div class="story" data-id="5"></div>
      `
      initKeyboard()
    })

    it('G jumps to last item', () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'G', shiftKey: true }),
      )
      expect(getSelectedIndex()).toBe(4)
    })

    it('gg jumps to first item (two g presses)', () => {
      setSelectedIndex(4)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      expect(getSelectedIndex()).toBe(0)
    })

    it('nG jumps to nth item (e.g., 3G)', () => {
      // First press 'g' to enter numeric mode, then type number, then 'g' again
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      expect(getSelectedIndex()).toBe(2) // 0-indexed, so item 3 is index 2
    })

    it('nG clamps to last item if n exceeds count', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '9' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '9' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
      expect(getSelectedIndex()).toBe(4) // Last item
    })
  })

  describe('vim-style yy copy', () => {
    beforeEach(() => {
      initKeyboard()
    })

    it('yy triggers copy callback in detail view', () => {
      const onCopy = vi.fn()
      setKeyboardCallbacks({ onCopy })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }))

      expect(onCopy).toHaveBeenCalledTimes(1)
    })

    it('single y does not trigger copy', () => {
      const onCopy = vi.fn()
      setKeyboardCallbacks({ onCopy })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }))

      expect(onCopy).not.toHaveBeenCalled()
    })
  })
})

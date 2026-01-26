import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeHelpModal, isHelpModalOpen, showHelpModal } from './help-modal'

describe('help-modal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    // Ensure modal is closed before each test
    closeHelpModal()
  })

  afterEach(() => {
    closeHelpModal()
    vi.restoreAllMocks()
  })

  describe('isHelpModalOpen', () => {
    it('returns false when modal is not open', () => {
      expect(isHelpModalOpen()).toBe(false)
    })

    it('returns true when modal is open', () => {
      showHelpModal()
      expect(isHelpModalOpen()).toBe(true)
    })
  })

  describe('showHelpModal', () => {
    it('creates modal overlay', () => {
      showHelpModal()
      const overlay = document.querySelector('.help-modal-overlay')
      expect(overlay).not.toBeNull()
    })

    it('creates help modal with cyber-frame class', () => {
      showHelpModal()
      const modal = document.querySelector('.help-modal')
      expect(modal).not.toBeNull()
      expect(modal?.classList.contains('cyber-frame')).toBe(true)
    })

    it('shows keyboard shortcuts title', () => {
      showHelpModal()
      const title = document.querySelector('.help-modal-title')
      expect(title).not.toBeNull()
      expect(title?.textContent).toBe('Keyboard Shortcuts')
    })

    it('renders keyboard shortcuts', () => {
      showHelpModal()
      const shortcuts = document.querySelectorAll('.help-shortcut')
      expect(shortcuts.length).toBeGreaterThan(0)
    })

    it('renders kbd elements for shortcut keys', () => {
      showHelpModal()
      const kbdElements = document.querySelectorAll('.help-shortcut kbd')
      expect(kbdElements.length).toBeGreaterThan(0)
    })

    it('creates close button', () => {
      showHelpModal()
      const closeBtn = document.querySelector('.help-close-btn')
      expect(closeBtn).not.toBeNull()
      expect(closeBtn?.textContent).toContain('Close')
    })

    it('does not create duplicate modals', () => {
      showHelpModal()
      showHelpModal()
      const overlays = document.querySelectorAll('.help-modal-overlay')
      expect(overlays.length).toBe(1)
    })

    it('has corner decorations', () => {
      showHelpModal()
      const cornerTr = document.querySelector('.corner-tr')
      const cornerBl = document.querySelector('.corner-bl')
      expect(cornerTr).not.toBeNull()
      expect(cornerBl).not.toBeNull()
    })
  })

  describe('closeHelpModal', () => {
    it('removes modal overlay', () => {
      showHelpModal()
      closeHelpModal()
      const overlay = document.querySelector('.help-modal-overlay')
      expect(overlay).toBeNull()
    })

    it('sets modal state to closed', () => {
      showHelpModal()
      closeHelpModal()
      expect(isHelpModalOpen()).toBe(false)
    })

    it('does nothing when modal is not open', () => {
      // Should not throw
      closeHelpModal()
      expect(isHelpModalOpen()).toBe(false)
    })
  })

  describe('click interaction', () => {
    it('closes on backdrop click', () => {
      showHelpModal()
      const overlay = document.querySelector(
        '.help-modal-overlay',
      ) as HTMLElement
      expect(overlay).not.toBeNull()

      // Simulate click on the overlay itself (not the modal content)
      overlay.click()

      expect(isHelpModalOpen()).toBe(false)
    })

    it('closes on close button click', () => {
      showHelpModal()
      const closeBtn = document.querySelector(
        '[data-action="close-help"]',
      ) as HTMLElement
      expect(closeBtn).not.toBeNull()

      closeBtn.click()

      expect(isHelpModalOpen()).toBe(false)
    })

    it('does not close when clicking modal content', () => {
      showHelpModal()
      const modal = document.querySelector('.help-modal') as HTMLElement
      expect(modal).not.toBeNull()

      // Click on modal content (not overlay)
      modal.click()

      expect(isHelpModalOpen()).toBe(true)
    })

    it('does not close when clicking shortcut item', () => {
      showHelpModal()
      const shortcut = document.querySelector('.help-shortcut') as HTMLElement
      expect(shortcut).not.toBeNull()

      shortcut.click()

      expect(isHelpModalOpen()).toBe(true)
    })
  })
})

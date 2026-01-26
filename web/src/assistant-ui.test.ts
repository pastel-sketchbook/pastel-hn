import { beforeEach, describe, expect, it } from 'vitest'
import {
  isAssistantOpen,
  toggleAssistant,
  updateAssistantZenMode,
} from './assistant-ui'

describe('assistant-ui', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.className = ''

    // Create assistant toggle button mock
    const button = document.createElement('button')
    button.id = 'assistant-toggle'
    document.body.appendChild(button)

    // Create assistant panel mock
    const panel = document.createElement('div')
    panel.id = 'assistant-panel'
    document.body.appendChild(panel)
  })

  describe('updateAssistantZenMode', () => {
    it('shows toggle button when zen mode is active and in detail view', () => {
      const toggleBtn = document.getElementById('assistant-toggle')
      updateAssistantZenMode(true, 'detail')
      expect(toggleBtn?.style.display).toBe('flex')
      expect(
        document.documentElement.classList.contains('assistant-toggle-visible'),
      ).toBe(true)
    })

    it('hides toggle button when in list view even if zen mode is active', () => {
      const toggleBtn = document.getElementById('assistant-toggle')
      updateAssistantZenMode(true, 'list')
      expect(toggleBtn?.style.display).toBe('none')
      expect(
        document.documentElement.classList.contains('assistant-toggle-visible'),
      ).toBe(false)
    })

    it('hides toggle button when zen mode is inactive', () => {
      const toggleBtn = document.getElementById('assistant-toggle')
      updateAssistantZenMode(false, 'detail')
      expect(toggleBtn?.style.display).toBe('none')
      expect(
        document.documentElement.classList.contains('assistant-toggle-visible'),
      ).toBe(false)
    })

    it('auto-closes assistant when visibility becomes hidden', () => {
      // First ensure it's visible so we can open it
      updateAssistantZenMode(true, 'detail')

      // Open the assistant
      if (!isAssistantOpen()) {
        toggleAssistant()
      }
      expect(isAssistantOpen()).toBe(true)

      // Switch to list view (visibility becomes false)
      updateAssistantZenMode(true, 'list')
      expect(isAssistantOpen()).toBe(false)
    })
  })
})

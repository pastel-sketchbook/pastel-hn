/**
 * Tests for tts-client.ts
 *
 * These tests verify the TTS client behavior in non-Tauri environments
 * and the interface methods.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { getTtsClient, TtsClient } from './tts-client'

describe('tts-client', () => {
  describe('TtsClient', () => {
    let client: TtsClient

    beforeEach(() => {
      client = new TtsClient()
    })

    describe('initial state', () => {
      it('should not be initialized initially', () => {
        expect(client.isInitialized()).toBe(false)
      })

      it('should not be available initially', () => {
        expect(client.isAvailable()).toBe(false)
      })

      it('should have empty voices initially', () => {
        expect(client.getVoices()).toEqual([])
      })

      it('should have default rate of 0.5', () => {
        expect(client.getRate()).toBe(0.5)
      })

      it('should have no selected voice initially', () => {
        expect(client.getSelectedVoiceId()).toBeNull()
      })
    })

    describe('non-Tauri environment', () => {
      it('should return unavailable status when initializing', async () => {
        const status = await client.init()

        expect(status.available).toBe(false)
        expect(status.message).toBe('TTS requires the desktop app')
      })

      it('should return unavailable status for getStatus', async () => {
        const status = await client.getStatus()

        expect(status.available).toBe(false)
      })

      it('should return false when speaking', async () => {
        const result = await client.speak('test', true)

        expect(result).toBe(false)
      })

      it('should return false when stopping', async () => {
        const result = await client.stop()

        expect(result).toBe(false)
      })

      it('should return false when setting voice', async () => {
        const result = await client.setVoice('some-voice')

        expect(result).toBe(false)
      })

      it('should return false when setting rate', async () => {
        const result = await client.setRate(0.7)

        expect(result).toBe(false)
      })
    })

    describe('getLastStatus', () => {
      it('should return default unavailable status', () => {
        const status = client.getLastStatus()

        expect(status.available).toBe(false)
        expect(status.is_speaking).toBe(false)
        expect(status.rate).toBe(0.5)
        expect(status.features.stop).toBe(false)
        expect(status.features.rate).toBe(false)
        expect(status.features.voice).toBe(false)
      })
    })
  })

  describe('getTtsClient', () => {
    it('should return a singleton instance', () => {
      const client1 = getTtsClient()
      const client2 = getTtsClient()

      expect(client1).toBe(client2)
    })

    it('should return a TtsClient instance', () => {
      const client = getTtsClient()

      expect(client).toBeInstanceOf(TtsClient)
    })
  })
})

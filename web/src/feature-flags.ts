/**
 * Feature flags for controlling experimental or in-progress features
 *
 * This module provides a simple feature flag system for:
 * - Hiding incomplete features from users
 * - A/B testing
 * - Gradual rollouts
 *
 * @module feature-flags
 */

/**
 * Feature flag definitions
 *
 * Set to `true` to enable, `false` to disable
 */
export const FEATURE_FLAGS = {
  /**
   * Show the native "Read Aloud" TTS button (system voice)
   * Disabled while neural TTS (Piper) is being implemented as the primary voice
   */
  NATIVE_TTS_BUTTON: false,
} as const

/**
 * Check if a feature is enabled
 * @param flag - The feature flag to check
 */
export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[flag]
}

/**
 * Global keyboard shortcuts module.
 *
 * Note: Shortcuts are registered in Rust (main.rs) for reliability.
 * This module provides:
 * - Constant definitions for shortcut strings
 * - Callback configuration for JS-side actions
 * - Helper to check registration status
 */

import { isRegistered } from '@tauri-apps/plugin-global-shortcut'

/** Default global shortcuts configuration (registered in Rust) */
export const DEFAULT_GLOBAL_SHORTCUTS = {
  showWindow: 'CommandOrControl+Shift+H',
  refresh: 'CommandOrControl+Shift+R',
} as const

export type GlobalShortcutKey = keyof typeof DEFAULT_GLOBAL_SHORTCUTS

/** Callbacks for global shortcut actions triggered via Rust events */
export interface GlobalShortcutCallbacks {
  onShowWindow?: () => void
  onRefresh?: () => void
}

let callbacks: GlobalShortcutCallbacks = {}

/**
 * Configure global shortcut callbacks.
 * These are called when Rust emits events for the shortcuts.
 */
export function configureGlobalShortcuts(cb: GlobalShortcutCallbacks): void {
  callbacks = cb
}

/**
 * Get the configured callbacks (used by event handlers).
 */
export function getGlobalShortcutCallbacks(): GlobalShortcutCallbacks {
  return callbacks
}

/**
 * Check if a specific global shortcut is registered.
 */
export async function isShortcutRegistered(shortcut: string): Promise<boolean> {
  try {
    return await isRegistered(shortcut)
  } catch {
    return false
  }
}

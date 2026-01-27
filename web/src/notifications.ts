/**
 * Native notifications module.
 * Wraps the Tauri notification plugin with graceful degradation.
 */

import type { HNItem } from './types'

let notificationsAvailable = false
let permissionGranted = false

/**
 * Reset notification state (for testing).
 */
export function resetNotifications(): void {
  notificationsAvailable = false
  permissionGranted = false
}

/**
 * Initialize the notification system.
 * Checks permission and requests if needed.
 */
export async function initNotifications(): Promise<boolean> {
  // Only available in Tauri environment
  if (typeof window === 'undefined' || !('__TAURI__' in window)) {
    return false
  }

  try {
    const { isPermissionGranted, requestPermission } = await import(
      '@tauri-apps/plugin-notification'
    )

    // Check current permission status
    permissionGranted = await isPermissionGranted()

    if (!permissionGranted) {
      const permission = await requestPermission()
      permissionGranted = permission === 'granted'
    }

    notificationsAvailable = permissionGranted
    return notificationsAvailable
  } catch (error) {
    console.debug('Notifications not available:', error)
    return false
  }
}

/**
 * Check if notifications are available and permitted.
 */
export function areNotificationsAvailable(): boolean {
  return notificationsAvailable
}

/**
 * Send a notification.
 * @param title - Notification title
 * @param body - Notification body text
 */
export async function showNotification(
  title: string,
  body: string,
): Promise<boolean> {
  if (!notificationsAvailable) {
    return false
  }

  try {
    const { sendNotification } = await import('@tauri-apps/plugin-notification')
    sendNotification({ title, body })
    return true
  } catch (error) {
    console.error('Failed to send notification:', error)
    return false
  }
}

/**
 * Show a notification for new comments on a followed story.
 * @param story - The story that has new comments
 * @param newCommentCount - Number of new comments since last check
 */
export async function notifyNewComments(
  story: HNItem,
  newCommentCount: number,
): Promise<boolean> {
  const title = `New comments on "${story.title?.substring(0, 50)}${(story.title?.length ?? 0) > 50 ? '...' : ''}"`
  const body = `${newCommentCount} new comment${newCommentCount === 1 ? '' : 's'}`
  return showNotification(title, body)
}

/**
 * Show a notification for a story update (e.g., score milestone).
 * @param story - The story
 * @param message - The notification message
 */
export async function notifyStoryUpdate(
  story: HNItem,
  message: string,
): Promise<boolean> {
  const title = story.title?.substring(0, 60) ?? 'Story Update'
  return showNotification(title, message)
}

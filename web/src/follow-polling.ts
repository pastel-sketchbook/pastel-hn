/**
 * Background polling for followed stories.
 * Periodically checks for new comments on followed stories and sends notifications.
 */

import { fetchItem } from './api'
import { areNotificationsAvailable, notifyNewComments } from './notifications'
import { getFollowedStories, updateFollowedStoryCommentCount } from './storage'

// Polling interval in milliseconds (5 minutes)
const POLL_INTERVAL = 5 * 60 * 1000

// Minimum time between checks for a single story (2 minutes)
const MIN_CHECK_INTERVAL = 2 * 60 * 1000

let pollIntervalId: ReturnType<typeof setInterval> | null = null
let isPolling = false

/**
 * Start background polling for followed story updates.
 * Only runs if notifications are available.
 */
export function startFollowedStoriesPolling(): void {
  if (pollIntervalId !== null) {
    return // Already polling
  }

  if (!areNotificationsAvailable()) {
    console.debug(
      'Notifications not available, skipping followed stories polling',
    )
    return
  }

  // Do initial check after a short delay
  setTimeout(() => {
    checkFollowedStories()
  }, 10000) // 10 seconds after startup

  // Set up interval for subsequent checks
  pollIntervalId = setInterval(() => {
    checkFollowedStories()
  }, POLL_INTERVAL)

  console.debug('Started followed stories polling')
}

/**
 * Stop background polling.
 */
export function stopFollowedStoriesPolling(): void {
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId)
    pollIntervalId = null
    console.debug('Stopped followed stories polling')
  }
}

/**
 * Check all followed stories for new comments.
 * Sends notifications for stories with new comments.
 */
export async function checkFollowedStories(): Promise<void> {
  if (isPolling) {
    return // Already checking
  }

  const followedStories = getFollowedStories()
  if (followedStories.length === 0) {
    return
  }

  isPolling = true
  const now = Date.now()

  try {
    for (const entry of followedStories) {
      // Skip if recently checked
      if (now - entry.lastCheckedAt < MIN_CHECK_INTERVAL) {
        continue
      }

      try {
        // Fetch latest story data
        const story = await fetchItem(entry.story.id)

        if (!story) {
          continue
        }

        const currentComments = story.descendants ?? 0
        const newComments = updateFollowedStoryCommentCount(
          story.id,
          currentComments,
        )

        // Send notification if there are new comments
        if (newComments > 0) {
          await notifyNewComments(story, newComments)
        }
      } catch (error) {
        console.debug(`Failed to check story ${entry.story.id}:`, error)
      }
    }
  } finally {
    isPolling = false
  }
}

/**
 * Force an immediate check for a specific story.
 * Used when user explicitly requests a refresh.
 */
export async function checkSingleStory(storyId: number): Promise<number> {
  try {
    const story = await fetchItem(storyId)
    if (!story) {
      return 0
    }

    const currentComments = story.descendants ?? 0
    return updateFollowedStoryCommentCount(storyId, currentComments)
  } catch {
    return 0
  }
}

/**
 * Check if polling is currently active.
 */
export function isPollingActive(): boolean {
  return pollIntervalId !== null
}

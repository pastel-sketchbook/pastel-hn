/**
 * User profile view module.
 * Handles rendering user profiles and their submission history.
 */

import { announce } from './accessibility'
import { fetchUser, fetchUserSubmissions } from './api'
import { parseApiError, renderErrorWithRetry, showErrorToast } from './errors'
import { icons } from './icons'
import { renderSubmissionItem } from './renderers'
import { setScrollTop } from './scroll-utils'
import { renderUserProfileSkeleton } from './skeletons'
import { escapeHtml, formatAccountAge, sanitizeHtml } from './utils'

const SUBMISSIONS_PER_PAGE = 20

// Module state
let currentUserId: string | null = null
let isLoading = false

/**
 * Get current user ID being viewed.
 */
export function getCurrentUserId(): string | null {
  return currentUserId
}

/**
 * Check if user profile is currently loading.
 */
export function isUserProfileLoading(): boolean {
  return isLoading
}

/**
 * Set up tab switching and load more functionality for user profile.
 */
function setupUserProfileTabs(container: HTMLElement, userId: string): void {
  // Tab switching
  container.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement
    const tabBtn = target.closest('.tab-btn') as HTMLElement | null

    if (tabBtn) {
      const filter = tabBtn.dataset.filter as 'all' | 'stories' | 'comments'
      if (!filter) return

      // Update active tab
      container.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn === tabBtn)
      })

      // Reload submissions with new filter
      const listEl = container.querySelector('.submissions-list') as HTMLElement
      if (!listEl) return

      listEl.innerHTML = `
        <div class="loading submissions-loading">
          <div class="loading-spinner"></div>
        </div>
      `

      try {
        const { items } = await fetchUserSubmissions(
          userId,
          0,
          SUBMISSIONS_PER_PAGE,
          filter,
        )
        listEl.dataset.filter = filter
        listEl.dataset.offset = String(SUBMISSIONS_PER_PAGE)

        listEl.innerHTML =
          items.length > 0
            ? items.map((item) => renderSubmissionItem(item)).join('')
            : `<div class="no-submissions">No ${filter === 'all' ? 'submissions' : filter} yet</div>`
      } catch (_error) {
        listEl.innerHTML = '<div class="error">Failed to load submissions</div>'
      }
    }

    // Load more button
    const loadMoreBtn = target.closest(
      '.load-more-submissions-btn',
    ) as HTMLButtonElement | null
    if (loadMoreBtn) {
      const listEl = container.querySelector('.submissions-list') as HTMLElement
      if (!listEl) return

      const filter = (listEl.dataset.filter || 'all') as
        | 'all'
        | 'stories'
        | 'comments'
      const offset = Number(listEl.dataset.offset) || SUBMISSIONS_PER_PAGE

      loadMoreBtn.disabled = true
      loadMoreBtn.textContent = 'Loading...'

      try {
        const { items, hasMore } = await fetchUserSubmissions(
          userId,
          offset,
          SUBMISSIONS_PER_PAGE,
          filter,
        )

        if (items.length > 0) {
          const newHtml = items
            .map((item) => renderSubmissionItem(item))
            .join('')
          listEl.insertAdjacentHTML('beforeend', newHtml)
          listEl.dataset.offset = String(offset + SUBMISSIONS_PER_PAGE)
        }

        if (!hasMore) {
          loadMoreBtn.parentElement?.remove()
        } else {
          loadMoreBtn.disabled = false
          loadMoreBtn.textContent = 'Load more'
        }
      } catch (_error) {
        loadMoreBtn.disabled = false
        loadMoreBtn.textContent = 'Failed. Retry?'
      }
    }
  })
}

/**
 * Render a user profile view.
 */
export async function renderUserProfile(
  userId: string,
  container: HTMLElement,
): Promise<void> {
  if (isLoading) return
  isLoading = true
  currentUserId = userId

  // Show skeleton loading state for user profile
  container.innerHTML = renderUserProfileSkeleton()

  try {
    const user = await fetchUser(userId)
    const accountAge = formatAccountAge(user.created)
    const joinDate = new Date(user.created * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    // Fetch initial submissions (stories first)
    const { items: submissions } = await fetchUserSubmissions(
      userId,
      0,
      SUBMISSIONS_PER_PAGE,
      'all',
    )

    const submissionsHtml =
      submissions.length > 0
        ? submissions.map((item) => renderSubmissionItem(item)).join('')
        : '<div class="no-submissions">No submissions yet</div>'

    container.innerHTML = `
      <div class="user-profile">
        <div class="user-profile-header">
          <button class="back-btn" data-action="back" title="Back">
            ${icons.back}
            <span>Back</span>
          </button>
        </div>
        
        <div class="user-card cyber-frame">
          <span class="corner-tr"></span>
          <span class="corner-bl"></span>
          
          <div class="user-identity">
            <div class="user-avatar">${icons.user}</div>
            <div class="user-info">
              <h1 class="user-name">${escapeHtml(user.id)}</h1>
              <div class="user-stats">
                <span class="user-karma">${icons.points}${user.karma.toLocaleString()} karma</span>
                <span class="meta-sep"></span>
                <span class="user-age">${icons.clock}${accountAge}</span>
              </div>
            </div>
          </div>
          
          <div class="user-meta-details">
            <div class="user-joined">Member since ${joinDate}</div>
            ${user.submitted ? `<div class="user-submission-count">${user.submitted.length.toLocaleString()} submissions</div>` : ''}
          </div>
          
          ${
            user.about
              ? `
            <div class="user-about">
              <h2 class="user-about-title">About</h2>
              <div class="user-about-content">${sanitizeHtml(user.about)}</div>
            </div>
          `
              : ''
          }
        </div>
        
        <section class="user-submissions">
          <div class="submissions-header">
            <h2 class="submissions-title">${icons.comment}Recent Activity</h2>
            <div class="submissions-tabs">
              <button class="tab-btn active" data-filter="all">All</button>
              <button class="tab-btn" data-filter="stories">Stories</button>
              <button class="tab-btn" data-filter="comments">Comments</button>
            </div>
          </div>
          <div class="submissions-list" data-user="${escapeHtml(userId)}" data-filter="all" data-offset="${SUBMISSIONS_PER_PAGE}">
            ${submissionsHtml}
          </div>
          ${
            user.submitted && user.submitted.length > SUBMISSIONS_PER_PAGE
              ? `
            <div class="submissions-load-more">
              <button class="load-more-submissions-btn">Load more</button>
            </div>
          `
              : ''
          }
        </section>
      </div>
    `

    // Setup tab switching
    setupUserProfileTabs(container, userId)

    // Scroll to top
    setScrollTop(0)

    // Announce to screen readers
    announce(`User profile loaded for ${user.id}`)
  } catch (error) {
    const parsed = parseApiError(error)
    container.innerHTML = renderErrorWithRetry(
      parsed,
      'User',
      'retry-user',
      true,
    )
    showErrorToast(error, 'Load user')
    announce('Error loading user profile')
    console.error('Failed to load user:', error)
  } finally {
    isLoading = false
  }
}

/**
 * Reset user profile state (called when navigating away).
 */
export function resetUserProfileState(): void {
  currentUserId = null
}

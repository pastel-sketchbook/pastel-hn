/**
 * Skeleton loading components for the application
 * These provide visual feedback while content is loading
 */

import { icons } from './icons'

/**
 * Render a skeleton story item for loading state
 */
export function renderStorySkeleton(index: number): string {
  const titleClass = index % 3 === 2 ? 'skeleton-title-short' : ''
  return `
    <div class="story-skeleton">
      <div class="skeleton-rank skeleton"></div>
      <div class="skeleton-vote skeleton"></div>
      <div class="skeleton-content">
        <div class="skeleton-title skeleton ${titleClass}"></div>
        <div class="skeleton-meta">
          <div class="skeleton-meta-item skeleton"></div>
          <div class="skeleton-meta-item skeleton wide"></div>
          <div class="skeleton-meta-item skeleton"></div>
          <div class="skeleton-meta-item skeleton narrow"></div>
        </div>
      </div>
    </div>
  `
}

/**
 * Render multiple skeleton stories for loading state
 */
export function renderStorySkeletons(count = 6): string {
  return Array.from({ length: count }, (_, i) => renderStorySkeleton(i)).join(
    '',
  )
}

/**
 * Render a skeleton comment for loading state
 */
export function renderCommentSkeleton(depth = 0): string {
  return `
    <div class="comment-skeleton" style="--depth: ${depth}">
      <div class="skeleton-indent"></div>
      <div class="skeleton-comment-body">
        <div class="skeleton-comment-meta">
          <div class="skeleton-author skeleton"></div>
          <div class="skeleton-time skeleton"></div>
        </div>
        <div class="skeleton-comment-text">
          <div class="skeleton-text-line skeleton"></div>
          <div class="skeleton-text-line skeleton"></div>
          <div class="skeleton-text-line skeleton"></div>
        </div>
      </div>
    </div>
  `
}

/**
 * Render multiple skeleton comments for loading state
 */
export function renderCommentSkeletons(count = 5): string {
  // Create varied depths for visual interest
  const depths = [0, 0, 1, 1, 2]
  return Array.from({ length: count }, (_, i) =>
    renderCommentSkeleton(depths[i % depths.length]),
  ).join('')
}

/**
 * Render skeleton for user profile card
 */
export function renderUserProfileSkeleton(): string {
  return `
    <div class="user-profile">
      <div class="user-profile-header">
        <button class="back-btn" data-action="back" title="Back" disabled>
          ${icons.back}
          <span>Back</span>
        </button>
      </div>
      
      <div class="user-card cyber-frame user-skeleton">
        <span class="corner-tr"></span>
        <span class="corner-bl"></span>
        
        <div class="user-identity">
          <div class="skeleton-avatar skeleton"></div>
          <div class="user-info">
            <div class="skeleton-user-name skeleton" style="margin-bottom: 0.5rem;"></div>
            <div class="skeleton-user-stats">
              <div class="skeleton-stat skeleton"></div>
              <div class="skeleton-stat skeleton"></div>
            </div>
          </div>
        </div>
        
        <div class="user-meta-details">
          <div class="skeleton-meta-item skeleton wide"></div>
        </div>
      </div>
      
      <section class="user-submissions">
        <div class="submissions-header">
          <div class="skeleton skeleton-meta-item wide" style="height: 1.1rem;"></div>
        </div>
        <div class="submissions-list">
          ${renderStorySkeletons(3)}
        </div>
      </section>
    </div>
  `
}

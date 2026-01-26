import { describe, expect, it } from 'vitest'
import {
  renderCommentSkeleton,
  renderCommentSkeletons,
  renderStorySkeleton,
  renderStorySkeletons,
  renderUserProfileSkeleton,
} from './skeletons'

describe('renderStorySkeleton', () => {
  it('renders a skeleton with basic structure', () => {
    const result = renderStorySkeleton(0)
    expect(result).toContain('class="story-skeleton"')
    expect(result).toContain('class="skeleton-rank skeleton"')
    expect(result).toContain('class="skeleton-vote skeleton"')
    expect(result).toContain('class="skeleton-content"')
    expect(result).toContain('class="skeleton-title skeleton')
    expect(result).toContain('class="skeleton-meta"')
  })

  it('adds short title class for every third item', () => {
    const result0 = renderStorySkeleton(0)
    const result1 = renderStorySkeleton(1)
    const result2 = renderStorySkeleton(2)
    const result3 = renderStorySkeleton(3)

    expect(result0).not.toContain('skeleton-title-short')
    expect(result1).not.toContain('skeleton-title-short')
    expect(result2).toContain('skeleton-title-short')
    expect(result3).not.toContain('skeleton-title-short')
  })

  it('includes meta items', () => {
    const result = renderStorySkeleton(0)
    expect(result).toContain('class="skeleton-meta-item skeleton"')
    expect(result).toContain('class="skeleton-meta-item skeleton wide"')
    expect(result).toContain('class="skeleton-meta-item skeleton narrow"')
  })
})

describe('renderStorySkeletons', () => {
  it('renders default count of 6 skeletons', () => {
    const result = renderStorySkeletons()
    const matches = result.match(/class="story-skeleton"/g)
    expect(matches).toHaveLength(6)
  })

  it('renders specified count of skeletons', () => {
    const result = renderStorySkeletons(3)
    const matches = result.match(/class="story-skeleton"/g)
    expect(matches).toHaveLength(3)
  })

  it('renders no skeletons for count 0', () => {
    const result = renderStorySkeletons(0)
    expect(result).toBe('')
  })
})

describe('renderCommentSkeleton', () => {
  it('renders a skeleton with basic structure', () => {
    const result = renderCommentSkeleton()
    expect(result).toContain('class="comment-skeleton"')
    expect(result).toContain('class="skeleton-indent"')
    expect(result).toContain('class="skeleton-comment-body"')
    expect(result).toContain('class="skeleton-comment-meta"')
    expect(result).toContain('class="skeleton-author skeleton"')
    expect(result).toContain('class="skeleton-time skeleton"')
  })

  it('sets depth CSS variable to 0 by default', () => {
    const result = renderCommentSkeleton()
    expect(result).toContain('style="--depth: 0"')
  })

  it('sets depth CSS variable to specified value', () => {
    const result = renderCommentSkeleton(3)
    expect(result).toContain('style="--depth: 3"')
  })

  it('includes text lines', () => {
    const result = renderCommentSkeleton()
    const matches = result.match(/class="skeleton-text-line skeleton"/g)
    expect(matches).toHaveLength(3)
  })
})

describe('renderCommentSkeletons', () => {
  it('renders default count of 5 skeletons', () => {
    const result = renderCommentSkeletons()
    const matches = result.match(/class="comment-skeleton"/g)
    expect(matches).toHaveLength(5)
  })

  it('renders specified count of skeletons', () => {
    const result = renderCommentSkeletons(3)
    const matches = result.match(/class="comment-skeleton"/g)
    expect(matches).toHaveLength(3)
  })

  it('creates varied depths for visual interest', () => {
    const result = renderCommentSkeletons(5)
    // Depths pattern is [0, 0, 1, 1, 2]
    expect(result).toContain('--depth: 0')
    expect(result).toContain('--depth: 1')
    expect(result).toContain('--depth: 2')
  })
})

describe('renderUserProfileSkeleton', () => {
  it('renders a skeleton with basic structure', () => {
    const result = renderUserProfileSkeleton()
    expect(result).toContain('class="user-profile"')
    expect(result).toContain('class="user-profile-header"')
    expect(result).toContain('class="user-card cyber-frame user-skeleton"')
  })

  it('includes a disabled back button', () => {
    const result = renderUserProfileSkeleton()
    expect(result).toContain('class="back-btn"')
    expect(result).toContain('data-action="back"')
    expect(result).toContain('disabled')
    expect(result).toContain('<span>Back</span>')
  })

  it('includes back icon SVG', () => {
    const result = renderUserProfileSkeleton()
    expect(result).toContain('<svg viewBox="0 0 24 24">')
  })

  it('includes cyber frame corners', () => {
    const result = renderUserProfileSkeleton()
    expect(result).toContain('class="corner-tr"')
    expect(result).toContain('class="corner-bl"')
  })

  it('includes user identity skeleton elements', () => {
    const result = renderUserProfileSkeleton()
    expect(result).toContain('class="user-identity"')
    expect(result).toContain('class="skeleton-avatar skeleton"')
    expect(result).toContain('class="skeleton-user-name skeleton"')
    expect(result).toContain('class="skeleton-user-stats"')
    expect(result).toContain('class="skeleton-stat skeleton"')
  })

  it('includes submissions section with story skeletons', () => {
    const result = renderUserProfileSkeleton()
    expect(result).toContain('class="user-submissions"')
    expect(result).toContain('class="submissions-list"')
    // Should include 3 story skeletons
    const matches = result.match(/class="story-skeleton"/g)
    expect(matches).toHaveLength(3)
  })
})

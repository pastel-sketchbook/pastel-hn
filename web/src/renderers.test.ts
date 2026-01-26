import { describe, expect, it } from 'vitest'
import {
  renderComment,
  renderLoadMoreIndicator,
  renderStory,
  renderSubmissionItem,
} from './renderers'
import type { CommentWithChildren, HNItem } from './types'

describe('renderStory', () => {
  const baseStory: HNItem = {
    id: 123,
    type: 0, // Story
    by: 'testuser',
    time: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    title: 'Test Story Title',
    url: 'https://example.com/article',
    score: 100,
    descendants: 50,
  }

  it('renders basic story structure', () => {
    const result = renderStory(baseStory, 1, false)

    expect(result).toContain('class="story"')
    expect(result).toContain('data-id="123"')
    expect(result).toContain('Test Story Title')
    expect(result).toContain('100 points')
    expect(result).toContain('50 comments')
  })

  it('renders rank number', () => {
    const result = renderStory(baseStory, 42, false)
    expect(result).toContain('>42</div>')
  })

  it('marks story as read', () => {
    const result = renderStory(baseStory, 1, true)

    expect(result).toContain('story-read')
    expect(result).toContain('Previously read.')
  })

  it('renders domain for external URLs', () => {
    const result = renderStory(baseStory, 1, false)
    expect(result).toContain('(example.com)')
  })

  it('handles story without URL', () => {
    const storyNoUrl = { ...baseStory, url: undefined }
    const result = renderStory(storyNoUrl, 1, false)

    expect(result).toContain('href="#item/123"')
    expect(result).not.toContain('story-domain')
  })

  it('escapes HTML in title', () => {
    const storyWithHtml = {
      ...baseStory,
      title: '<script>alert("xss")</script>',
    }
    const result = renderStory(storyWithHtml, 1, false)

    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
  })

  it('renders reading time for text posts', () => {
    const askHnStory = {
      ...baseStory,
      title: 'Ask HN: Test question',
      text: 'This is some text content. '.repeat(50), // ~250 words
    }
    const result = renderStory(askHnStory, 1, false)

    expect(result).toContain('story-reading-time')
  })

  it('adds job type attribute for jobs', () => {
    const jobStory = { ...baseStory, type: 2 } // ItemType.Job
    const result = renderStory(jobStory, 1, false)

    expect(result).toContain('data-type="job"')
  })

  it('adds heat attribute for high scores', () => {
    const hotStory = { ...baseStory, score: 500 }
    const result = renderStory(hotStory, 1, false)

    expect(result).toContain('data-heat=')
  })

  it('includes accessibility attributes', () => {
    const result = renderStory(baseStory, 1, false)

    expect(result).toContain('aria-label=')
    expect(result).toContain('aria-hidden="true"')
  })
})

describe('renderComment', () => {
  const baseComment: CommentWithChildren = {
    id: 456,
    type: 1, // Comment
    by: 'commenter',
    time: Math.floor(Date.now() / 1000) - 1800, // 30 min ago
    text: 'This is a comment.',
    parent: 123,
  }

  it('renders basic comment structure', () => {
    const result = renderComment(baseComment)

    expect(result).toContain('class="comment"')
    expect(result).toContain('data-id="456"')
    expect(result).toContain('This is a comment.')
    expect(result).toContain('commenter')
  })

  it('renders depth level', () => {
    const result = renderComment(baseComment, 3)

    expect(result).toContain('data-depth="3"')
    expect(result).toContain('--depth: 3')
  })

  it('highlights OP comments', () => {
    const result = renderComment(baseComment, 0, 'commenter')

    expect(result).toContain('comment-author-op')
    expect(result).toContain('OP</span>')
  })

  it('renders deleted comments', () => {
    const deletedComment = { ...baseComment, deleted: true }
    const result = renderComment(deletedComment)

    expect(result).toContain('comment-deleted')
    expect(result).toContain('[deleted]')
  })

  it('renders dead comments', () => {
    const deadComment = { ...baseComment, dead: true }
    const result = renderComment(deadComment)

    expect(result).toContain('comment-deleted')
    expect(result).toContain('[deleted]')
  })

  it('renders children recursively', () => {
    const commentWithChildren: CommentWithChildren = {
      ...baseComment,
      children: [
        {
          id: 789,
          type: 1,
          by: 'reply_user',
          time: baseComment.time + 100,
          text: 'This is a reply.',
          parent: 456,
        },
      ],
    }
    const result = renderComment(commentWithChildren)

    expect(result).toContain('comment-children')
    expect(result).toContain('This is a reply.')
    expect(result).toContain('reply_user')
  })

  it('shows reply count for comments with children', () => {
    const commentWithChildren: CommentWithChildren = {
      ...baseComment,
      children: [
        {
          id: 789,
          type: 1,
          by: 'user1',
          time: 0,
          text: 'Reply 1',
          parent: 456,
        },
        {
          id: 790,
          type: 1,
          by: 'user2',
          time: 0,
          text: 'Reply 2',
          parent: 456,
        },
      ],
    }
    const result = renderComment(commentWithChildren)

    expect(result).toContain('comment-replies')
  })

  it('renders load more button for unfetched children', () => {
    const commentWithKids: CommentWithChildren = {
      ...baseComment,
      kids: [789, 790, 791],
    }
    const result = renderComment(commentWithKids)

    expect(result).toContain('comment-load-more')
    expect(result).toContain('Load 3 replies')
  })

  it('uses singular "reply" for one child', () => {
    const commentWithOneKid: CommentWithChildren = {
      ...baseComment,
      kids: [789],
    }
    const result = renderComment(commentWithOneKid)

    expect(result).toContain('Load 1 reply')
  })

  it('sanitizes HTML in comment text', () => {
    const commentWithHtml: CommentWithChildren = {
      ...baseComment,
      text: '<script>alert("xss")</script><p>Safe content</p>',
    }
    const result = renderComment(commentWithHtml)

    expect(result).not.toContain('<script>')
    expect(result).toContain('<p>Safe content</p>')
  })

  it('includes collapse button', () => {
    const result = renderComment(baseComment)

    expect(result).toContain('comment-collapse')
    expect(result).toContain('title="Collapse"')
  })
})

describe('renderSubmissionItem', () => {
  it('renders story submission', () => {
    const story: HNItem = {
      id: 123,
      type: 0, // Story
      by: 'author',
      time: Math.floor(Date.now() / 1000) - 3600,
      title: 'My Story',
      url: 'https://example.com',
      score: 50,
      descendants: 10,
    }
    const result = renderSubmissionItem(story)

    expect(result).toContain('submission-story')
    expect(result).toContain('My Story')
    expect(result).toContain('50 points')
    expect(result).toContain('10 comments')
  })

  it('renders comment submission', () => {
    const comment: HNItem = {
      id: 456,
      type: 1, // Comment
      by: 'commenter',
      time: Math.floor(Date.now() / 1000) - 1800,
      text: 'My comment text',
      parent: 123,
    }
    const result = renderSubmissionItem(comment)

    expect(result).toContain('submission-comment')
    expect(result).toContain('My comment text')
    expect(result).toContain('on story')
    expect(result).toContain('href="#item/123"')
  })

  it('renders job submission with job class', () => {
    const job: HNItem = {
      id: 789,
      type: 2, // Job
      by: 'company',
      time: Math.floor(Date.now() / 1000),
      title: 'Software Engineer',
      url: 'https://jobs.example.com',
      score: 1,
    }
    const result = renderSubmissionItem(job)

    expect(result).toContain('submission-job')
    expect(result).toContain('Software Engineer')
  })

  it('handles submission without URL', () => {
    const story: HNItem = {
      id: 123,
      type: 0,
      by: 'author',
      time: Math.floor(Date.now() / 1000),
      title: 'Ask HN: Question',
      score: 10,
    }
    const result = renderSubmissionItem(story)

    expect(result).toContain('href="#item/123"')
    expect(result).toContain('target="_self"')
  })
})

describe('renderLoadMoreIndicator', () => {
  it('renders loading indicator', () => {
    const result = renderLoadMoreIndicator()

    expect(result).toContain('load-more-indicator')
    expect(result).toContain('loading-spinner')
    expect(result).toContain('Loading more stories')
  })

  it('renders end message when hasMore is false', () => {
    const result = renderLoadMoreIndicator(false)

    expect(result).toContain('load-more-indicator')
    expect(result).toContain('end')
    expect(result).toContain("You've reached the end")
  })
})

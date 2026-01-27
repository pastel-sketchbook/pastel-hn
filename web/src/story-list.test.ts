import { describe, expect, it } from 'vitest'
import { getFeedTitle } from './story-list'
import type { StoryFeed } from './types'

describe('getFeedTitle', () => {
  it('returns correct title for top feed', () => {
    expect(getFeedTitle('top')).toBe('Top Stories')
  })

  it('returns correct title for new feed', () => {
    expect(getFeedTitle('new')).toBe('New Stories')
  })

  it('returns correct title for best feed', () => {
    expect(getFeedTitle('best')).toBe('Best Stories')
  })

  it('returns correct title for ask feed', () => {
    expect(getFeedTitle('ask')).toBe('Ask HN')
  })

  it('returns correct title for show feed', () => {
    expect(getFeedTitle('show')).toBe('Show HN')
  })

  it('returns correct title for jobs feed', () => {
    expect(getFeedTitle('jobs')).toBe('Jobs')
  })

  it('returns correct title for saved feed', () => {
    expect(getFeedTitle('saved')).toBe('Saved Stories')
  })

  it('returns titles for all feed types', () => {
    const feeds: StoryFeed[] = ['top', 'new', 'best', 'ask', 'show', 'jobs', 'saved']
    for (const feed of feeds) {
      const title = getFeedTitle(feed)
      expect(title).toBeTruthy()
      expect(typeof title).toBe('string')
      expect(title.length).toBeGreaterThan(0)
    }
  })
})

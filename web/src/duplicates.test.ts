import { describe, expect, it } from 'vitest'
import { buildUrlIndex, findDuplicates, normalizeUrl } from './duplicates'
import type { HNItem } from './types'
import { ItemType } from './types'

// Factory for creating test stories
function makeStory(overrides: Partial<HNItem> = {}): HNItem {
  return {
    id: 1,
    type: ItemType.Story,
    by: 'user',
    time: Math.floor(Date.now() / 1000),
    text: null,
    url: 'https://example.com/article',
    score: 100,
    title: 'Test Story',
    descendants: 10,
    kids: null,
    parent: null,
    dead: false,
    deleted: false,
    ...overrides,
  }
}

describe('duplicates', () => {
  describe('normalizeUrl', () => {
    it('removes trailing slashes', () => {
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com')
      expect(normalizeUrl('https://example.com/path/')).toBe(
        'https://example.com/path',
      )
    })

    it('removes www prefix', () => {
      expect(normalizeUrl('https://www.example.com')).toBe(
        'https://example.com',
      )
      expect(normalizeUrl('https://www.example.com/path')).toBe(
        'https://example.com/path',
      )
    })

    it('removes common tracking parameters', () => {
      expect(normalizeUrl('https://example.com?utm_source=hn')).toBe(
        'https://example.com',
      )
      expect(
        normalizeUrl('https://example.com/path?utm_campaign=test&id=123'),
      ).toBe('https://example.com/path?id=123')
    })

    it('preserves meaningful query parameters', () => {
      expect(normalizeUrl('https://example.com?id=123')).toBe(
        'https://example.com?id=123',
      )
      expect(normalizeUrl('https://example.com?page=2&sort=new')).toBe(
        'https://example.com?page=2&sort=new',
      )
    })

    it('lowercases the URL', () => {
      expect(normalizeUrl('https://EXAMPLE.COM/PATH')).toBe(
        'https://example.com/PATH',
      )
    })

    it('handles null/empty URLs', () => {
      expect(normalizeUrl(null)).toBe(null)
      expect(normalizeUrl('')).toBe(null)
    })

    it('removes hash fragments', () => {
      expect(normalizeUrl('https://example.com#section')).toBe(
        'https://example.com',
      )
      expect(normalizeUrl('https://example.com/path#anchor')).toBe(
        'https://example.com/path',
      )
    })
  })

  describe('buildUrlIndex', () => {
    it('returns empty map for empty array', () => {
      const index = buildUrlIndex([])
      expect(index.size).toBe(0)
    })

    it('indexes stories by normalized URL', () => {
      const stories = [
        makeStory({ id: 1, url: 'https://example.com/' }),
        makeStory({ id: 2, url: 'https://other.com' }),
      ]
      const index = buildUrlIndex(stories)

      expect(index.get('https://example.com')).toEqual([1])
      expect(index.get('https://other.com')).toEqual([2])
    })

    it('groups stories with the same normalized URL', () => {
      const stories = [
        makeStory({ id: 1, url: 'https://example.com/' }),
        makeStory({ id: 2, url: 'https://www.example.com' }),
        makeStory({ id: 3, url: 'https://example.com?utm_source=hn' }),
      ]
      const index = buildUrlIndex(stories)

      expect(index.get('https://example.com')).toEqual([1, 2, 3])
    })

    it('ignores stories without URLs (Ask HN, etc.)', () => {
      const stories = [
        makeStory({ id: 1, url: null, title: 'Ask HN: Question?' }),
        makeStory({ id: 2, url: 'https://example.com' }),
      ]
      const index = buildUrlIndex(stories)

      expect(index.size).toBe(1)
      expect(index.get('https://example.com')).toEqual([2])
    })
  })

  describe('findDuplicates', () => {
    it('returns empty map when no duplicates exist', () => {
      const stories = [
        makeStory({ id: 1, url: 'https://a.com' }),
        makeStory({ id: 2, url: 'https://b.com' }),
        makeStory({ id: 3, url: 'https://c.com' }),
      ]
      const duplicates = findDuplicates(stories)

      expect(duplicates.size).toBe(0)
    })

    it('identifies duplicate stories', () => {
      const stories = [
        makeStory({ id: 1, url: 'https://example.com', score: 500 }),
        makeStory({ id: 2, url: 'https://www.example.com/', score: 100 }),
      ]
      const duplicates = findDuplicates(stories)

      expect(duplicates.has(1)).toBe(true)
      expect(duplicates.has(2)).toBe(true)
    })

    it('returns DuplicateInfo with other story IDs', () => {
      const stories = [
        makeStory({ id: 100, url: 'https://example.com' }),
        makeStory({ id: 200, url: 'https://example.com/' }),
        makeStory({ id: 300, url: 'https://www.example.com' }),
      ]
      const duplicates = findDuplicates(stories)

      const info100 = duplicates.get(100)
      expect(info100?.otherIds).toEqual([200, 300])

      const info200 = duplicates.get(200)
      expect(info200?.otherIds).toEqual([100, 300])

      const info300 = duplicates.get(300)
      expect(info300?.otherIds).toEqual([100, 200])
    })

    it('counts total submissions', () => {
      const stories = [
        makeStory({ id: 1, url: 'https://example.com' }),
        makeStory({ id: 2, url: 'https://example.com/' }),
        makeStory({ id: 3, url: 'https://www.example.com' }),
      ]
      const duplicates = findDuplicates(stories)

      expect(duplicates.get(1)?.totalSubmissions).toBe(3)
      expect(duplicates.get(2)?.totalSubmissions).toBe(3)
      expect(duplicates.get(3)?.totalSubmissions).toBe(3)
    })

    it('handles stories without URLs gracefully', () => {
      const stories = [
        makeStory({ id: 1, url: null }), // Ask HN, no URL
        makeStory({ id: 2, url: 'https://example.com' }),
      ]
      const duplicates = findDuplicates(stories)

      expect(duplicates.size).toBe(0)
      expect(duplicates.has(1)).toBe(false)
      expect(duplicates.has(2)).toBe(false)
    })

    it('handles empty story list', () => {
      const duplicates = findDuplicates([])
      expect(duplicates.size).toBe(0)
    })
  })
})

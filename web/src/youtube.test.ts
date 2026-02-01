import { describe, expect, it } from 'vitest'
import {
  extractVideoId,
  getEmbedUrl,
  getThumbnailUrl,
  isYouTubeUrl,
  parseYouTubeUrl,
  renderYouTubeEmbed,
} from './youtube'

describe('youtube', () => {
  describe('isYouTubeUrl', () => {
    it('returns true for youtube.com/watch URLs', () => {
      expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        true,
      )
      expect(isYouTubeUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
      expect(isYouTubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        true,
      )
    })

    it('returns true for youtu.be URLs', () => {
      expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
      expect(isYouTubeUrl('http://youtu.be/dQw4w9WgXcQ')).toBe(true)
    })

    it('returns true for youtube.com/embed URLs', () => {
      expect(isYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
        true,
      )
    })

    it('returns true for youtube.com/v URLs', () => {
      expect(isYouTubeUrl('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe(true)
    })

    it('returns false for non-YouTube URLs', () => {
      expect(isYouTubeUrl('https://vimeo.com/12345')).toBe(false)
      expect(isYouTubeUrl('https://google.com')).toBe(false)
      expect(isYouTubeUrl('https://example.com/youtube.com')).toBe(false)
    })

    it('returns false for invalid URLs', () => {
      expect(isYouTubeUrl('')).toBe(false)
      expect(isYouTubeUrl('not-a-url')).toBe(false)
      expect(isYouTubeUrl('youtube.com/watch?v=123')).toBe(false) // missing protocol
    })

    it('returns false for YouTube non-video pages', () => {
      expect(isYouTubeUrl('https://www.youtube.com/')).toBe(false)
      expect(isYouTubeUrl('https://www.youtube.com/channel/UC123')).toBe(false)
      expect(isYouTubeUrl('https://www.youtube.com/playlist?list=PL123')).toBe(
        false,
      )
    })
  })

  describe('extractVideoId', () => {
    it('extracts ID from youtube.com/watch URLs', () => {
      expect(
        extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      ).toBe('dQw4w9WgXcQ')
      expect(extractVideoId('https://youtube.com/watch?v=abc123XYZ_-')).toBe(
        'abc123XYZ_-',
      )
    })

    it('extracts ID from youtu.be URLs', () => {
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
      expect(extractVideoId('https://youtu.be/abc123XYZ_-')).toBe('abc123XYZ_-')
    })

    it('extracts ID from youtube.com/embed URLs', () => {
      expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ',
      )
    })

    it('extracts ID from youtube.com/v URLs', () => {
      expect(extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ',
      )
    })

    it('extracts ID from URLs with additional parameters', () => {
      expect(
        extractVideoId(
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PL123',
        ),
      ).toBe('dQw4w9WgXcQ')
      expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=120')).toBe(
        'dQw4w9WgXcQ',
      )
    })

    it('extracts ID when v is not the first parameter', () => {
      expect(
        extractVideoId(
          'https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ',
        ),
      ).toBe('dQw4w9WgXcQ')
    })

    it('returns null for non-YouTube URLs', () => {
      expect(extractVideoId('https://vimeo.com/12345')).toBe(null)
      expect(extractVideoId('https://google.com')).toBe(null)
    })

    it('returns null for invalid URLs', () => {
      expect(extractVideoId('')).toBe(null)
      expect(extractVideoId('not-a-url')).toBe(null)
    })

    it('returns null for YouTube URLs without video ID', () => {
      expect(extractVideoId('https://www.youtube.com/')).toBe(null)
      expect(extractVideoId('https://www.youtube.com/watch')).toBe(null)
      expect(extractVideoId('https://www.youtube.com/watch?list=PL123')).toBe(
        null,
      )
    })
  })

  describe('getEmbedUrl', () => {
    it('generates embed URL with required params', () => {
      const url = getEmbedUrl('dQw4w9WgXcQ')
      expect(url).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ')
      expect(url).toContain('origin=')
      expect(url).toContain('enablejsapi=1')
      expect(url).toContain('rel=0')
      expect(url).toContain('modestbranding=1')
    })

    it('adds autoplay parameter when requested', () => {
      const url = getEmbedUrl('dQw4w9WgXcQ', true)
      expect(url).toContain('autoplay=1')
    })

    it('does not add autoplay parameter when false', () => {
      const url = getEmbedUrl('dQw4w9WgXcQ', false)
      expect(url).not.toContain('autoplay=1')
    })
  })

  describe('getThumbnailUrl', () => {
    it('generates default quality thumbnail URL', () => {
      expect(getThumbnailUrl('dQw4w9WgXcQ')).toBe(
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      )
    })

    it('generates default quality thumbnail URL when specified', () => {
      expect(getThumbnailUrl('dQw4w9WgXcQ', 'default')).toBe(
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg',
      )
    })

    it('generates hq quality thumbnail URL', () => {
      expect(getThumbnailUrl('dQw4w9WgXcQ', 'hq')).toBe(
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      )
    })

    it('generates maxres quality thumbnail URL', () => {
      expect(getThumbnailUrl('dQw4w9WgXcQ', 'maxres')).toBe(
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      )
    })
  })

  describe('parseYouTubeUrl', () => {
    it('parses valid YouTube URL and returns video info', () => {
      const result = parseYouTubeUrl(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      )
      expect(result).not.toBe(null)
      expect(result?.videoId).toBe('dQw4w9WgXcQ')
      expect(result?.embedUrl).toContain(
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
      )
      expect(result?.thumbnailUrl).toBe(
        'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      )
      expect(result?.originalUrl).toBe(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      )
    })

    it('parses youtu.be URL', () => {
      const result = parseYouTubeUrl('https://youtu.be/abc123XYZ_-')
      expect(result).not.toBe(null)
      expect(result?.videoId).toBe('abc123XYZ_-')
      expect(result?.embedUrl).toContain(
        'https://www.youtube.com/embed/abc123XYZ_-',
      )
      expect(result?.thumbnailUrl).toBe(
        'https://i.ytimg.com/vi/abc123XYZ_-/hqdefault.jpg',
      )
      expect(result?.originalUrl).toBe('https://youtu.be/abc123XYZ_-')
    })

    it('returns null for non-YouTube URLs', () => {
      expect(parseYouTubeUrl('https://vimeo.com/12345')).toBe(null)
      expect(parseYouTubeUrl('https://google.com')).toBe(null)
    })

    it('returns null for invalid URLs', () => {
      expect(parseYouTubeUrl('')).toBe(null)
      expect(parseYouTubeUrl('not-a-url')).toBe(null)
    })

    it('returns null for YouTube URLs without video ID', () => {
      expect(parseYouTubeUrl('https://www.youtube.com/')).toBe(null)
    })
  })

  describe('renderYouTubeEmbed', () => {
    const testVideoInfo = {
      videoId: 'dQw4w9WgXcQ',
      embedUrl:
        'https://www.youtube.com/embed/dQw4w9WgXcQ?origin=http://localhost',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
      originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }

    it('renders embed container with correct video ID data attribute', () => {
      const html = renderYouTubeEmbed(testVideoInfo)
      expect(html).toContain('data-video-id="dQw4w9WgXcQ"')
    })

    it('renders thumbnail image with correct src', () => {
      const html = renderYouTubeEmbed(testVideoInfo)
      expect(html).toContain(
        'src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"',
      )
    })

    it('renders play button with correct aria-label', () => {
      const html = renderYouTubeEmbed(testVideoInfo)
      expect(html).toContain('aria-label="Play video"')
      expect(html).toContain('class="youtube-play-btn"')
    })

    it('renders fallback link to original URL', () => {
      const html = renderYouTubeEmbed(testVideoInfo)
      expect(html).toContain(
        'href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"',
      )
      expect(html).toContain('target="_blank"')
      expect(html).toContain('rel="noopener"')
    })

    it('stores embed URL in data attribute for lazy loading', () => {
      const html = renderYouTubeEmbed(testVideoInfo)
      expect(html).toContain('data-embed-url="')
      expect(html).toContain('youtube.com/embed/dQw4w9WgXcQ')
    })

    it('has youtube-embed class on container', () => {
      const html = renderYouTubeEmbed(testVideoInfo)
      expect(html).toContain('class="youtube-embed"')
    })
  })
})

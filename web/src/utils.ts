/**
 * Utility functions for pastel-hn
 * Pure functions with no side effects or DOM dependencies
 */

/**
 * Escape HTML special characters to prevent XSS
 * Uses DOM-based escaping for reliability
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Sanitize HTML content from HN API (comments/about text)
 * HN uses a limited subset of HTML: <p>, <a>, <pre>, <code>, <i>
 * Removes script tags and event handlers
 */
export function sanitizeHtml(html: string | null): string {
  if (!html) return ''
  // Basic sanitization - remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
}

/**
 * Calculate estimated reading time from word count
 * Average reading speed: ~200-250 words per minute
 * Using 200 wpm for comfortable reading
 */
export function calculateReadingTime(wordCount: number): string {
  if (wordCount <= 0) return ''
  const minutes = Math.ceil(wordCount / 200)
  if (minutes < 1) return 'less than 1 min read'
  if (minutes === 1) return '1 min read'
  return `${minutes} min read`
}

/**
 * Count words in text (strips HTML tags first)
 */
export function countWords(text: string): number {
  if (!text) return 0
  // Strip HTML tags
  const plainText = text.replace(/<[^>]*>/g, ' ')
  // Split by whitespace and filter empty strings
  const words = plainText.split(/\s+/).filter((word) => word.length > 0)
  return words.length
}

/**
 * Determine story type from title
 */
export function getStoryType(title: string | null): 'ask' | 'show' | null {
  if (!title) return null
  const lowerTitle = title.toLowerCase()
  if (lowerTitle.startsWith('ask hn:') || lowerTitle.startsWith('ask hn –'))
    return 'ask'
  if (lowerTitle.startsWith('show hn:') || lowerTitle.startsWith('show hn –'))
    return 'show'
  return null
}

/**
 * Determine score heat level for glow effect
 */
export function getScoreHeat(score: number): string {
  if (score >= 500) return 'fire'
  if (score >= 200) return 'hot'
  if (score >= 100) return 'warm'
  return ''
}

/**
 * Format account age from Unix timestamp
 */
export function formatAccountAge(created: number): string {
  const seconds = Math.floor(Date.now() / 1000 - created)
  const days = Math.floor(seconds / 86400)
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)

  if (years > 0) {
    return months > 0 ? `${years}y ${months}mo` : `${years} years`
  }
  if (months > 0) {
    return `${months} months`
  }
  return `${days} days`
}

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

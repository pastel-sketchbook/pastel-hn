import { extractDomain, fetchStories, formatTimeAgo, init } from './api'
import { initTheme, toggleTheme } from './theme'
import { type HNItem, ItemType, type StoryFeed } from './types'
import './styles/main.css'

let currentFeed: StoryFeed = 'top'
let isLoading = false

async function renderStories(feed: StoryFeed): Promise<void> {
  if (isLoading) return
  isLoading = true

  const container = document.getElementById('stories')
  if (!container) return

  container.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <span>Loading stories...</span>
    </div>
  `

  try {
    const stories = await fetchStories(feed, 30)
    container.innerHTML = stories
      .map((story, idx) => renderStory(story, idx + 1))
      .join('')
  } catch (error) {
    container.innerHTML = `
      <div class="error">
        <span class="error-icon">⚠</span>
        <span>Failed to load stories. Please try again.</span>
      </div>
    `
    console.error('Failed to load stories:', error)
  } finally {
    isLoading = false
  }
}

// Line-only SVG icons
const icons = {
  upvote: `<svg viewBox="0 0 24 24"><polyline points="6 15 12 9 18 15"/></svg>`,
  points: `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  comment: `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
}

// Determine story type from title
function getStoryType(title: string | null): 'ask' | 'show' | null {
  if (!title) return null
  const lowerTitle = title.toLowerCase()
  if (lowerTitle.startsWith('ask hn:') || lowerTitle.startsWith('ask hn –'))
    return 'ask'
  if (lowerTitle.startsWith('show hn:') || lowerTitle.startsWith('show hn –'))
    return 'show'
  return null
}

// Determine score heat level for glow effect
function getScoreHeat(score: number): string {
  if (score >= 500) return 'fire'
  if (score >= 200) return 'hot'
  if (score >= 100) return 'warm'
  return ''
}

function renderStory(story: HNItem, rank: number): string {
  const domain = extractDomain(story.url)
  const timeAgo = formatTimeAgo(story.time)
  const storyType =
    story.type === ItemType.Job ? 'job' : getStoryType(story.title)
  const scoreHeat = getScoreHeat(story.score)

  const typeAttr = storyType ? ` data-type="${storyType}"` : ''
  const heatAttr = scoreHeat ? ` data-heat="${scoreHeat}"` : ''

  return `
    <article class="story" data-id="${story.id}"${typeAttr}>
      <div class="story-rank">${rank}</div>
      <div class="story-vote">
        <button class="vote-btn" title="Upvote">${icons.upvote}</button>
      </div>
      <div class="story-content">
        <h2 class="story-title">
          <a href="${story.url || `#item/${story.id}`}" target="_blank" rel="noopener">
            ${escapeHtml(story.title || 'Untitled')}
          </a>
          ${domain ? `<span class="story-domain">(${domain})</span>` : ''}
        </h2>
        <div class="story-meta">
          <span class="story-score"${heatAttr}>${icons.points}${story.score} points</span>
          <span class="meta-sep"></span>
          <span class="story-by">${icons.user}${escapeHtml(story.by || 'unknown')}</span>
          <span class="meta-sep"></span>
          <span class="story-time">${icons.clock}${timeAgo}</span>
          <span class="meta-sep"></span>
          <span class="story-comments">
            <a href="#item/${story.id}">${icons.comment}${story.descendants || 0} comments</a>
          </span>
        </div>
      </div>
    </article>
  `
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function setupNavigation(): void {
  const nav = document.getElementById('nav')
  if (!nav) return

  nav.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const feedBtn = target.closest('[data-feed]') as HTMLElement | null
    if (!feedBtn) return

    const feed = feedBtn.dataset.feed as StoryFeed
    if (feed === currentFeed) return

    document.querySelectorAll('[data-feed]').forEach((btn) => {
      btn.classList.remove('active')
    })
    feedBtn.classList.add('active')

    currentFeed = feed
    renderStories(feed)
  })
}

function setupThemeToggle(): void {
  const toggle = document.getElementById('theme-toggle')
  if (!toggle) return

  toggle.addEventListener('click', () => {
    toggleTheme()
  })
}

async function main(): Promise<void> {
  // Initialize theme first to prevent flash of wrong theme
  initTheme()

  try {
    await init()
    setupNavigation()
    setupThemeToggle()
    await renderStories(currentFeed)
  } catch (error) {
    console.error('Failed to initialize:', error)
    const container = document.getElementById('stories')
    if (container) {
      container.innerHTML = `
        <div class="error">
          <span class="error-icon">⚠</span>
          <span>Failed to initialize. Please refresh the page.</span>
        </div>
      `
    }
  }
}

main()

import { extractDomain, fetchStories, formatTimeAgo, init } from './api'
import { initTheme, toggleTheme } from './theme'
import type { HNItem, StoryFeed } from './types'
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

function renderStory(story: HNItem, rank: number): string {
  const domain = extractDomain(story.url)
  const timeAgo = formatTimeAgo(story.time)

  return `
    <article class="story" data-id="${story.id}">
      <div class="story-rank">${rank}</div>
      <div class="story-vote">
        <button class="vote-btn" title="Upvote">▲</button>
      </div>
      <div class="story-content">
        <h2 class="story-title">
          <a href="${story.url || `#item/${story.id}`}" target="_blank" rel="noopener">
            ${escapeHtml(story.title || 'Untitled')}
          </a>
          ${domain ? `<span class="story-domain">(${domain})</span>` : ''}
        </h2>
        <div class="story-meta">
          <span class="story-score">${story.score} points</span>
          <span class="story-by">by ${escapeHtml(story.by || 'unknown')}</span>
          <span class="story-time">${timeAgo}</span>
          <span class="story-comments">
            <a href="#item/${story.id}">${story.descendants || 0} comments</a>
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

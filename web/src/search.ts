/**
 * Search modal functionality for Hacker News search
 */
import {
  extractDomain,
  formatTimeAgo,
  type SearchFilter,
  type SearchResult,
  type SearchSort,
  searchHN,
} from './api'
import { createFocusTrap, type FocusTrapInstance } from './focus-trap'
import { icons } from './icons'
import { escapeHtml } from './utils'

// Search modal state
let searchModalOpen = false
let searchModalFocusTrap: FocusTrapInstance | null = null
let searchQuery = ''
let searchResults: SearchResult[] = []
let searchSort: SearchSort = 'relevance'
let searchFilter: SearchFilter = 'all'
let searchPage = 0
let searchTotalPages = 0
let searchTotalHits = 0
let isSearching = false
let searchDebounceTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Check if search modal is currently open
 */
export function isSearchModalOpen(): boolean {
  return searchModalOpen
}

/**
 * Show the search modal
 */
export function showSearchModal(): void {
  if (searchModalOpen) return
  searchModalOpen = true

  // Reset search state
  searchQuery = ''
  searchResults = []
  searchSort = 'relevance'
  searchFilter = 'all'
  searchPage = 0
  searchTotalPages = 0
  searchTotalHits = 0
  isSearching = false

  const modal = document.createElement('div')
  modal.className = 'search-modal-overlay'
  modal.innerHTML = `
    <div class="search-modal cyber-frame" role="dialog" aria-modal="true" aria-labelledby="search-modal-title">
      <span class="corner-tr"></span>
      <span class="corner-bl"></span>
      <h2 class="sr-only" id="search-modal-title">Search Hacker News</h2>
      <div class="search-header">
        <div class="search-input-wrapper">
          ${icons.search}
          <input
            type="text"
            class="search-input"
            placeholder="Search Hacker News..."
            autofocus
            aria-label="Search query"
          />
        </div>
        <div class="search-filters" role="group" aria-label="Search filters">
          <button class="search-filter-btn active" data-filter="all" aria-pressed="true">All</button>
          <button class="search-filter-btn" data-filter="story" aria-pressed="false">Stories</button>
          <button class="search-filter-btn" data-filter="comment" aria-pressed="false">Comments</button>
          <button class="search-filter-btn search-sort-btn" data-sort="toggle" aria-pressed="false" aria-label="Sort by: Relevance">
            ${icons.sort}
            <span class="sort-label">Relevance</span>
          </button>
        </div>
      </div>
      <div class="search-results" role="region" aria-live="polite" aria-label="Search results">
        <div class="search-hint">
          Type to search • <kbd>Esc</kbd> to close
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modal)

  // Set up focus trap
  const modalContent = modal.querySelector('.search-modal') as HTMLElement
  if (modalContent) {
    searchModalFocusTrap = createFocusTrap(modalContent)
    searchModalFocusTrap.activate()
  }

  // Get input element
  const input = modal.querySelector('.search-input') as HTMLInputElement
  if (input) {
    input.focus()

    // Handle input with debounce
    input.addEventListener('input', () => {
      const query = input.value.trim()
      if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout)

      if (query.length < 2) {
        searchResults = []
        renderSearchResults()
        return
      }

      searchDebounceTimeout = setTimeout(() => {
        searchQuery = query
        searchPage = 0
        performSearch()
      }, 300)
    })

    // Handle keyboard in input
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSearchModal()
      }
    })
  }

  // Handle filter clicks
  modal.addEventListener('click', (e) => {
    const target = e.target as HTMLElement

    // Close on backdrop click
    if (target === modal) {
      closeSearchModal()
      return
    }

    // Filter buttons
    const filterBtn = target.closest('[data-filter]') as HTMLElement
    if (filterBtn) {
      const filter = filterBtn.dataset.filter as SearchFilter
      if (filter && filter !== searchFilter) {
        searchFilter = filter
        modal.querySelectorAll('[data-filter]').forEach((btn) => {
          const isActive = btn === filterBtn
          btn.classList.toggle('active', isActive)
          btn.setAttribute('aria-pressed', isActive ? 'true' : 'false')
        })
        if (searchQuery.length >= 2) {
          searchPage = 0
          performSearch()
        }
      }
      return
    }

    // Sort toggle
    const sortBtn = target.closest('[data-sort="toggle"]') as HTMLElement
    if (sortBtn) {
      searchSort = searchSort === 'relevance' ? 'date' : 'relevance'
      const label = sortBtn.querySelector('.sort-label')
      if (label) {
        label.textContent = searchSort === 'relevance' ? 'Relevance' : 'Date'
      }
      const isDateSort = searchSort === 'date'
      sortBtn.classList.toggle('active', isDateSort)
      sortBtn.setAttribute('aria-pressed', isDateSort ? 'true' : 'false')
      sortBtn.setAttribute(
        'aria-label',
        `Sort by: ${searchSort === 'relevance' ? 'Relevance' : 'Date'}`,
      )
      if (searchQuery.length >= 2) {
        searchPage = 0
        performSearch()
      }
      return
    }

    // Pagination
    const prevBtn = target.closest('[data-action="prev-page"]')
    if (prevBtn && searchPage > 0) {
      searchPage--
      performSearch()
      return
    }

    const nextBtn = target.closest('[data-action="next-page"]')
    if (nextBtn && searchPage < searchTotalPages - 1) {
      searchPage++
      performSearch()
      return
    }

    // Result click
    const resultEl = target.closest('.search-result') as HTMLElement
    if (resultEl) {
      const resultId = resultEl.dataset.id
      const resultType = resultEl.dataset.type
      if (resultId) {
        closeSearchModal()
        if (resultType === 'comment') {
          // Navigate to the story containing the comment
          const storyId = resultEl.dataset.storyId
          if (storyId) {
            window.location.hash = `item/${storyId}`
          }
        } else {
          window.location.hash = `item/${resultId}`
        }
      }
    }
  })
}

/**
 * Close the search modal
 */
export function closeSearchModal(): void {
  // Deactivate focus trap first
  if (searchModalFocusTrap) {
    searchModalFocusTrap.deactivate()
    searchModalFocusTrap = null
  }

  const modal = document.querySelector('.search-modal-overlay')
  if (modal) {
    modal.remove()
    searchModalOpen = false
  }
  if (searchDebounceTimeout) {
    clearTimeout(searchDebounceTimeout)
    searchDebounceTimeout = null
  }
}

/**
 * Perform search with current query, filter, and sort
 */
async function performSearch(): Promise<void> {
  if (!searchQuery || searchQuery.length < 2) return

  isSearching = true
  renderSearchResults()

  try {
    const response = await searchHN(searchQuery, {
      page: searchPage,
      hitsPerPage: 20,
      sort: searchSort,
      filter: searchFilter,
    })

    searchResults = response.hits
    searchTotalPages = response.nbPages
    searchTotalHits = response.nbHits
    isSearching = false
    renderSearchResults()
  } catch (error) {
    console.error('Search error:', error)
    isSearching = false
    searchResults = []
    renderSearchResults(true)
  }
}

/**
 * Render search results in the modal
 */
function renderSearchResults(hasError = false): void {
  const container = document.querySelector('.search-results')
  if (!container) return

  // Loading state
  if (isSearching) {
    container.innerHTML = `
      <div class="search-loading">
        <div class="loading-spinner"></div>
        <span>Searching...</span>
      </div>
    `
    return
  }

  // Error state
  if (hasError) {
    container.innerHTML = `
      <div class="search-error">
        <span>Search failed. Please try again.</span>
      </div>
    `
    return
  }

  // Empty state (no query)
  if (!searchQuery || searchQuery.length < 2) {
    container.innerHTML = `
      <div class="search-hint">
        Type to search • <kbd>Esc</kbd> to close
      </div>
    `
    return
  }

  // No results
  if (searchResults.length === 0) {
    container.innerHTML = `
      <div class="search-empty">
        ${icons.search}
        <span>No results found for "${escapeHtml(searchQuery)}"</span>
      </div>
    `
    return
  }

  // Results
  const resultsHtml = searchResults.map(renderSearchResult).join('')

  const paginationHtml =
    searchTotalPages > 1
      ? `
    <div class="search-pagination">
      <button class="search-pagination-btn" data-action="prev-page" ${searchPage === 0 ? 'disabled' : ''}>
        ← Prev
      </button>
      <span class="search-pagination-info">
        Page ${searchPage + 1} of ${searchTotalPages} • ${searchTotalHits.toLocaleString()} results
      </span>
      <button class="search-pagination-btn" data-action="next-page" ${searchPage >= searchTotalPages - 1 ? 'disabled' : ''}>
        Next →
      </button>
    </div>
  `
      : `<div class="search-pagination-info" style="text-align: center; padding: 1rem;">
        ${searchTotalHits.toLocaleString()} results
      </div>`

  container.innerHTML = resultsHtml + paginationHtml
}

/**
 * Render a single search result
 */
export function renderSearchResult(result: SearchResult): string {
  const isComment = result.type === 'comment'
  const typeClass = isComment ? 'search-result-comment' : ''

  if (isComment) {
    // Comment result
    const storyTitle = result.storyTitle
      ? escapeHtml(result.storyTitle)
      : 'Unknown story'
    const textPreview = result.text ? escapeHtml(result.text.slice(0, 200)) : ''
    const timeAgo = result.createdAt ? formatTimeAgo(result.createdAt) : ''

    return `
      <div class="search-result ${typeClass}" data-id="${result.id}" data-type="comment" data-story-id="${result.storyId || ''}">
        <div class="search-result-title">
          Re: ${storyTitle}
        </div>
        ${textPreview ? `<div class="search-result-comment-text">${textPreview}...</div>` : ''}
        <div class="search-result-meta">
          ${icons.user}<span>${escapeHtml(result.author || 'unknown')}</span>
          <span class="meta-sep">•</span>
          ${icons.clock}<span>${timeAgo}</span>
        </div>
      </div>
    `
  }

  // Story result
  const title = result.title ? escapeHtml(result.title) : 'Untitled'
  const domain = result.url ? extractDomain(result.url) : null
  const timeAgo = result.createdAt ? formatTimeAgo(result.createdAt) : ''

  return `
    <div class="search-result ${typeClass}" data-id="${result.id}" data-type="story">
      <div class="search-result-title">
        ${title}
        ${domain ? `<span class="meta-sep">•</span><span class="result-domain">${domain}</span>` : ''}
      </div>
      <div class="search-result-meta">
        ${icons.points}<span>${result.points}</span>
        <span class="meta-sep">•</span>
        ${icons.user}<span>${escapeHtml(result.author || 'unknown')}</span>
        <span class="meta-sep">•</span>
        ${icons.clock}<span>${timeAgo}</span>
        <span class="meta-sep">•</span>
        ${icons.comment}<span>${result.numComments}</span>
      </div>
    </div>
  `
}

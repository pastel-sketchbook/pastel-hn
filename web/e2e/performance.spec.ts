import { test, expect, type Page } from '@playwright/test'

/**
 * Performance benchmark tests for pastel-hn.
 *
 * These tests measure Core Web Vitals and other performance metrics
 * to ensure the app meets its performance targets:
 * - First Contentful Paint (FCP) < 500ms
 * - Time to First Story < 1000ms
 * - All interactions < 100ms feedback
 */

/** Performance metric thresholds (in milliseconds) */
const THRESHOLDS = {
  /** First Contentful Paint target */
  FCP: 500,
  /** Time until first story is visible */
  TIME_TO_FIRST_STORY: 1000,
  /** Largest Contentful Paint target */
  LCP: 1500,
  /** Total Blocking Time - how long main thread is blocked */
  TBT: 300,
  /** Feed switch should feel instant */
  FEED_SWITCH: 200,
  /** Navigation to story detail */
  STORY_DETAIL_NAVIGATION: 500,
}

interface PerformanceMetrics {
  fcp: number | null
  lcp: number | null
  ttfb: number | null
  domContentLoaded: number | null
  load: number | null
}

/**
 * Collect Core Web Vitals from the page.
 */
async function collectMetrics(page: Page): Promise<PerformanceMetrics> {
  return await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming | undefined

    // Get paint timings
    const paintEntries = performance.getEntriesByType('paint')
    const fcpEntry = paintEntries.find(
      (entry) => entry.name === 'first-contentful-paint'
    )

    // Get LCP from PerformanceObserver if available
    let lcp: number | null = null
    const lcpEntries = performance.getEntriesByType(
      'largest-contentful-paint'
    ) as PerformanceEntry[]
    if (lcpEntries.length > 0) {
      lcp = lcpEntries[lcpEntries.length - 1].startTime
    }

    return {
      fcp: fcpEntry?.startTime ?? null,
      lcp,
      ttfb: navigation?.responseStart ?? null,
      domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
      load: navigation?.loadEventEnd ?? null,
    }
  })
}

/**
 * Helper function to wait for stories to load (handles API failures gracefully)
 */
async function waitForStoriesOrError(
  page: Page,
  timeout = 30000
): Promise<{ hasStories: boolean; hasError: boolean }> {
  // Wait for loading to complete first
  await expect(page.locator('.loading')).toBeHidden({ timeout })

  // Check what we got
  const storyCount = await page.locator('.story').count()
  const errorCount = await page.locator('.error-state, .error').count()

  return {
    hasStories: storyCount > 0,
    hasError: errorCount > 0,
  }
}

test.describe('Performance Benchmarks', () => {
  // Performance tests need stable measurements
  test.setTimeout(60000)

  test.describe('Core Web Vitals', () => {
    test('First Contentful Paint (FCP) should be under 500ms', async ({
      page,
    }) => {
      // Navigate with performance measurement
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      // Wait a bit for paint metrics to be recorded
      await page.waitForTimeout(100)

      const metrics = await collectMetrics(page)

      console.log('Performance Metrics:', {
        FCP: metrics.fcp ? `${metrics.fcp.toFixed(2)}ms` : 'N/A',
        TTFB: metrics.ttfb ? `${metrics.ttfb.toFixed(2)}ms` : 'N/A',
        DOMContentLoaded: metrics.domContentLoaded
          ? `${metrics.domContentLoaded.toFixed(2)}ms`
          : 'N/A',
      })

      // FCP should be available and under threshold
      expect(metrics.fcp).not.toBeNull()
      expect(metrics.fcp).toBeLessThan(THRESHOLDS.FCP)
    })

    test('Time to First Story should be under 1000ms (when API available)', async ({
      page,
    }) => {
      const navigationStart = Date.now()
      await page.goto('/')

      const { hasStories, hasError } = await waitForStoriesOrError(page)

      if (!hasStories) {
        // Skip if API is not available
        test.skip(
          true,
          hasError ? 'API returned error' : 'API returned no stories'
        )
        return
      }

      const timeToFirstStory = Date.now() - navigationStart

      console.log(`Time to First Story: ${timeToFirstStory}ms`)

      // First story should be visible within 1 second of navigation
      expect(timeToFirstStory).toBeLessThan(THRESHOLDS.TIME_TO_FIRST_STORY)
    })

    test('DOM Content Loaded should be fast', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      const metrics = await collectMetrics(page)

      console.log(
        `DOMContentLoaded: ${metrics.domContentLoaded?.toFixed(2) ?? 'N/A'}ms`
      )

      // DOM should be ready quickly (content is in HTML shell)
      expect(metrics.domContentLoaded).not.toBeNull()
      expect(metrics.domContentLoaded).toBeLessThan(300)
    })
  })

  test.describe('Interaction Performance', () => {
    test('Feed switching should feel instant (when API available)', async ({
      page,
    }) => {
      await page.goto('/')
      const { hasStories } = await waitForStoriesOrError(page)

      if (!hasStories) {
        test.skip(true, 'API not available, skipping interaction test')
        return
      }

      // Measure feed switch time (UI feedback, not content loading)
      const startTime = Date.now()
      await page.click('[data-feed="new"]')

      // Wait for UI feedback (active class change)
      await expect(page.locator('[data-feed="new"]')).toHaveClass(/active/)

      const feedSwitchTime = Date.now() - startTime

      console.log(`Feed switch time (UI feedback): ${feedSwitchTime}ms`)

      // UI feedback should be immediate
      expect(feedSwitchTime).toBeLessThan(THRESHOLDS.FEED_SWITCH)
    })

    test('Story detail navigation should be fast (when API available)', async ({
      page,
    }) => {
      await page.goto('/')
      const { hasStories } = await waitForStoriesOrError(page)

      if (!hasStories) {
        test.skip(true, 'API not available, skipping interaction test')
        return
      }

      // Measure navigation to story detail
      const startTime = Date.now()
      await page.locator('.story').first().click()

      // Wait for detail view to appear
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      const navigationTime = Date.now() - startTime

      console.log(`Story detail navigation time: ${navigationTime}ms`)

      // Should navigate quickly (data may be prefetched)
      expect(navigationTime).toBeLessThan(THRESHOLDS.STORY_DETAIL_NAVIGATION)
    })

    test('Theme toggle should be instant', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      // Wait for app to initialize (theme module sets data-theme attribute)
      await page.waitForFunction(
        () => document.documentElement.hasAttribute('data-theme'),
        { timeout: 5000 }
      )

      const initialTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme')
      )

      const startTime = Date.now()
      await page.click('#theme-toggle')

      // Wait for theme attribute to change
      await page.waitForFunction(
        (initial) =>
          document.documentElement.getAttribute('data-theme') !== initial,
        initialTheme,
        { timeout: 1000 }
      )

      const newTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme')
      )

      const toggleTime = Date.now() - startTime

      console.log(
        `Theme toggle time: ${toggleTime}ms (${initialTheme} -> ${newTheme})`
      )

      expect(newTheme).not.toBe(initialTheme)
      expect(toggleTime).toBeLessThan(100) // Theme toggle should be instant
    })
  })

  test.describe('Resource Loading', () => {
    test('Critical resources should be small', async ({ page }) => {
      const responses: { url: string; size: number }[] = []

      // Collect response sizes
      page.on('response', async (response) => {
        try {
          const headers = response.headers()
          const contentLength = headers['content-length']
          if (contentLength) {
            responses.push({
              url: response.url(),
              size: parseInt(contentLength, 10),
            })
          }
        } catch {
          // Ignore errors from response handling
        }
      })

      await page.goto('/', { waitUntil: 'load' })

      // Log critical resource sizes
      const jsResources = responses.filter((r) => r.url.includes('.js'))
      const cssResources = responses.filter((r) => r.url.includes('.css'))

      console.log('JavaScript bundles:')
      for (const resource of jsResources) {
        const name = resource.url.split('/').pop() ?? resource.url
        console.log(`  ${name}: ${(resource.size / 1024).toFixed(2)}KB`)
      }

      console.log('CSS bundles:')
      for (const resource of cssResources) {
        const name = resource.url.split('/').pop() ?? resource.url
        console.log(`  ${name}: ${(resource.size / 1024).toFixed(2)}KB`)
      }

      // Main JS bundle should be under 150KB
      const mainBundle = jsResources.find(
        (r) => r.url.includes('index-') && r.url.endsWith('.js')
      )
      if (mainBundle) {
        expect(mainBundle.size).toBeLessThan(150 * 1024) // 150KB
      }
    })

    test('App shell renders immediately without JavaScript', async ({
      page,
    }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      // Check that the app shell is in the HTML (before JS fully executes)
      const appShellVisible = await page.evaluate(() => {
        const header = document.querySelector('header')
        const nav = document.querySelector('nav')
        const main = document.querySelector('main')
        return {
          hasHeader: header !== null,
          hasNav: nav !== null,
          hasMain: main !== null,
        }
      })

      console.log('App Shell:', appShellVisible)

      expect(appShellVisible.hasHeader).toBe(true)
      expect(appShellVisible.hasNav).toBe(true)
      expect(appShellVisible.hasMain).toBe(true)
    })
  })

  test.describe('Benchmark Summary', () => {
    test('Generate performance report', async ({ page }) => {
      // Collect all metrics in one run
      const navigationStart = Date.now()
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      // Wait for paint metrics
      await page.waitForTimeout(100)

      const metrics = await collectMetrics(page)

      // Wait for content
      const { hasStories } = await waitForStoriesOrError(page)

      let timeToFirstStory: number | null = null
      if (hasStories) {
        timeToFirstStory = Date.now() - navigationStart
      }

      // Generate report
      console.log('\n========== PERFORMANCE BENCHMARK REPORT ==========')
      console.log(`Date: ${new Date().toISOString()}`)
      console.log('\nCore Web Vitals:')
      console.log(
        `  FCP:  ${metrics.fcp?.toFixed(2) ?? 'N/A'}ms (target: <${THRESHOLDS.FCP}ms)`
      )
      console.log(
        `  LCP:  ${metrics.lcp?.toFixed(2) ?? 'N/A'}ms (target: <${THRESHOLDS.LCP}ms)`
      )
      console.log(`  TTFB: ${metrics.ttfb?.toFixed(2) ?? 'N/A'}ms`)
      console.log('\nPage Load:')
      console.log(
        `  DOMContentLoaded: ${metrics.domContentLoaded?.toFixed(2) ?? 'N/A'}ms`
      )
      console.log(`  Full Load: ${metrics.load?.toFixed(2) ?? 'N/A'}ms`)
      console.log(
        `  Time to First Story: ${timeToFirstStory ?? 'N/A'}ms (target: <${THRESHOLDS.TIME_TO_FIRST_STORY}ms)`
      )
      console.log('\nStatus:')

      const fcpPass = metrics.fcp !== null && metrics.fcp < THRESHOLDS.FCP
      const ttfsPass =
        timeToFirstStory !== null &&
        timeToFirstStory < THRESHOLDS.TIME_TO_FIRST_STORY

      console.log(`  FCP:  ${fcpPass ? '✓ PASS' : '✗ FAIL'}`)
      console.log(
        `  TTFS: ${ttfsPass ? '✓ PASS' : hasStories ? '✗ FAIL' : '⊘ SKIP (API unavailable)'}`
      )
      console.log('==================================================\n')

      // FCP must pass (doesn't depend on API)
      expect(fcpPass).toBe(true)
    })
  })
})

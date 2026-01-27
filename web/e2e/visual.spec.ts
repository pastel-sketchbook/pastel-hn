import { test, expect, type Page } from '@playwright/test'

/**
 * Visual Regression Tests for pastel-hn
 *
 * These tests capture screenshots of key UI states and compare against baselines.
 * Run `bun run test:e2e -- --update-snapshots` to update baseline images.
 */

/**
 * Helper function to wait for stories to load
 */
async function waitForStories(page: Page, timeout = 30000): Promise<void> {
  await expect(page.locator('.loading')).toBeHidden({ timeout })
  const storyLocator = page.locator('.story').first()
  const errorLocator = page.locator('.error-state, .error')
  await Promise.race([
    expect(storyLocator).toBeVisible({ timeout }),
    expect(errorLocator).toBeVisible({ timeout }),
  ]).catch(() => {})
}

async function storiesLoaded(page: Page): Promise<boolean> {
  const storyCount = await page.locator('.story').count()
  return storyCount > 0
}

/**
 * Hide dynamic content that changes between runs
 */
async function hideDynamicContent(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      /* Hide time-based content that changes */
      .story-time, .comment-time, .user-age { visibility: hidden !important; }
      /* Stabilize animations */
      *, *::before, *::after { 
        animation-duration: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  })
}

test.describe('Visual Regression Tests', () => {
  test.setTimeout(60000)

  test.describe('Light Theme', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)
      // Ensure light theme
      const theme = await page.locator('html').getAttribute('data-theme')
      if (theme === 'dark') {
        await page.keyboard.press('d')
        await page.waitForTimeout(100)
      }
      await hideDynamicContent(page)
    })

    test('story list view - light theme', async ({ page }) => {
      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }
      await expect(page).toHaveScreenshot('story-list-light.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })

    test('story card hover state - light theme', async ({ page }) => {
      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }
      const firstStory = page.locator('.story').first()
      await firstStory.hover()
      await page.waitForTimeout(100) // Wait for hover animation
      await expect(firstStory).toHaveScreenshot('story-card-hover-light.png', {
        maxDiffPixels: 50,
      })
    })

    test('story detail view - light theme', async ({ page }) => {
      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })
      await hideDynamicContent(page)
      await expect(page).toHaveScreenshot('story-detail-light.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })

    test('settings modal - light theme', async ({ page }) => {
      await page.click('#settings-toggle')
      await expect(page.locator('.settings-modal')).toBeVisible()
      await expect(page.locator('.settings-modal')).toHaveScreenshot(
        'settings-modal-light.png',
        { maxDiffPixels: 50 }
      )
    })

    test('help modal - light theme', async ({ page }) => {
      await page.keyboard.type('?')
      await expect(page.locator('.help-modal')).toBeVisible()
      await expect(page.locator('.help-modal')).toHaveScreenshot(
        'help-modal-light.png',
        { maxDiffPixels: 50 }
      )
    })

    test('search modal - light theme', async ({ page }) => {
      await page.keyboard.press('/')
      await expect(page.locator('.search-modal')).toBeVisible()
      await expect(page.locator('.search-modal')).toHaveScreenshot(
        'search-modal-light.png',
        { maxDiffPixels: 50 }
      )
    })
  })

  test.describe('Dark Theme', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)
      // Ensure dark theme
      const theme = await page.locator('html').getAttribute('data-theme')
      if (theme !== 'dark') {
        await page.keyboard.press('d')
        await page.waitForTimeout(100)
      }
      await hideDynamicContent(page)
    })

    test('story list view - dark theme', async ({ page }) => {
      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }
      await expect(page).toHaveScreenshot('story-list-dark.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })

    test('story card hover state - dark theme', async ({ page }) => {
      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }
      const firstStory = page.locator('.story').first()
      await firstStory.hover()
      await page.waitForTimeout(100)
      await expect(firstStory).toHaveScreenshot('story-card-hover-dark.png', {
        maxDiffPixels: 50,
      })
    })

    test('story detail view - dark theme', async ({ page }) => {
      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })
      await hideDynamicContent(page)
      await expect(page).toHaveScreenshot('story-detail-dark.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })

    test('settings modal - dark theme', async ({ page }) => {
      await page.click('#settings-toggle')
      await expect(page.locator('.settings-modal')).toBeVisible()
      await expect(page.locator('.settings-modal')).toHaveScreenshot(
        'settings-modal-dark.png',
        { maxDiffPixels: 50 }
      )
    })

    test('help modal - dark theme', async ({ page }) => {
      await page.keyboard.type('?')
      await expect(page.locator('.help-modal')).toBeVisible()
      await expect(page.locator('.help-modal')).toHaveScreenshot(
        'help-modal-dark.png',
        { maxDiffPixels: 50 }
      )
    })

    test('search modal - dark theme', async ({ page }) => {
      await page.keyboard.press('/')
      await expect(page.locator('.search-modal')).toBeVisible()
      await expect(page.locator('.search-modal')).toHaveScreenshot(
        'search-modal-dark.png',
        { maxDiffPixels: 50 }
      )
    })

    test('neon glow effects on interactive elements', async ({ page }) => {
      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }
      // Focus on a story to see keyboard focus styling
      await page.keyboard.press('j')
      const selectedStory = page.locator('.story-selected')
      await expect(selectedStory).toHaveScreenshot('story-selected-glow-dark.png', {
        maxDiffPixels: 50,
      })
    })
  })

  test.describe('Zen Mode', () => {
    test('zen mode hides chrome - dark theme', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)
      // Ensure dark theme
      const theme = await page.locator('html').getAttribute('data-theme')
      if (theme !== 'dark') {
        await page.keyboard.press('d')
        await page.waitForTimeout(100)
      }

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      await page.keyboard.press('z')
      await expect(page.locator('html')).toHaveClass(/zen-mode/)
      await hideDynamicContent(page)

      await expect(page).toHaveScreenshot('zen-mode-dark.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })

    test('zen mode badge visible', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)
      await page.keyboard.press('z')
      await expect(page.locator('.zen-mode-badge')).toBeVisible()
      await expect(page.locator('.zen-mode-badge')).toHaveScreenshot(
        'zen-mode-badge.png',
        { maxDiffPixels: 20 }
      )
    })
  })

  test.describe('Feed Navigation', () => {
    test('active feed indicator styling', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)
      await hideDynamicContent(page)

      // Capture nav with "top" active
      const nav = page.locator('nav')
      await expect(nav).toHaveScreenshot('nav-top-active.png', {
        maxDiffPixels: 30,
      })

      // Switch to "ask" and capture
      await page.click('[data-feed="ask"]')
      await page.waitForTimeout(500)
      await expect(nav).toHaveScreenshot('nav-ask-active.png', {
        maxDiffPixels: 30,
      })
    })
  })

  test.describe('User Profile', () => {
    test('user profile view', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to user profile
      await page.locator('.user-link').first().click()
      await expect(page.locator('.user-profile')).toBeVisible({ timeout: 15000 })
      await hideDynamicContent(page)

      await expect(page).toHaveScreenshot('user-profile.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })
  })

  test.describe('Loading States', () => {
    test('skeleton loading state', async ({ page }) => {
      // Intercept API calls to delay them
      await page.route('**/hacker-news.firebaseio.com/**', async (route) => {
        await new Promise((r) => setTimeout(r, 2000))
        await route.continue()
      })

      await page.goto('/')

      // Capture skeleton while loading
      const skeleton = page.locator('.skeleton, .loading')
      const hasSkeletons = (await skeleton.count()) > 0
      if (hasSkeletons) {
        await expect(page).toHaveScreenshot('loading-skeleton.png', {
          fullPage: false,
          maxDiffPixels: 100,
        })
      }
    })
  })

  test.describe('Component States', () => {
    test('toast notification', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to story detail
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Click copy link to trigger toast
      await page.click('[data-action="copy-hn-link"]')
      await page.waitForTimeout(100)

      // Capture toast if visible
      const toast = page.locator('.toast')
      const hasToast = (await toast.count()) > 0
      if (hasToast) {
        await expect(toast.first()).toHaveScreenshot('toast-notification.png', {
          maxDiffPixels: 30,
        })
      }
    })
  })

  test.describe('Responsive Layouts', () => {
    test('mobile viewport - story list', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      await hideDynamicContent(page)
      await expect(page).toHaveScreenshot('story-list-mobile.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })

    test('tablet viewport - story list', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 }) // iPad
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      await hideDynamicContent(page)
      await expect(page).toHaveScreenshot('story-list-tablet.png', {
        fullPage: false,
        maxDiffPixels: 100,
      })
    })
  })
})

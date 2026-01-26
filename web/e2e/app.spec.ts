import { test, expect, type Page } from '@playwright/test'

/**
 * Helper function to wait for stories to load
 * Stories can be in .virtual-scroll-items or directly in #stories
 */
async function waitForStories(page: Page, timeout = 30000): Promise<void> {
  // Wait for loading to complete
  await expect(page.locator('.loading')).toBeHidden({ timeout })

  // Wait for either stories to appear or an error state
  const storyLocator = page.locator('.story').first()
  const errorLocator = page.locator('.error-state, .error')

  // Wait for either condition with a longer timeout for API calls
  await Promise.race([
    expect(storyLocator).toBeVisible({ timeout }),
    expect(errorLocator).toBeVisible({ timeout }),
  ]).catch(() => {
    // If neither appears, continue - test will fail with appropriate message
  })
}

/**
 * Helper to check if stories loaded successfully
 */
async function storiesLoaded(page: Page): Promise<boolean> {
  const storyCount = await page.locator('.story').count()
  return storyCount > 0
}

test.describe('pastel-hn E2E Tests', () => {
  // Increase default timeout for all tests since we're hitting a real API
  test.setTimeout(60000)

  test.describe('List View', () => {
    test('loads and displays stories on the homepage', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Check if stories loaded (may fail if API is down)
      const hasStories = await storiesLoaded(page)
      if (!hasStories) {
        // If no stories, check for error state
        const hasError = (await page.locator('.error-state, .error').count()) > 0
        expect(hasError).toBe(true) // Should show error if no stories
        test.skip(true, 'API returned no stories or error')
        return
      }

      // Should have stories displayed
      const stories = page.locator('.story')
      await expect(stories.first()).toBeVisible()

      // Should have multiple stories
      const storyCount = await stories.count()
      expect(storyCount).toBeGreaterThan(0)
    })

    test('navigates between different feeds', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Click on "New" feed
      await page.click('[data-feed="new"]')
      await expect(page.locator('[data-feed="new"]')).toHaveClass(/active/)

      // Wait for stories to reload
      await page.waitForTimeout(1000) // Brief pause for feed switch

      // Click on "Ask" feed
      await page.click('[data-feed="ask"]')
      await expect(page.locator('[data-feed="ask"]')).toHaveClass(/active/)

      // Click back on "Top" feed
      await page.click('[data-feed="top"]')
      await expect(page.locator('[data-feed="top"]')).toHaveClass(/active/)
    })

    test('story cards display required information', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      const firstStory = page.locator('.story').first()

      // Should have title
      await expect(firstStory.locator('.story-title')).toBeVisible()

      // Should have meta information (score, author, time)
      await expect(firstStory.locator('.story-meta')).toBeVisible()
      await expect(firstStory.locator('.story-score')).toBeVisible()
      await expect(firstStory.locator('.story-by')).toBeVisible()
      await expect(firstStory.locator('.story-time')).toBeVisible()
    })
  })

  test.describe('Story Detail View', () => {
    test('navigates to story detail when clicking a story', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Click on the first story
      await page.locator('.story').first().click()

      // Should show story detail view
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Should have story title
      await expect(page.locator('.story-detail-title')).toBeVisible()

      // Should have back button
      await expect(page.locator('.back-btn')).toBeVisible()
    })

    test('back button returns to list view', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to detail view
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Click back button
      await page.locator('.back-btn').click()

      // Should return to list view
      await waitForStories(page)
      await expect(page.locator('.story-detail')).toBeHidden()
    })

    test('story detail shows metadata', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to detail view
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Should show story meta information
      await expect(page.locator('.story-detail-meta')).toBeVisible()
    })
  })

  test.describe('Comment View', () => {
    test('displays comments section in story detail', async ({ page }) => {
      // Go to Ask HN which typically has comments
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Switch to Ask feed (more likely to have comments)
      await page.click('[data-feed="ask"]')
      await page.waitForTimeout(2000) // Wait for feed switch

      const hasAskStories = await storiesLoaded(page)
      if (!hasAskStories) {
        test.skip(true, 'No Ask HN stories available')
        return
      }

      // Click on a story
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Wait for comments section (may or may not have comments)
      await expect(page.locator('.comments-section')).toBeVisible({ timeout: 15000 })

      // Should have comments list container
      await expect(page.locator('.comments-list')).toBeVisible()
    })

    test('comments have expected structure when present', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Switch to Ask feed
      await page.click('[data-feed="ask"]')
      await page.waitForTimeout(2000)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'No Ask HN stories available')
        return
      }

      // Click on a story
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Wait for comments to potentially load
      await page.waitForTimeout(3000)

      // If comments exist, check their structure
      const comments = page.locator('.comment')
      const commentCount = await comments.count()

      if (commentCount > 0) {
        const firstComment = comments.first()
        // Comment should have body
        await expect(firstComment.locator('.comment-body')).toBeVisible()
        // Comment should have meta (author, time)
        await expect(firstComment.locator('.comment-meta')).toBeVisible()
      }
    })

    test('comment collapse toggle works when comments exist', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Switch to Ask feed
      await page.click('[data-feed="ask"]')
      await page.waitForTimeout(2000)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'No Ask HN stories available')
        return
      }

      // Click on a story
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Wait for comments to load
      await page.waitForTimeout(3000)

      const collapseBtn = page.locator('.comment-collapse').first()
      const collapseExists = (await collapseBtn.count()) > 0

      if (collapseExists) {
        // Get the parent comment element
        const comment = page.locator('.comment').first()

        // Click collapse button
        await collapseBtn.click()

        // Comment should be collapsed
        await expect(comment).toHaveAttribute('data-collapsed', 'true')

        // Click again to expand
        await collapseBtn.click()

        // Comment should be expanded
        await expect(comment).toHaveAttribute('data-collapsed', 'false')
      } else {
        test.skip(true, 'No comments with collapse button found')
      }
    })
  })

  test.describe('Zen Mode', () => {
    test('toggles zen mode with keyboard shortcut', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Initially not in zen mode
      await expect(page.locator('html')).not.toHaveClass(/zen-mode/)

      // Press 'z' to toggle zen mode
      await page.keyboard.press('z')

      // Should be in zen mode
      await expect(page.locator('html')).toHaveClass(/zen-mode/)

      // Should show zen mode badge
      await expect(page.locator('.zen-mode-badge')).toBeVisible()

      // Wait for transition lock to release (200ms + buffer)
      await page.waitForTimeout(300)

      // Press 'z' again to exit zen mode
      await page.keyboard.press('z')

      // Should not be in zen mode anymore
      await expect(page.locator('html')).not.toHaveClass(/zen-mode/, {
        timeout: 10000,
      })

      // Badge should be hidden
      await expect(page.locator('.zen-mode-badge')).toBeHidden()
    })

    test('zen mode hides header and navigation', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Header should be visible initially
      await expect(page.locator('header')).toBeVisible()

      // Enter zen mode
      await page.keyboard.press('z')
      await expect(page.locator('html')).toHaveClass(/zen-mode/)

      // Header should be hidden in zen mode
      await expect(page.locator('header')).toBeHidden()

      // Wait for transition lock to release (200ms + buffer)
      await page.waitForTimeout(300)

      // Exit zen mode
      await page.keyboard.press('z')

      // Header should be visible again
      await expect(page.locator('header')).toBeVisible({ timeout: 10000 })
    })

    test('zen mode works in story detail view', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to detail view
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Enter zen mode
      await page.keyboard.press('z')

      // Should be in zen mode
      await expect(page.locator('html')).toHaveClass(/zen-mode/)
      await expect(page.locator('.zen-mode-badge')).toBeVisible()

      // Story detail should still be visible
      await expect(page.locator('.story-detail')).toBeVisible()

      // Exit zen mode
      await page.keyboard.press('z')
      await expect(page.locator('html')).not.toHaveClass(/zen-mode/)
    })
  })

  test.describe('Theme Toggle', () => {
    test('toggles theme with button click', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Get initial theme
      const initialTheme = await page.locator('html').getAttribute('data-theme')

      // Click theme toggle button
      await page.click('#theme-toggle')

      // Theme should change
      const newTheme = await page.locator('html').getAttribute('data-theme')
      expect(newTheme).not.toBe(initialTheme)

      // Click again to toggle back
      await page.click('#theme-toggle')

      // Should be back to initial theme
      const finalTheme = await page.locator('html').getAttribute('data-theme')
      expect(finalTheme).toBe(initialTheme)
    })

    test('toggles theme with keyboard shortcut', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Get initial theme
      const initialTheme = await page.locator('html').getAttribute('data-theme')

      // Press 'd' to toggle theme
      await page.keyboard.press('d')

      // Theme should change
      const newTheme = await page.locator('html').getAttribute('data-theme')
      expect(newTheme).not.toBe(initialTheme)
    })

    test('theme persists across navigation', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Toggle theme
      await page.click('#theme-toggle')
      const themeAfterToggle = await page.locator('html').getAttribute('data-theme')

      // Navigate to story detail
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Theme should persist
      const themeInDetail = await page.locator('html').getAttribute('data-theme')
      expect(themeInDetail).toBe(themeAfterToggle)

      // Navigate back
      await page.locator('.back-btn').click()
      await waitForStories(page)

      // Theme should still persist
      const themeAfterBack = await page.locator('html').getAttribute('data-theme')
      expect(themeAfterBack).toBe(themeAfterToggle)
    })

    test('theme toggle shows correct icon for current theme', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      const themeToggle = page.locator('#theme-toggle')
      const currentTheme = await page.locator('html').getAttribute('data-theme')

      if (currentTheme === 'dark') {
        // In dark mode, sun icon should be visible (to switch to light)
        await expect(themeToggle.locator('.icon-sun')).toBeVisible()
        await expect(themeToggle.locator('.icon-moon')).toBeHidden()
      } else {
        // In light mode, moon icon should be visible (to switch to dark)
        await expect(themeToggle.locator('.icon-moon')).toBeVisible()
        await expect(themeToggle.locator('.icon-sun')).toBeHidden()
      }

      // Toggle and verify icon changes
      await themeToggle.click()
      const newTheme = await page.locator('html').getAttribute('data-theme')

      if (newTheme === 'dark') {
        await expect(themeToggle.locator('.icon-sun')).toBeVisible()
        await expect(themeToggle.locator('.icon-moon')).toBeHidden()
      } else {
        await expect(themeToggle.locator('.icon-moon')).toBeVisible()
        await expect(themeToggle.locator('.icon-sun')).toBeHidden()
      }
    })
  })

  test.describe('Theme in Zen Mode', () => {
    test('theme toggle works while in zen mode', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Enter zen mode
      await page.keyboard.press('z')
      await expect(page.locator('html')).toHaveClass(/zen-mode/)

      // Get initial theme
      const initialTheme = await page.locator('html').getAttribute('data-theme')

      // Toggle theme using keyboard (header is hidden in zen mode)
      await page.keyboard.press('d')

      // Theme should change while staying in zen mode
      const newTheme = await page.locator('html').getAttribute('data-theme')
      expect(newTheme).not.toBe(initialTheme)
      await expect(page.locator('html')).toHaveClass(/zen-mode/)
    })

    test('story cards visible in zen mode with correct theme', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Enter zen mode
      await page.keyboard.press('z')
      await expect(page.locator('html')).toHaveClass(/zen-mode/)

      // Toggle to different theme
      await page.keyboard.press('d')
      const currentTheme = await page.locator('html').getAttribute('data-theme')

      // Verify story cards are still visible
      await expect(page.locator('.story').first()).toBeVisible()

      // Verify zen mode is still active
      await expect(page.locator('html')).toHaveClass(/zen-mode/)
      await expect(page.locator('html')).toHaveAttribute('data-theme', currentTheme!)
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('j/k keys navigate between stories', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Press 'j' to select first story
      await page.keyboard.press('j')

      // First story should be selected
      const firstStory = page.locator('.story').first()
      await expect(firstStory).toHaveClass(/story-selected/)

      // Press 'j' again to select next story
      await page.keyboard.press('j')

      // Second story should be selected
      const secondStory = page.locator('.story').nth(1)
      await expect(secondStory).toHaveClass(/story-selected/)
      await expect(firstStory).not.toHaveClass(/story-selected/)

      // Press 'k' to go back to first story
      await page.keyboard.press('k')
      await expect(firstStory).toHaveClass(/story-selected/)
    })

    test('Enter key opens selected story', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Select first story with 'j'
      await page.keyboard.press('j')
      await expect(page.locator('.story').first()).toHaveClass(/story-selected/)

      // Press Enter to open
      await page.keyboard.press('Enter')

      // Should navigate to story detail
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })
    })

    test('Escape key returns from detail to list', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to detail view
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Press Escape to go back
      await page.keyboard.press('Escape')

      // Should return to list view
      await waitForStories(page)
      await expect(page.locator('.story-detail')).toBeHidden()
    })

    test('? key shows help modal', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Press '?' to show help - type the character directly
      await page.keyboard.type('?')

      // Help modal overlay should be visible (contains .help-modal inside)
      await expect(page.locator('.help-modal-overlay')).toBeVisible()
      await expect(page.locator('.help-modal')).toBeVisible()

      // Press Escape to close
      await page.keyboard.press('Escape')

      // Help modal should be removed from DOM
      await expect(page.locator('.help-modal-overlay')).toBeHidden()
    })

    test('number keys switch feeds (1-6)', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Press '2' for "new" feed
      await page.keyboard.press('2')
      await expect(page.locator('[data-feed="new"]')).toHaveClass(/active/)

      // Press '3' for "best" feed
      await page.keyboard.press('3')
      await expect(page.locator('[data-feed="best"]')).toHaveClass(/active/)

      // Press '1' for "top" feed
      await page.keyboard.press('1')
      await expect(page.locator('[data-feed="top"]')).toHaveClass(/active/)

      // Press '4' for "ask" feed
      await page.keyboard.press('4')
      await expect(page.locator('[data-feed="ask"]')).toHaveClass(/active/)
    })
  })

  test.describe('User Profile', () => {
    test('navigates to user profile when clicking username', async ({
      page,
    }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Get the first user link
      const userLink = page.locator('.user-link').first()
      const username = await userLink.textContent()

      // Click on the user link
      await userLink.click()

      // Should navigate to user profile
      await expect(page.locator('.user-profile')).toBeVisible({ timeout: 15000 })
      await expect(page.locator('.user-name')).toContainText(username || '')
    })

    test('user profile displays karma and account age', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to user profile
      await page.locator('.user-link').first().click()
      await expect(page.locator('.user-profile')).toBeVisible({ timeout: 15000 })

      // Should show karma and account age
      await expect(page.locator('.user-karma')).toBeVisible()
      await expect(page.locator('.user-age')).toBeVisible()
    })

    test('back button returns from user profile', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to user profile
      await page.locator('.user-link').first().click()
      await expect(page.locator('.user-profile')).toBeVisible({ timeout: 15000 })

      // Click back button
      await page.locator('.back-btn').click()

      // Should return to list view
      await waitForStories(page)
      await expect(page.locator('.user-profile')).toBeHidden()
    })
  })

  test.describe('Settings Panel', () => {
    test('opens settings by clicking settings button', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Click settings button to open settings
      await page.click('#settings-toggle')

      // Settings modal should be visible
      await expect(page.locator('.settings-modal')).toBeVisible()
      await expect(page.locator('.settings-title')).toBeVisible()
    })

    test('closes settings with Escape key', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Open settings by clicking button
      await page.click('#settings-toggle')
      await expect(page.locator('.settings-modal')).toBeVisible()

      // Close with Escape
      await page.keyboard.press('Escape')
      await expect(page.locator('.settings-modal')).toBeHidden()
    })

    test('closes settings by clicking overlay', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Open settings by clicking button
      await page.click('#settings-toggle')
      await expect(page.locator('.settings-modal')).toBeVisible()

      // Click overlay to close
      await page.locator('.settings-modal-overlay').click({
        position: { x: 10, y: 10 },
      })
      await expect(page.locator('.settings-modal')).toBeHidden()
    })

    test('can change font size in settings', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Open settings by clicking button
      await page.click('#settings-toggle')
      await expect(page.locator('.settings-modal')).toBeVisible()

      // Click the "Comfortable" font size option (largest)
      await page.click('[data-setting="fontSize"][data-value="comfortable"]')

      // Verify the option is now active
      await expect(
        page.locator('[data-setting="fontSize"][data-value="comfortable"]')
      ).toHaveClass(/active/)
    })
  })

  test.describe('Search', () => {
    test('opens search with / key', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Press '/' to open search
      await page.keyboard.press('/')

      // Search modal should be visible
      await expect(page.locator('.search-modal')).toBeVisible()
      await expect(page.locator('.search-input')).toBeFocused()
    })

    test('closes search with Escape key', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Open search
      await page.keyboard.press('/')
      await expect(page.locator('.search-modal')).toBeVisible()

      // Close with Escape
      await page.keyboard.press('Escape')
      await expect(page.locator('.search-modal')).toBeHidden()
    })
  })

  test.describe('Share and Copy', () => {
    test('copy HN link button is present in story detail', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to story detail
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Copy HN link button should be visible
      await expect(page.locator('[data-action="copy-hn-link"]')).toBeVisible()
    })

    test('share button is present in story detail', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to story detail
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Share button should be visible
      await expect(page.locator('[data-action="share"]')).toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test('skip link is present and focusable', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // Skip link should exist
      const skipLink = page.locator('.skip-link')
      await expect(skipLink).toBeAttached()

      // Tab to it
      await page.keyboard.press('Tab')
      await expect(skipLink).toBeFocused()
      await expect(skipLink).toBeVisible()
    })

    test('stories have accessible labels', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // First story should have aria-label
      const firstStory = page.locator('.story').first()
      const ariaLabel = await firstStory.getAttribute('aria-label')

      expect(ariaLabel).toBeTruthy()
      expect(ariaLabel).toContain('points')
      expect(ariaLabel).toContain('comments')
    })

    test('story detail has proper heading hierarchy', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      if (!(await storiesLoaded(page))) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Navigate to story detail
      await page.locator('.story').first().click()
      await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })

      // Should have h1 for story title
      await expect(page.locator('h1.story-detail-title')).toBeVisible()
    })

    test('ARIA announcer region exists', async ({ page }) => {
      await page.goto('/')
      await waitForStories(page)

      // ARIA live region should exist for announcements
      const announcer = page.locator('#announcer')
      await expect(announcer).toBeAttached()
      await expect(announcer).toHaveAttribute('aria-live', 'polite')
    })
  })
})

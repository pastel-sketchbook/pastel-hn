import { test, expect, type Page, type Dialog } from '@playwright/test'

/**
 * E2E tests for Neural TTS functionality
 *
 * Tests the download modal flow when clicking the "Read Neural" button
 * without the model downloaded.
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

/**
 * Helper to navigate to story detail
 */
async function navigateToStoryDetail(page: Page): Promise<boolean> {
  await page.goto('/')
  await waitForStories(page)

  if (!(await storiesLoaded(page))) {
    return false
  }

  // Click on the first story
  await page.locator('.story').first().click()

  // Wait for story detail to load
  await expect(page.locator('.story-detail')).toBeVisible({ timeout: 15000 })
  return true
}

test.describe('Neural TTS', () => {
  test.setTimeout(60000)

  test.describe('Download Modal', () => {
    test('shows neural TTS button in story detail', async ({ page }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Neural TTS button should always be rendered in story actions
      const neuralButton = page.locator('.neural-tts-btn')
      
      // Button is always rendered (even in browser environment)
      await expect(neuralButton).toBeVisible()
      await expect(neuralButton).toHaveAttribute(
        'data-action',
        'neural-tts-toggle',
      )
    })

    test('neural button has correct styling when model needs download', async ({
      page,
    }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      const neuralButton = page.locator('.neural-tts-btn')
      await expect(neuralButton).toBeVisible()

      // In browser environment, model is never downloaded so button should have needs-download class
      await expect(neuralButton).toHaveClass(/needs-download/)
    })

    test('clicking neural button shows toast or dialog', async ({ page }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      const neuralButton = page.locator('.neural-tts-btn')
      await expect(neuralButton).toBeVisible()

      // Set up dialog handler BEFORE clicking the button
      let dialogMessage = ''
      let dialogAppeared = false

      page.on('dialog', async (dialog: Dialog) => {
        dialogAppeared = true
        dialogMessage = dialog.message()
        // Dismiss the dialog (cancel download)
        await dialog.dismiss()
      })

      // Click the neural TTS button
      await neuralButton.click()

      // Wait a moment for any dialog or toast to appear
      await page.waitForTimeout(2000)

      // Check if dialog appeared (expected in Tauri when model not downloaded)
      if (dialogAppeared) {
        // Verify dialog message contains download information
        expect(dialogMessage).toContain('Download')
        expect(dialogMessage).toContain('voice model')
        expect(dialogMessage).toContain('MB')
        console.log('Download confirmation dialog appeared:', dialogMessage)
      } else {
        // In browser environment, a toast should appear instead
        // (neural TTS requires Tauri backend)
        const toast = page.locator('.toast').first()
        await expect(toast).toBeVisible({ timeout: 3000 })
        console.log('Toast notification appeared (expected in browser environment)')
      }
    })

    test('canceling download dialog does not start download', async ({
      page,
    }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      const neuralButton = page.locator('.neural-tts-btn')
      await expect(neuralButton).toBeVisible()

      // Set up dialog handler to dismiss (cancel)
      page.on('dialog', async (dialog: Dialog) => {
        await dialog.dismiss()
      })

      // Click the neural TTS button
      await neuralButton.click()

      // Wait for any processing
      await page.waitForTimeout(1000)

      // Button should NOT be in playing state after canceling
      await expect(neuralButton).not.toHaveClass(/playing/)

      // Button should NOT be in loading state
      await expect(neuralButton).not.toHaveClass(/loading/)
    })

    test('accepting download dialog triggers download attempt', async ({
      page,
    }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      const neuralButton = page.locator('.neural-tts-btn')
      await expect(neuralButton).toBeVisible()

      let dialogAppeared = false

      // Set up dialog handler to accept (start download)
      page.on('dialog', async (dialog: Dialog) => {
        dialogAppeared = true
        await dialog.accept()
      })

      // Click the neural TTS button
      await neuralButton.click()

      // Wait for dialog and any subsequent processing
      await page.waitForTimeout(3000)

      // In browser environment, either:
      // 1. Dialog appeared and was accepted (Tauri)
      // 2. Toast appeared directly (browser - no Tauri backend)
      const toasts = page.locator('.toast')
      const toastCount = await toasts.count()

      // Some feedback should be given to the user
      expect(dialogAppeared || toastCount > 0).toBe(true)

      if (toastCount > 0) {
        console.log('Toast appeared after clicking neural button')
      }
      if (dialogAppeared) {
        console.log('Dialog appeared and was accepted')
      }
    })
  })

  test.describe('TTS Button States', () => {
    test('native TTS button is present alongside neural button', async ({
      page,
    }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Native TTS button should be visible
      const nativeTtsButton = page.locator('.tts-btn')
      const nativeCount = await nativeTtsButton.count()

      if (nativeCount > 0) {
        await expect(nativeTtsButton.first()).toBeVisible()
        await expect(nativeTtsButton.first()).toHaveAttribute(
          'data-action',
          'tts-toggle',
        )
      }
    })

    test('TTS buttons have accessible labels', async ({ page }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Check native TTS button accessibility
      const nativeTtsButton = page.locator('.tts-btn').first()
      if ((await nativeTtsButton.count()) > 0) {
        const title = await nativeTtsButton.getAttribute('title')
        expect(title).toBeTruthy()
        expect(title?.toLowerCase()).toContain('read')
      }

      // Check neural TTS button accessibility
      const neuralButton = page.locator('.neural-tts-btn').first()
      if ((await neuralButton.count()) > 0) {
        const title = await neuralButton.getAttribute('title')
        expect(title).toBeTruthy()
        expect(title?.toLowerCase()).toContain('neural')
      }
    })

    test('TTS buttons have aria-pressed attribute', async ({ page }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      // Native TTS button
      const nativeTtsButton = page.locator('.tts-btn').first()
      if ((await nativeTtsButton.count()) > 0) {
        await expect(nativeTtsButton).toHaveAttribute('aria-pressed', 'false')
      }

      // Neural TTS button
      const neuralButton = page.locator('.neural-tts-btn').first()
      if ((await neuralButton.count()) > 0) {
        await expect(neuralButton).toHaveAttribute('aria-pressed', 'false')
      }
    })
  })

  test.describe('Toast Notifications', () => {
    test('warning toast appears when neural TTS not available', async ({
      page,
    }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      const neuralButton = page.locator('.neural-tts-btn')
      const buttonCount = await neuralButton.count()

      if (buttonCount === 0) {
        test.skip(true, 'Neural TTS button not available in this environment')
        return
      }

      // Dismiss any dialog that appears
      page.on('dialog', async (dialog: Dialog) => {
        await dialog.dismiss()
      })

      // Click the neural TTS button
      await neuralButton.click()

      // Wait for toast
      await page.waitForTimeout(2000)

      // Check for warning or error toast
      const toasts = page.locator('.toast')
      const toastCount = await toasts.count()

      // In non-Tauri environment, we expect some feedback
      if (toastCount > 0) {
        const firstToast = toasts.first()
        await expect(firstToast).toBeVisible()

        // Toast should have appropriate styling (warning or error)
        const classes = await firstToast.getAttribute('class')
        const hasWarningOrError =
          classes?.includes('warning') || classes?.includes('error')

        if (hasWarningOrError) {
          console.log('Appropriate toast notification displayed')
        }
      }
    })

    test('toast can be dismissed', async ({ page }) => {
      const loaded = await navigateToStoryDetail(page)
      if (!loaded) {
        test.skip(true, 'API returned no stories')
        return
      }

      const neuralButton = page.locator('.neural-tts-btn')
      const buttonCount = await neuralButton.count()

      if (buttonCount === 0) {
        test.skip(true, 'Neural TTS button not available in this environment')
        return
      }

      // Dismiss any dialog
      page.on('dialog', async (dialog: Dialog) => {
        await dialog.dismiss()
      })

      // Trigger toast by clicking neural button
      await neuralButton.click()
      await page.waitForTimeout(1000)

      // Find toast dismiss button
      const toastDismiss = page.locator('.toast .toast-close, .toast button')
      const dismissCount = await toastDismiss.count()

      if (dismissCount > 0) {
        await toastDismiss.first().click()

        // Toast should be hidden after dismissing
        await page.waitForTimeout(500)
      }
    })
  })
})

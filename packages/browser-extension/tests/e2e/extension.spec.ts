import { test, expect, chromium, BrowserContext } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Chrome Extension E2E Tests
 * 
 * These tests load the actual extension and test real browser behavior
 */

let context: BrowserContext
let extensionId: string

test.beforeAll(async () => {
  // Path to the built extension
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const pathToExtension = path.join(__dirname, '../../dist/chrome-mv3')
  
  // Launch Chrome with the extension loaded
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      '--disable-web-security', // For testing CORS
      '--disable-features=VizDisplayCompositor'
    ]
  })

  // Get the extension ID
  let [background] = context.serviceWorkers()
  if (!background) {
    background = await context.waitForEvent('serviceworker')
  }

  extensionId = background.url().split('/')[2]
  console.log('Extension ID:', extensionId)
})

test.afterAll(async () => {
  await context.close()
})

test.describe('CORS Unlocker Extension', () => {
  test('should load extension successfully', async () => {
    const page = await context.newPage()
    
    // Navigate to extension popup
    await page.goto(`chrome-extension://${extensionId}/popup/index.html`)
    
    // Check if popup loads
    await expect(page.locator('text=CORS Unlocker')).toBeVisible()
  })

  test('should enable CORS for a domain', async () => {
    const page = await context.newPage()
    
    // Navigate to a test page
    await page.goto('https://example.com')
    
    // Open extension popup
    await page.goto(`chrome-extension://${extensionId}/popup/index.html`)
    
    // Enable CORS
    const enableButton = page.locator('[data-testid="enable-cors"]')
    if (await enableButton.isVisible()) {
      await enableButton.click()
    }
    
    // Check if CORS is enabled
    await expect(page.locator('[data-testid="cors-status"]')).toContainText('Enabled')
  })

  test('should toggle site auth', async () => {
    const page = await context.newPage()
    
    await page.goto(`chrome-extension://${extensionId}/popup/index.html`)
    
    // Find and toggle site auth switch
    const siteAuthSwitch = page.locator('[data-testid="site-auth-switch"]')
    if (await siteAuthSwitch.isVisible()) {
      await siteAuthSwitch.click()
      
      // Verify the state changed
      await expect(siteAuthSwitch).toBeChecked()
    }
  })

  test('should open options page', async () => {
    const page = await context.newPage()
    
    await page.goto(`chrome-extension://${extensionId}/popup/index.html`)
    
    // Click on settings/options link
    const optionsLink = page.locator('[data-testid="options-link"]')
    if (await optionsLink.isVisible()) {
      await optionsLink.click()
      
      // Should navigate to options page
      await expect(page.url()).toContain('options/index.html')
    }
  })
})

test.describe('CORS Functionality', () => {
  test('should handle CORS preflight requests', async () => {
    const page = await context.newPage()
    
    // Monitor network requests
    const requests: string[] = []
    page.on('request', request => {
      requests.push(`${request.method()} ${request.url()}`)
    })
    
    // Navigate to test page and make CORS request
    await page.goto('https://httpbin.org')
    
    // Inject test script to make CORS request
    await page.evaluate(async () => {
      try {
        const response = await fetch('https://api.github.com/repos/oe/cors-unlocker', {
          method: 'GET',
          headers: {
            'X-Custom-Header': 'test'
          }
        })
        return response.ok
      } catch (error) {
        console.error('CORS test failed:', error)
        return false
      }
    })
    
    // Check if OPTIONS request was made (preflight)
    const hasOptionsRequest = requests.some(req => req.startsWith('OPTIONS'))
    expect(hasOptionsRequest).toBe(true)
  })
})

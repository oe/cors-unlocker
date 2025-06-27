import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ext-config before importing storage
vi.mock('../../src/common/ext-config', () => ({
  extConfig: {
    init: vi.fn(),
    get: vi.fn(() => ({
      dftEnableCredentials: false,
      debugMode: false,
      maxRules: 100,
      autoCleanupDays: 30
    })),
    save: vi.fn(),
    reset: vi.fn(),
    validateConfig: vi.fn((cfg) => cfg),
    needsMigration: vi.fn(() => false)
  }
}))

// Mock logger
vi.mock('../../src/common/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock webextension-polyfill with proper hoisting
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
        remove: vi.fn(() => Promise.resolve()),
        clear: vi.fn(() => Promise.resolve())
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    runtime: {
      sendMessage: vi.fn(() => Promise.resolve()),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  }
}))

describe('storage.ts', () => {
  // Import after mocking to ensure proper isolation
  let dataStorage: any
  
  beforeEach(async () => {
    vi.clearAllMocks()
    
    // Re-import the module to get fresh instance
    vi.resetModules()
    const storageModule = await import('../../src/common/storage')
    dataStorage = storageModule.dataStorage
    
    // Import browser mock after clearing
    const { default: browser } = await import('webextension-polyfill')
    
    // Reset mock behavior with proper return values
    ;(browser.storage.local.get as any).mockResolvedValue({})
    ;(browser.storage.local.set as any).mockResolvedValue(undefined)
  })

  describe('dataStorage.getRules', () => {
    it('should return cached rules if available', async () => {
      const mockRules = [
        { id: 1, origin: 'example.com', disabled: false, credentials: false }
      ]
      
      // Set cached rules
      dataStorage.updateCachedRules(mockRules)
      const result = await dataStorage.getRules()
      
      expect(result).toEqual(mockRules)
      
      // Import browser to check calls
      const { default: browser } = await import('webextension-polyfill')
      // Should not call storage when using cache
      expect(browser.storage.local.get).not.toHaveBeenCalled()
    })

    it('should load rules from storage when cache is empty', async () => {
      const mockRules = [
        { id: 1, origin: 'example.com', disabled: false, credentials: false }
      ]
      
      // Import browser mock
      const { default: browser } = await import('webextension-polyfill')
      
      // Setup mock to return rules from storage
      ;(browser.storage.local.get as any).mockResolvedValue({
        allowedOrigins: mockRules
      })

      // getRules should load from storage when no cache
      const result = await dataStorage.getRules()
      
      expect(browser.storage.local.get).toHaveBeenCalledWith('allowedOrigins')
      expect(result).toEqual(mockRules)
    })

    it('should handle storage errors gracefully', async () => {
      // Import browser mock
      const { default: browser } = await import('webextension-polyfill')
      
      // Setup mock to reject
      ;(browser.storage.local.get as any).mockRejectedValue(new Error('Storage error'))

      // getRules should return empty array on error
      const result = await dataStorage.getRules()
      
      expect(result).toEqual([])
    })
  })
})

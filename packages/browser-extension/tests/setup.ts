import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock chrome API globally
global.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    lastError: null,
    id: 'test-extension-id'
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn()
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn()
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    }
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn()
  },
  declarativeNetRequest: {
    updateDynamicRules: vi.fn(),
    getDynamicRules: vi.fn()
  }
} as any

// Mock webextension-polyfill globally for components that import it directly
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

// Mock ext-config globally
vi.mock('../src/common/ext-config', () => ({
  extConfig: {
    init: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => ({
      dftEnableCredentials: false,
      debugMode: false,
      maxRules: 100,
      autoCleanupDays: 30
    })),
    save: vi.fn(() => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
    validateConfig: vi.fn((cfg) => cfg),
    needsMigration: vi.fn(() => false)
  }
}))

// Mock logger globally
vi.mock('../src/common/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

// Mock browser API for Firefox
global.browser = global.chrome

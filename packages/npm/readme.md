# cors-unlocker

A lightweight npm package for seamlessly managing Cross-Origin Resource Sharing (CORS) settings through the [CORS Unlocker browser extension](https://cors.forth.ink/). Perfect for API testing, development, and cross-origin communication.

[![npm version](https://badge.fury.io/js/cors-unlocker.svg)](https://www.npmjs.com/package/cors-unlocker)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-typescript-blue)](https://www.typescriptlang.org/)
[![Gzipped Size](https://img.shields.io/badge/gzipped-1.7KB-brightgreen)](https://www.npmjs.com/package/cors-unlocker)

## 🚀 Quick Start

### Installation

```bash
# Using npm
npm install cors-unlocker

# Using yarn  
yarn add cors-unlocker

# Using pnpm
pnpm add cors-unlocker
```

### Basic Usage

```typescript
import appCors from 'cors-unlocker';

// Check if extension is installed
const isInstalled = await appCors.isExtInstalled();

// Enable CORS (will prompt user for confirmation if needed)
const status = await appCors.enable({
  credentials: true,
  reason: 'Testing cross-origin API requests'
});

console.log('CORS enabled:', status.enabled, 'Credentials:', status.credentials);
```

## 🔧 How it Works

This package communicates with the [CORS Unlocker browser extension](https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng) through a secure iframe bridge. When CORS is enabled, the extension intelligently modifies HTTP responses by adding necessary `Access-Control-Allow-Origin` headers, enabling cross-origin requests without server-side changes.

### Key Features

- 🛡️ **Secure Communication**: Uses iframe messaging for safe extension interaction
- ⚡ **Lightweight**: Only 1.7KB gzipped - minimal impact on your application  
- 🎯 **Smart Defaults**: Automatically reads extension configuration for credentials
- 🚫 **No Timeouts**: User confirmation dialogs have no artificial time limits
- 📘 **TypeScript Ready**: Full type definitions included
- 🔄 **Reliable**: Handles race conditions and communication errors gracefully

## 📚 API Reference

### Extension Detection

#### `isExtInstalled(): Promise<boolean>`

Checks if the CORS Unlocker extension is available in the browser.

```typescript
try {
  const isInstalled = await appCors.isExtInstalled();
  if (!isInstalled) {
    console.log('Please install the CORS Unlocker extension');
    appCors.openStorePage(); // Opens extension store
  }
} catch (error) {
  console.error('Extension check failed:', error.message);
}
```

**Returns:** `Promise<boolean>`  
**Throws:** `AppCorsError` for communication failures

---

### CORS Status Management

#### `isEnabled(): Promise<{ enabled: boolean, credentials: boolean }>`

Retrieves the current CORS status for the active page.

```typescript
try {
  const status = await appCors.isEnabled();
  console.log('CORS Status:', status);
  // Returns: { enabled: boolean, credentials: boolean }
} catch (error) {
  console.error('Failed to get CORS status:', error.message);
}
```

**Returns:** `Promise<{ enabled: boolean, credentials: boolean }>`  
**Throws:** `AppCorsError` for various error conditions

---

### Enable CORS

#### `enable(options?: IEnableOptions): Promise<{ enabled: boolean, credentials: boolean }>`

Activates CORS for the current page. May require user confirmation and has no timeout limit to ensure reliable operation.

```typescript
interface IEnableOptions {
  credentials?: boolean; // Use extension default if not specified
  reason?: string;       // Message shown to user during confirmation
}
```

**Examples:**

```typescript
// Use extension's default credentials setting
const status = await appCors.enable();

// Enable with explicit credentials
const authStatus = await appCors.enable({ 
  credentials: true,
  reason: 'Testing authenticated API endpoints'
});

// Enable without credentials
const basicStatus = await appCors.enable({ 
  credentials: false,
  reason: 'Public API testing'
});

console.log('CORS enabled:', authStatus.enabled);
console.log('Credentials allowed:', authStatus.credentials);
```

**Parameters:**
- `credentials` (optional): Enable credential-based requests. If not specified, uses the extension's default setting
- `reason` (optional): Description shown to user during confirmation dialog

**Returns:** `Promise<{ enabled: boolean, credentials: boolean }>` - The resulting CORS status  
**Throws:** `AppCorsError` for various error conditions including user cancellation

**Note:** This method may require user confirmation and has no timeout limit to avoid race conditions. The operation completes when the user responds or a natural system timeout occurs.

---

### Disable CORS

#### `disable(): Promise<void>`

Safely disables CORS for the current page.

```typescript
try {
  await appCors.disable();
  console.log('CORS disabled successfully');
} catch (error) {
  console.error('Failed to disable CORS:', error.message);
}
```

**Returns:** `Promise<void>`  
**Throws:** `AppCorsError` for various error conditions

---

### Extension Management

#### `openExtOptions(): Promise<void>`

Opens the extension's options/settings page.

```typescript
try {
  await appCors.openExtOptions();
} catch (error) {
  console.error('Failed to open options:', error.message);
}
```

#### `openStorePage(): void`

Opens the browser's extension store page for CORS Unlocker installation.

```typescript
// Redirect user to install the extension
appCors.openStorePage();
```

## 🎯 Practical Examples

### Basic API Testing

```typescript
import appCors from 'cors-unlocker';

async function testAPI() {
  try {
    // Check if extension is available
    if (!(await appCors.isExtInstalled())) {
      console.log('Extension not found, redirecting to store...');
      appCors.openStorePage();
      return;
    }

    // Enable CORS for testing
    await appCors.enable({ 
      reason: 'Testing third-party API integration' 
    });

    // Now you can make cross-origin requests
    const response = await fetch('https://api.example.com/data');
    const data = await response.json();
    console.log('API Response:', data);

    // Cleanup: disable CORS when done
    await appCors.disable();
  } catch (error) {
    console.error('API test failed:', error.message);
  }
}
```

### Authenticated Requests

```typescript
async function testAuthenticatedAPI() {
  try {
    // Enable CORS with credentials support
    const status = await appCors.enable({ 
      credentials: true,
      reason: 'Testing authenticated endpoints with cookies/headers'
    });

    if (status.credentials) {
      // Make authenticated cross-origin request
      const response = await fetch('https://api.example.com/user/profile', {
        credentials: 'include',
        headers: {
          'Authorization': 'Bearer your-token-here'
        }
      });
      
      const userData = await response.json();
      console.log('User data:', userData);
    }
  } catch (error) {
    console.error('Authenticated request failed:', error.message);
  }
}
```

### React Hook Integration

```typescript
import { useState, useEffect } from 'react';
import appCors from 'cors-unlocker';

function useCORS() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [corsStatus, setCorsStatus] = useState({ enabled: false, credentials: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const installed = await appCors.isExtInstalled();
        setIsInstalled(installed);
        
        if (installed) {
          const status = await appCors.isEnabled();
          setCorsStatus(status);
        }
      } catch (error) {
        console.error('Failed to check CORS status:', error);
      } finally {
        setLoading(false);
      }
    }
    
    checkStatus();
  }, []);

  const toggleCORS = async () => {
    try {
      if (corsStatus.enabled) {
        await appCors.disable();
        setCorsStatus({ enabled: false, credentials: false });
      } else {
        const newStatus = await appCors.enable({
          reason: 'Enable CORS for API testing'
        });
        setCorsStatus(newStatus);
      }
    } catch (error) {
      console.error('Failed to toggle CORS:', error);
    }
  };

  return { isInstalled, corsStatus, loading, toggleCORS };
}
```

## ⚠️ Error Handling

All async methods throw `AppCorsError` when operations fail. The error object provides detailed information for both debugging and user-friendly error handling.

### Error Object Structure

```typescript
class AppCorsError extends Error {
  readonly type: CorsErrorType;
  readonly message: string;
}
```

### Error Types Reference

| Error Type | Description | Common Causes |
|------------|-------------|---------------|
| `not-installed` | Extension is not installed or not responding | User needs to install the CORS Unlocker extension |
| `user-cancel` | User canceled the operation | User clicked "Cancel" in confirmation dialog |
| `forbidden-origin` | Origin is not allowed to use the extension | Website is on extension's blocklist |
| `rate-limit` | Too many requests from this origin | Excessive API calls in short time |
| `unsupported-origin` | Origin protocol is not supported | Only http/https protocols are allowed |
| `communication-failed` | Failed to communicate with extension | Network issues or extension crash |
| `config-error` | Extension configuration error | Missing or invalid extension settings |
| `invalid-origin` | Origin format is invalid | Malformed URL or invalid domain |
| `inner-error` | Internal extension error | Extension bug or unexpected state |
| `unknown-error` | Unexpected error occurred | Fallback for unhandled errors |

### Comprehensive Error Handling

```typescript
import appCors, { AppCorsError } from 'cors-unlocker';

async function robustCORSHandling() {
  try {
    // Attempt to enable CORS
    const status = await appCors.enable({ 
      credentials: true,
      reason: 'Testing cross-origin API integration'
    });
    
    console.log('✅ CORS enabled successfully:', status);
    return status;
    
  } catch (error) {
    if (error instanceof AppCorsError) {
      // Handle specific CORS-related errors
      switch (error.type) {
        case 'not-installed':
          console.log('📦 Extension not found. Redirecting to installation...');
          appCors.openStorePage();
          break;
          
        case 'user-cancel':
          console.log('❌ User canceled the operation');
          // Maybe show a gentle reminder about CORS benefits
          break;
          
        case 'forbidden-origin':
          console.error('🚫 This website is not allowed to use CORS Unlocker');
          // Show alternative solutions or contact info
          break;
          
        case 'rate-limit':
          console.warn('⏳ Too many requests. Please wait a moment...');
          // Implement exponential backoff retry
          break;
          
        case 'unsupported-origin':
          console.error('🌐 CORS Unlocker only works on http/https websites');
          break;
          
        case 'communication-failed':
          console.error('📡 Communication failed. Extension may be disabled.');
          // Maybe retry or suggest extension troubleshooting
          break;
          
        default:
          console.error('❗ CORS operation failed:', error.message);
          console.error('Error type:', error.type);
      }
    } else {
      // Handle unexpected errors
      console.error('💥 Unexpected error:', error);
    }
    
    throw error; // Re-throw if you want calling code to handle it
  }
}
```

### Graceful Degradation Pattern

```typescript
async function makeRequestWithCORS(url: string) {
  let corsEnabled = false;
  
  try {
    // Try to enable CORS first
    if (await appCors.isExtInstalled()) {
      await appCors.enable({ reason: 'API request requires CORS' });
      corsEnabled = true;
    }
  } catch (error) {
    console.warn('CORS unavailable, falling back to alternative:', error.message);
  }
  
  try {
    // Make the actual request
    const response = await fetch(url, {
      credentials: corsEnabled ? 'include' : 'same-origin'
    });
    return await response.json();
  } catch (fetchError) {
    if (!corsEnabled) {
      throw new Error(`Request failed. CORS Unlocker extension might help. Original error: ${fetchError.message}`);
    }
    throw fetchError;
  } finally {
    // Cleanup: disable CORS when done
    if (corsEnabled) {
      try {
        await appCors.disable();
      } catch (error) {
        console.warn('Failed to disable CORS:', error.message);
      }
    }
  }
}
```

## 🔗 Related Resources

- **Browser Extension**: [Install CORS Unlocker](https://chrome.google.com/webstore) 
- **Website & Docs**: [https://cors.forth.ink](https://cors.forth.ink)
- **Playground**: [Interactive API Testing](https://cors.forth.ink/playground)
- **GitHub**: [Source Code & Issues](https://github.com/oe/cors-unlocker)

## 📄 License

MIT License

---

**Made with ❤️ for developers who need simple CORS solutions**
